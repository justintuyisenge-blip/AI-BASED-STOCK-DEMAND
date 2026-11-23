import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatRWF } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import {
  AiInsight,
  Forecast,
  ForecastDaily,
  Product,
} from '../types/database';
import {
  computeProductAlerts,
  fetchAllForecastDailyForRun,
} from '../lib/alerts';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { MarkdownContent } from '../components/ui/MarkdownContent';

function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const DashboardPage: React.FC = () => {
  const { user, profile } = useAuth();
  const isManager = profile?.role === 'manager';

  const [products, setProducts] = useState<Product[]>([]);
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [forecastDaily, setForecastDaily] = useState<ForecastDaily[]>([]);
  const [hasForecastRun, setHasForecastRun] = useState<boolean>(false);
  const [clerkSalesTodayCount, setClerkSalesTodayCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  // AI Insight state (Manager only)
  const [insight, setInsight] = useState<AiInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState<boolean>(false);
  const [insightError, setInsightError] = useState<string | null>(null);

  const requestAiInsight = async (forceRefresh: boolean) => {
    setInsightLoading(true);
    setInsightError(null);

    try {
      const { data, error } = await supabase.functions.invoke('ai-insights', {
        body: { force_refresh: forceRefresh },
      });

      if (error) {
        let friendlyMessage =
          'Could not refresh AI insight right now. Showing the last saved insight.';
        try {
          if (
            'context' in error &&
            error.context &&
            typeof (error.context as Response).json === 'function'
          ) {
            const errJson = await (error.context as Response).json();
            if (errJson?.error) {
              friendlyMessage = errJson.error;
            }
          } else if (error.message) {
            friendlyMessage = error.message;
          }
        } catch {
          // Keep default friendly fallback
        }
        setInsightError(friendlyMessage);
        setInsightLoading(false);
        return;
      }

      if (data?.error) {
        setInsightError(data.error);
        setInsightLoading(false);
        return;
      }

      if (data?.insight) {
        setInsight(data.insight as AiInsight);
      }
    } catch {
      setInsightError(
        'Unable to reach the AI insights service. Showing the previous saved insight.'
      );
    } finally {
      setInsightLoading(false);
    }
  };

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);

      // 1. Load active products
      const { data: prodData } = await supabase
        .from('products')
        .select(
          'id, name, sku, category_id, cost_price, selling_price, current_stock, reorder_level, is_active, categories(name)'
        )
        .eq('is_active', true)
        .order('name', { ascending: true });

      setProducts((prodData as unknown as Product[]) || []);

      // Clerk view: only low-stock products and the number of sales they recorded today
      if (!isManager) {
        if (user) {
          const { count } = await supabase
            .from('sales')
            .select('id', { count: 'exact', head: true })
            .eq('created_by', user.id)
            .eq('sold_on', getTodayDateString());
          setClerkSalesTodayCount(count || 0);
        }
        setLoading(false);
        return;
      }

      // Manager view: load latest saved AI insight immediately so it stays visible
      const { data: savedInsight } = await supabase
        .from('ai_insights')
        .select('id, content, generated_at')
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (savedInsight) {
        setInsight(savedInsight as AiInsight);
      }

      // Check latest forecast run
      const { data: latestRow } = await supabase
        .from('forecasts')
        .select('run_id, generated_at')
        .not('run_id', 'is', null)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latestRow?.run_id) {
        setHasForecastRun(false);
        setForecasts([]);
        setForecastDaily([]);
        setLoading(false);
        return;
      }

      setHasForecastRun(true);

      const [forecastsRes, dailyRes] = await Promise.all([
        supabase
          .from('forecasts')
          .select('*')
          .eq('run_id', latestRow.run_id),
        fetchAllForecastDailyForRun(supabase, latestRow.run_id),
      ]);

      setForecasts((forecastsRes.data as Forecast[]) || []);
      setForecastDaily((dailyRes.data as ForecastDaily[]) || []);
      setLoading(false);

      // If no saved insight exists yet, or latest forecast run is newer than saved insight,
      // call ai-insights (with force_refresh: false so the server cache guard protects rate limits)
      if (
        !savedInsight ||
        new Date(savedInsight.generated_at).getTime() <
          new Date(latestRow.generated_at).getTime()
      ) {
        requestAiInsight(false);
      }
    };

    loadDashboard();
  }, [isManager, user?.id]);

  // Low-stock items (used by both manager and clerk)
  const lowStockProducts = useMemo(
    () =>
      products
        .filter((p) => p.current_stock <= p.reorder_level)
        .sort((a, b) => a.current_stock - b.current_stock),
    [products]
  );

  // Manager metrics
  const managerMetrics = useMemo(() => {
    const stockValueAtCost = products.reduce(
      (sum, p) => sum + p.current_stock * p.cost_price,
      0
    );

    let profit7 = 0;
    let profit30 = 0;
    let weightedWapeSum = 0;
    let weightedBaselineWapeSum = 0;
    let weightTotal = 0;

    const f30ByProduct = new Map<string, Forecast>();

    for (const f of forecasts) {
      if (f.horizon_days === 7) {
        profit7 += f.predicted_profit;
      } else if (f.horizon_days === 30) {
        profit30 += f.predicted_profit;
        f30ByProduct.set(f.product_id, f);

        const weight = Math.max(1, f.predicted_units);
        weightedWapeSum += Number(f.wape ?? 0) * weight;
        weightedBaselineWapeSum += Number(f.baseline_wape ?? 0) * weight;
        weightTotal += weight;
      }
    }

    const avgWape = weightTotal > 0 ? weightedWapeSum / weightTotal : 0;
    const avgBaselineWape =
      weightTotal > 0 ? weightedBaselineWapeSum / weightTotal : 0;
    const modelAccuracy = Math.max(0, Math.min(100, 100 - avgWape));
    const baselineAccuracy = Math.max(0, Math.min(100, 100 - avgBaselineWape));

    // Top 5 products by predicted 30-day profit
    const top5ByProfit = products
      .map((product) => {
        const f30 = f30ByProduct.get(product.id);
        return {
          product,
          predictedUnits30: f30?.predicted_units ?? 0,
          predictedRevenue30: f30?.predicted_revenue ?? 0,
          predictedProfit30: f30?.predicted_profit ?? 0,
        };
      })
      .sort((a, b) => b.predictedProfit30 - a.predictedProfit30)
      .slice(0, 5);

    return {
      stockValueAtCost,
      profit7,
      profit30,
      modelAccuracy,
      baselineAccuracy,
      avgWape,
      top5ByProfit,
    };
  }, [products, forecasts]);

  // 5 most urgent alerts for manager
  const urgentAlerts = useMemo(
    () =>
      computeProductAlerts({
        products,
        forecasts,
        forecastDaily,
        isManager,
      }).slice(0, 5),
    [products, forecasts, forecastDaily, isManager]
  );

  if (loading) {
    return (
      <div
        className="text-body-sm"
        style={{
          padding: 'var(--space-md)',
          color: 'var(--color-secondary)',
        }}
      >
        Loading dashboard...
      </div>
    );
  }

  // ==========================================================================
  // CLERK VIEW: low-stock list and the number of sales they recorded today
  // ==========================================================================
  if (!isManager) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-md)',
        }}
      >
        <div>
          <h1 className="text-headline-sm">Dashboard</h1>
          <p
            className="text-body-sm"
            style={{ color: 'var(--color-secondary)', marginTop: '4px' }}
          >
            Daily clerk summary and low-stock shelf monitoring.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 'var(--space-sm)',
          }}
        >
          <Card style={{ padding: 'var(--space-md)' }}>
            <div
              className="text-label-md"
              style={{ color: 'var(--color-secondary)' }}
            >
              Sales you recorded today
            </div>
            <div
              className="text-headline-sm"
              style={{ marginTop: 'var(--space-xs)' }}
            >
              {clerkSalesTodayCount}
            </div>
            <div style={{ marginTop: 'var(--space-xs)' }}>
              <Link to="/sales" className="ui-btn ui-btn--link text-label-md">
                Record a sale →
              </Link>
            </div>
          </Card>

          <Card style={{ padding: 'var(--space-md)' }}>
            <div
              className="text-label-md"
              style={{ color: 'var(--color-secondary)' }}
            >
              Low-stock items
            </div>
            <div
              className="text-headline-sm"
              style={{
                marginTop: 'var(--space-xs)',
                color:
                  lowStockProducts.length > 0
                    ? 'var(--color-error)'
                    : 'var(--color-on-surface)',
              }}
            >
              {lowStockProducts.length}
            </div>
            <div style={{ marginTop: 'var(--space-xs)' }}>
              <Link
                to="/stock-in"
                className="ui-btn ui-btn--link text-label-md"
              >
                Log a supplier delivery →
              </Link>
            </div>
          </Card>
        </div>

        <Card>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 'var(--space-xs) var(--space-sm) var(--space-sm)',
            }}
          >
            <h2 className="text-label-lg">Low-stock list</h2>
            <Chip variant="error">{lowStockProducts.length} items</Chip>
          </div>

          {lowStockProducts.length === 0 ? (
            <div
              className="text-body-sm"
              style={{
                padding: 'var(--space-md)',
                color: 'var(--color-secondary)',
              }}
            >
              All products are currently above their reorder levels.
            </div>
          ) : (
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Current stock</th>
                    <th>Reorder level</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockProducts.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className="text-label-lg">{p.name}</div>
                        <div
                          className="text-label-sm"
                          style={{ color: 'var(--color-secondary)' }}
                        >
                          {p.sku}
                        </div>
                      </td>
                      <td>
                        <Chip>{p.categories?.name || 'Uncategorized'}</Chip>
                      </td>
                      <td className="text-label-lg">{p.current_stock}</td>
                      <td>{p.reorder_level}</td>
                      <td>
                        <Chip variant="error">Low stock</Chip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    );
  }

  // ==========================================================================
  // MANAGER VIEW
  // ==========================================================================
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-md)',
      }}
    >
      <div>
        <h1 className="text-headline-sm">Dashboard</h1>
        <p
          className="text-body-sm"
          style={{ color: 'var(--color-secondary)', marginTop: '4px' }}
        >
          Executive overview of supermarket stock value, predicted RWF profit,
          urgent alerts, and AI inventory recommendations.
        </p>
      </div>

      {/* Summary KPI Cards (4-col wide, 2-col tablet, 1-col phone) */}
      <div className="kpi-grid">
        <Card style={{ padding: 'var(--space-md)' }}>
          <div
            className="text-label-md"
            style={{ color: 'var(--color-secondary)' }}
          >
            Stock value at cost
          </div>
          <div
            className="text-headline-sm"
            style={{ marginTop: 'var(--space-xs)' }}
          >
            {formatRWF(managerMetrics.stockValueAtCost)}
          </div>
          <div
            className="text-label-sm"
            style={{ color: 'var(--color-secondary)', marginTop: '6px' }}
          >
            Across {products.length} active products
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-md)' }}>
          <div
            className="text-label-md"
            style={{ color: 'var(--color-secondary)' }}
          >
            Low-stock items
          </div>
          <div
            className="text-headline-sm"
            style={{
              marginTop: 'var(--space-xs)',
              color:
                lowStockProducts.length > 0
                  ? 'var(--color-error)'
                  : 'var(--color-on-surface)',
            }}
          >
            {lowStockProducts.length}
          </div>
          <div
            className="text-label-sm"
            style={{ color: 'var(--color-secondary)', marginTop: '6px' }}
          >
            Stock ≤ reorder level
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-md)' }}>
          <div
            className="text-label-md"
            style={{ color: 'var(--color-secondary)' }}
          >
            Predicted profit (7d / 30d)
          </div>
          <div
            className="text-headline-sm"
            style={{ marginTop: 'var(--space-xs)' }}
          >
            {hasForecastRun ? formatRWF(managerMetrics.profit30) : '—'}
          </div>
          <div
            className="text-label-sm"
            style={{ color: 'var(--color-secondary)', marginTop: '6px' }}
          >
            {hasForecastRun
              ? `Next 7 days: ${formatRWF(managerMetrics.profit7)}`
              : 'Run forecast to view predicted profit'}
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-md)' }}>
          <div
            className="text-label-md"
            style={{ color: 'var(--color-secondary)' }}
          >
            Model accuracy (100 − WAPE)
          </div>
          <div
            className="text-headline-sm"
            style={{
              marginTop: 'var(--space-xs)',
              color: 'var(--color-primary)',
            }}
          >
            {hasForecastRun
              ? `${managerMetrics.modelAccuracy.toFixed(1)}%`
              : '—'}
          </div>
          <div
            className="text-label-sm"
            style={{ color: 'var(--color-secondary)', marginTop: '6px' }}
          >
            {hasForecastRun
              ? `7-day MA baseline: ${managerMetrics.baselineAccuracy.toFixed(
                  1
                )}%`
              : '28-day backtest pending'}
          </div>
        </Card>
      </div>

      {/* Friendly empty state if no forecast has been run yet */}
      {!hasForecastRun && (
        <Card style={{ padding: 'var(--space-md)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 'var(--space-sm)',
            }}
          >
            <div>
              <h2 className="text-label-lg">No forecast has been run yet</h2>
              <p
                className="text-body-sm"
                style={{ color: 'var(--color-secondary)', marginTop: '4px' }}
              >
                Run the Ridge Regression forecast engine to populate 7-day and
                30-day profit predictions, top profit products, stock-out risk
                dates, and AI recommendations.
              </p>
            </div>

            <Link to="/forecast" className="ui-btn ui-btn--primary">
              Go to Forecast page
            </Link>
          </div>
        </Card>
      )}

      {/* AI Summary Card */}
      <Card style={{ padding: 'var(--space-md)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-sm)',
            marginBottom: 'var(--space-sm)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-xs)',
            }}
          >
            <Sparkles size={17} color="var(--color-primary)" />
            <h2 className="text-label-lg">AI summary</h2>
            {insight?.generated_at && (
              <span
                className="text-label-sm"
                style={{
                  color: 'var(--color-secondary)',
                  marginLeft: 'var(--space-xs)',
                }}
              >
                Generated:{' '}
                {new Date(insight.generated_at).toLocaleString('en-GB', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </span>
            )}
          </div>

          <Button
            variant="secondary"
            onClick={() => requestAiInsight(true)}
            disabled={insightLoading || !hasForecastRun}
          >
            <RefreshCw size={14} />
            {insightLoading ? 'Refreshing insight...' : 'Refresh insight'}
          </Button>
        </div>

        {insightError && (
          <div
            className="text-body-sm"
            style={{
              color: 'var(--color-error)',
              backgroundColor: '#FCECEC',
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 'var(--space-sm)',
            }}
          >
            {insightError}
          </div>
        )}

        {insight ? (
          <MarkdownContent content={insight.content} />
        ) : insightLoading ? (
          <div
            className="text-body-sm"
            style={{ color: 'var(--color-secondary)' }}
          >
            Generating AI inventory summary from your latest forecast...
          </div>
        ) : (
          <div
            className="text-body-sm"
            style={{ color: 'var(--color-secondary)' }}
          >
            {hasForecastRun
              ? 'Click "Refresh insight" to generate an executive AI summary and restocking advice.'
              : 'Run a forecast first to generate AI inventory recommendations.'}
          </div>
        )}
      </Card>

      {/* Two-Column Section: Top 5 Products by Predicted 30d Profit & 5 Most Urgent Alerts */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
          gap: 'var(--space-md)',
        }}
      >
        {/* Top 5 Products by Predicted 30-day Profit */}
        <Card>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 'var(--space-xs) var(--space-sm) var(--space-sm)',
            }}
          >
            <h2 className="text-label-lg">
              Top 5 products by predicted 30-day profit
            </h2>
            <Chip variant="active">30d profit</Chip>
          </div>

          {!hasForecastRun ? (
            <div
              className="text-body-sm"
              style={{
                padding: 'var(--space-md)',
                color: 'var(--color-secondary)',
              }}
            >
              No forecast data yet.{' '}
              <Link to="/forecast" style={{ color: 'var(--color-primary)' }}>
                Run the forecast engine
              </Link>{' '}
              to rank products by predicted 30-day profit.
            </div>
          ) : (
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>30d units</th>
                    <th>30d revenue</th>
                    <th>30d profit</th>
                  </tr>
                </thead>
                <tbody>
                  {managerMetrics.top5ByProfit.map((item) => (
                    <tr key={item.product.id}>
                      <td>
                        <div className="text-label-lg">{item.product.name}</div>
                        <div
                          className="text-label-sm"
                          style={{ color: 'var(--color-secondary)' }}
                        >
                          {item.product.sku}
                        </div>
                      </td>
                      <td>{item.predictedUnits30.toLocaleString()}</td>
                      <td>{formatRWF(item.predictedRevenue30)}</td>
                      <td
                        className="text-label-lg"
                        style={{ color: 'var(--color-primary)' }}
                      >
                        {formatRWF(item.predictedProfit30)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* 5 Most Urgent Alerts */}
        <Card>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 'var(--space-xs) var(--space-sm) var(--space-sm)',
            }}
          >
            <h2 className="text-label-lg">5 most urgent alerts</h2>
            <Link to="/alerts" className="ui-btn ui-btn--link text-label-md">
              View all →
            </Link>
          </div>

          {urgentAlerts.length === 0 ? (
            <div
              className="text-body-sm"
              style={{
                padding: 'var(--space-md)',
                color: 'var(--color-secondary)',
              }}
            >
              No urgent alerts at this time.
            </div>
          ) : (
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Alert</th>
                    <th>Stock</th>
                    <th>Suggested reorder</th>
                  </tr>
                </thead>
                <tbody>
                  {urgentAlerts.map((alert) => (
                    <tr key={alert.id}>
                      <td>
                        <div className="text-label-lg">
                          {alert.product.name}
                        </div>
                        <div
                          className="text-label-sm"
                          style={{ color: 'var(--color-secondary)' }}
                        >
                          {alert.product.sku}
                          {alert.stockOutDate
                            ? ` · Out: ${alert.stockOutDate}`
                            : ''}
                        </div>
                      </td>
                      <td>
                        <Chip
                          variant={
                            alert.alertType === 'stock_out_risk' ||
                            alert.alertType === 'low_stock'
                              ? 'error'
                              : 'active'
                          }
                        >
                          {alert.alertLabel}
                        </Chip>
                      </td>
                      <td className="text-label-lg">{alert.currentStock}</td>
                      <td>
                        {alert.suggestedReorder !== null
                          ? `${alert.suggestedReorder.toLocaleString()} units`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

