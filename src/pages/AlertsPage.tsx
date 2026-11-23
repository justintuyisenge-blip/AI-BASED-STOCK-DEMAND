import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Forecast, ForecastDaily, Product } from '../types/database';
import {
  AlertType,
  computeProductAlerts,
  fetchAllForecastDailyForRun,
  ProductAlert,
} from '../lib/alerts';
import { Card } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';

type FilterTab = 'all' | AlertType;

const MANAGER_FILTERS: Array<{ key: FilterTab; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'low_stock', label: 'Low stock' },
  { key: 'stock_out_risk', label: 'Stock-out risk' },
  { key: 'overstock', label: 'Overstock' },
  { key: 'slow_mover', label: 'Slow movers' },
];

export const AlertsPage: React.FC = () => {
  const { profile } = useAuth();
  const isManager = profile?.role === 'manager';

  const [products, setProducts] = useState<Product[]>([]);
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [forecastDaily, setForecastDaily] = useState<ForecastDaily[]>([]);
  const [hasForecastRun, setHasForecastRun] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  useEffect(() => {
    const loadAlertsData = async () => {
      setLoading(true);
      setError(null);

      // 1. Load active products
      const { data: prodData, error: prodErr } = await supabase
        .from('products')
        .select(
          'id, name, sku, category_id, cost_price, selling_price, current_stock, reorder_level, is_active, categories(name)'
        )
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (prodErr) {
        setError(`Failed to load products: ${prodErr.message}`);
        setLoading(false);
        return;
      }

      setProducts((prodData as unknown as Product[]) || []);

      // Clerks only see low-stock alerts based on products only (no forecast queries)
      if (!isManager) {
        setForecasts([]);
        setForecastDaily([]);
        setHasForecastRun(false);
        setLoading(false);
        return;
      }

      // 2. For managers, load the latest forecast run
      const { data: latestRow, error: latestErr } = await supabase
        .from('forecasts')
        .select('run_id, generated_at')
        .not('run_id', 'is', null)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestErr) {
        setError(`Failed to check latest forecast run: ${latestErr.message}`);
        setLoading(false);
        return;
      }

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

      if (forecastsRes.error) {
        setError(`Failed to load forecast summaries: ${forecastsRes.error.message}`);
      } else {
        setForecasts((forecastsRes.data as Forecast[]) || []);
      }

      if (dailyRes.error) {
        setError(`Failed to load daily forecast series: ${dailyRes.error.message}`);
      } else {
        setForecastDaily((dailyRes.data as ForecastDaily[]) || []);
      }

      setLoading(false);
    };

    loadAlertsData();
  }, [isManager]);

  const allAlerts: ProductAlert[] = useMemo(
    () =>
      computeProductAlerts({
        products,
        forecasts,
        forecastDaily,
        isManager,
      }),
    [products, forecasts, forecastDaily, isManager]
  );

  const filteredAlerts = useMemo(() => {
    if (!isManager || activeFilter === 'all') {
      return allAlerts;
    }
    return allAlerts.filter((a) => a.alertType === activeFilter);
  }, [allAlerts, activeFilter, isManager]);

  const countByType = useMemo(() => {
    const counts: Record<FilterTab, number> = {
      all: allAlerts.length,
      low_stock: 0,
      stock_out_risk: 0,
      overstock: 0,
      slow_mover: 0,
    };
    for (const a of allAlerts) {
      counts[a.alertType] += 1;
    }
    return counts;
  }, [allAlerts]);

  const getAlertChipVariant = (
    type: AlertType
  ): 'error' | 'active' | 'default' => {
    if (type === 'stock_out_risk' || type === 'low_stock') {
      return 'error';
    }
    if (type === 'overstock') {
      return 'active';
    }
    return 'default';
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-md)',
      }}
    >
      <div>
        <h1 className="text-headline-sm">Alerts</h1>
        <p
          className="text-body-sm"
          style={{ color: 'var(--color-secondary)', marginTop: '4px' }}
        >
          {isManager
            ? 'Stock-out risks, low-stock items, overstock warnings, and slow movers with suggested reorder quantities.'
            : 'Low-stock inventory alerts requiring shelf replenishment.'}
        </p>
      </div>

      {/* Friendly banner for manager if no forecast has been run yet */}
      {isManager && !loading && !hasForecastRun && (
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
            <div className="text-body-sm">
              No forecast has been run yet. Currently showing{' '}
              <strong>Low stock</strong> alerts from current inventory levels.
              Run the forecast engine to unlock{' '}
              <strong>Stock-out risk</strong>, <strong>Overstock</strong>, and{' '}
              <strong>Slow mover</strong> alerts.
            </div>
            <Link to="/forecast" className="ui-btn ui-btn--secondary">
              Go to Forecast
            </Link>
          </div>
        </Card>
      )}

      {/* Filter Chips */}
      {isManager ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-xs)',
          }}
        >
          {MANAGER_FILTERS.map((f) => {
            const isActive = activeFilter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setActiveFilter(f.key)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  cursor: 'pointer',
                }}
              >
                <Chip variant={isActive ? 'active' : 'default'}>
                  {f.label} ({countByType[f.key]})
                </Chip>
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
          <Chip variant="active">Low stock ({allAlerts.length})</Chip>
        </div>
      )}

      {/* Alerts Table */}
      <Card>
        {loading ? (
          <div
            className="text-body-sm"
            style={{
              padding: 'var(--space-md)',
              color: 'var(--color-secondary)',
            }}
          >
            Loading alerts...
          </div>
        ) : error ? (
          <div
            className="text-body-sm"
            style={{
              padding: 'var(--space-md)',
              color: 'var(--color-error)',
            }}
          >
            {error}
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div
            className="text-body-sm"
            style={{
              padding: 'var(--space-md)',
              color: 'var(--color-secondary)',
            }}
          >
            No alerts match the selected filter.
          </div>
        ) : (
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Alert type</th>
                  <th>Stock</th>
                  {isManager && <th>Predicted demand (30d)</th>}
                  {isManager && <th>Stock-out date</th>}
                  {isManager && <th>Suggested reorder</th>}
                </tr>
              </thead>
              <tbody>
                {filteredAlerts.map((alert) => (
                  <tr key={alert.id}>
                    <td>
                      <div className="text-label-lg">{alert.product.name}</div>
                      <div
                        className="text-label-sm"
                        style={{ color: 'var(--color-secondary)' }}
                      >
                        {alert.product.sku}
                        {alert.product.categories?.name
                          ? ` · ${alert.product.categories.name}`
                          : ''}
                      </div>
                    </td>
                    <td>
                      <Chip variant={getAlertChipVariant(alert.alertType)}>
                        {alert.alertLabel}
                      </Chip>
                    </td>
                    <td>
                      <span className="text-label-lg">
                        {alert.currentStock}
                      </span>{' '}
                      <span
                        className="text-label-sm"
                        style={{ color: 'var(--color-secondary)' }}
                      >
                        (reorder ≤ {alert.reorderLevel})
                      </span>
                    </td>
                    {isManager && (
                      <td>
                        {alert.predictedDemand30d !== null
                          ? `${alert.predictedDemand30d.toLocaleString()} units`
                          : '—'}
                      </td>
                    )}
                    {isManager && (
                      <td>
                        {alert.stockOutDate ? (
                          <span
                            className="text-label-md"
                            style={{ color: 'var(--color-error)' }}
                          >
                            {alert.stockOutDate}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    )}
                    {isManager && (
                      <td>
                        {alert.suggestedReorder !== null ? (
                          <span className="text-label-lg">
                            {alert.suggestedReorder.toLocaleString()} units
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

