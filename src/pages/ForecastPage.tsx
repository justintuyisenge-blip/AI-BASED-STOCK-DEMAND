import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { ArrowUpDown, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatRWF } from '../lib/format';
import { Forecast, ForecastDaily, Product } from '../types/database';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';

type SortField =
  | 'name'
  | 'units7'
  | 'units30'
  | 'profit30'
  | 'currentStock'
  | 'daysLeft';

type SortDirection = 'asc' | 'desc';

interface ProductForecastRow {
  product: Product;
  units7: number;
  revenue7: number;
  profit7: number;
  units30: number;
  revenue30: number;
  profit30: number;
  wape: number;
  baselineWape: number;
  daysLeft: number;
}

interface ChartPoint {
  date: string;
  label: string;
  actual?: number;
  predicted?: number;
}

function formatDateYYYYMMDD(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatShortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  return dateObj.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  });
}

export const ForecastPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [latestRunId, setLatestRunId] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [runningForecast, setRunningForecast] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Selected product for the 60d actual + 30d predicted chart
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [chartLoading, setChartLoading] = useState<boolean>(false);

  // Sort state for the table
  const [sortField, setSortField] = useState<SortField>('daysLeft');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');

  const loadLatestForecastRun = async () => {
    setLoading(true);
    setErrorMsg(null);

    // 1. Load all active products
    const { data: prodData, error: prodErr } = await supabase
      .from('products')
      .select(
        'id, name, sku, category_id, cost_price, selling_price, current_stock, reorder_level, is_active, categories(name)'
      )
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (prodErr) {
      setErrorMsg(`Failed to load products: ${prodErr.message}`);
      setLoading(false);
      return;
    }

    const loadedProducts = (prodData as unknown as Product[]) || [];
    setProducts(loadedProducts);

    if (!selectedProductId && loadedProducts.length > 0) {
      setSelectedProductId(loadedProducts[0].id);
    }

    // 2. Find the latest forecast run_id
    const { data: latestRow, error: latestErr } = await supabase
      .from('forecasts')
      .select('run_id, generated_at')
      .not('run_id', 'is', null)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestErr) {
      setErrorMsg(`Failed to check latest forecast run: ${latestErr.message}`);
      setLoading(false);
      return;
    }

    if (!latestRow || !latestRow.run_id) {
      setLatestRunId(null);
      setLastRunAt(null);
      setForecasts([]);
      setLoading(false);
      return;
    }

    setLatestRunId(latestRow.run_id);
    setLastRunAt(latestRow.generated_at);

    // 3. Load all forecast rows for that latest run_id
    const { data: runRows, error: runErr } = await supabase
      .from('forecasts')
      .select('*')
      .eq('run_id', latestRow.run_id);

    if (runErr) {
      setErrorMsg(`Failed to load forecast summaries: ${runErr.message}`);
    } else {
      setForecasts((runRows as Forecast[]) || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadLatestForecastRun();
  }, []);

  // Load 60 days of actual sales + 30 days of predicted sales for the selected product
  useEffect(() => {
    const loadProductChart = async () => {
      if (!selectedProductId) return;
      setChartLoading(true);

      const now = new Date();
      const todayUtc = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      );

      // Build last 60 days date list (ending yesterday)
      const actualDates: string[] = [];
      for (let offset = 60; offset >= 1; offset--) {
        const d = new Date(todayUtc.getTime() - offset * 86400000);
        actualDates.push(formatDateYYYYMMDD(d));
      }

      const start60Str = actualDates[0];
      const end60Str = actualDates[actualDates.length - 1];

      const { data: salesRows } = await supabase
        .from('sales')
        .select('sold_on, quantity')
        .eq('product_id', selectedProductId)
        .gte('sold_on', start60Str)
        .lte('sold_on', end60Str);

      const actualByDate = new Map<string, number>();
      for (const row of salesRows || []) {
        actualByDate.set(
          row.sold_on,
          (actualByDate.get(row.sold_on) || 0) + row.quantity
        );
      }

      const points: ChartPoint[] = actualDates.map((dStr) => ({
        date: dStr,
        label: formatShortDate(dStr),
        actual: actualByDate.get(dStr) || 0,
      }));

      // Load 30 days of predicted sales from forecast_daily for latestRunId
      if (latestRunId) {
        const { data: dailyPreds } = await supabase
          .from('forecast_daily')
          .select('forecast_date, predicted_units')
          .eq('run_id', latestRunId)
          .eq('product_id', selectedProductId)
          .order('forecast_date', { ascending: true });

        const predRows = (dailyPreds as ForecastDaily[]) || [];

        // Connect the last actual point to the start of the predicted line for visual continuity
        if (points.length > 0 && predRows.length > 0) {
          points[points.length - 1].predicted =
            points[points.length - 1].actual;
        }

        for (const p of predRows) {
          points.push({
            date: p.forecast_date,
            label: formatShortDate(p.forecast_date),
            predicted: p.predicted_units,
          });
        }
      }

      setChartData(points);
      setChartLoading(false);
    };

    loadProductChart();
  }, [selectedProductId, latestRunId]);

  const handleRunForecast = async () => {
    setRunningForecast(true);
    setErrorMsg(null);

    const { error } = await supabase.functions.invoke('run-forecast', {
      method: 'POST',
    });

    setRunningForecast(false);

    if (error) {
      setErrorMsg(
        `Failed to run forecast Edge Function: ${error.message}. Ensure the "run-forecast" Edge Function is deployed.`
      );
      return;
    }

    await loadLatestForecastRun();
  };

  // Combine products with their 7-day and 30-day forecast rows
  const productRows: ProductForecastRow[] = useMemo(() => {
    const byProductHorizon = new Map<string, Forecast>();
    for (const f of forecasts) {
      byProductHorizon.set(`${f.product_id}_${f.horizon_days}`, f);
    }

    return products.map((product) => {
      const f7 = byProductHorizon.get(`${product.id}_7`);
      const f30 = byProductHorizon.get(`${product.id}_30`);

      const units7 = f7?.predicted_units ?? 0;
      const revenue7 = f7?.predicted_revenue ?? 0;
      const profit7 = f7?.predicted_profit ?? 0;

      const units30 = f30?.predicted_units ?? 0;
      const revenue30 = f30?.predicted_revenue ?? 0;
      const profit30 = f30?.predicted_profit ?? 0;

      const wape = Number(f30?.wape ?? f7?.wape ?? 0);
      const baselineWape = Number(f30?.baseline_wape ?? f7?.baseline_wape ?? 0);

      // Estimated days of stock left based on 30-day predicted daily velocity
      const dailyRate = units30 / 30;
      const daysLeft =
        product.current_stock <= 0
          ? 0
          : dailyRate > 0
          ? Math.round(product.current_stock / dailyRate)
          : 999;

      return {
        product,
        units7,
        revenue7,
        profit7,
        units30,
        revenue30,
        profit30,
        wape,
        baselineWape,
        daysLeft,
      };
    });
  }, [products, forecasts]);

  // Aggregate summary metrics across all active products
  const summary = useMemo(() => {
    let totalUnits7 = 0;
    let totalRevenue7 = 0;
    let totalProfit7 = 0;
    let totalUnits30 = 0;
    let totalRevenue30 = 0;
    let totalProfit30 = 0;
    let weightedWapeSum = 0;
    let weightedBaselineWapeSum = 0;
    let weightTotal = 0;

    for (const row of productRows) {
      totalUnits7 += row.units7;
      totalRevenue7 += row.revenue7;
      totalProfit7 += row.profit7;
      totalUnits30 += row.units30;
      totalRevenue30 += row.revenue30;
      totalProfit30 += row.profit30;

      const weight = Math.max(1, row.units30);
      weightedWapeSum += row.wape * weight;
      weightedBaselineWapeSum += row.baselineWape * weight;
      weightTotal += weight;
    }

    const avgWape = weightTotal > 0 ? weightedWapeSum / weightTotal : 0;
    const avgBaselineWape =
      weightTotal > 0 ? weightedBaselineWapeSum / weightTotal : 0;

    const modelAccuracy = Math.max(0, Math.min(100, 100 - avgWape));
    const baselineAccuracy = Math.max(0, Math.min(100, 100 - avgBaselineWape));

    return {
      totalUnits7,
      totalRevenue7,
      totalProfit7,
      totalUnits30,
      totalRevenue30,
      totalProfit30,
      avgWape,
      avgBaselineWape,
      modelAccuracy,
      baselineAccuracy,
    };
  }, [productRows]);

  const sortedRows = useMemo(() => {
    const copy = [...productRows];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.product.name.localeCompare(b.product.name);
          break;
        case 'units7':
          cmp = a.units7 - b.units7;
          break;
        case 'units30':
          cmp = a.units30 - b.units30;
          break;
        case 'profit30':
          cmp = a.profit30 - b.profit30;
          break;
        case 'currentStock':
          cmp = a.product.current_stock - b.product.current_stock;
          break;
        case 'daysLeft':
          cmp = a.daysLeft - b.daysLeft;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [productRows, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'name' || field === 'daysLeft' ? 'asc' : 'desc');
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-md)',
      }}
    >
      {/* Header + Run Forecast Action */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-sm)',
        }}
      >
        <div>
          <h1 className="text-headline-sm">Demand &amp; Profit Forecast</h1>
          <p
            className="text-body-sm"
            style={{ color: 'var(--color-secondary)', marginTop: '4px' }}
          >
            Ridge regression demand engine trained on 180 days of daily sales
            with 28-day backtesting.
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-sm)',
          }}
        >
          {lastRunAt && (
            <span
              className="text-label-sm"
              style={{ color: 'var(--color-secondary)' }}
            >
              Last run:{' '}
              {new Date(lastRunAt).toLocaleString('en-GB', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </span>
          )}

          <Button
            variant="primary"
            onClick={handleRunForecast}
            disabled={runningForecast}
          >
            <RefreshCw size={15} />
            {runningForecast ? 'Running forecast...' : 'Run forecast'}
          </Button>
        </div>
      </div>

      {errorMsg && (
        <div
          className="text-body-sm"
          style={{
            color: 'var(--color-error)',
            backgroundColor: '#FCECEC',
            padding: '12px 14px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-error)',
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Summary Cards: 7-Day, 30-Day, and Model Accuracy vs Baseline */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 'var(--space-sm)',
        }}
      >
        <Card style={{ padding: 'var(--space-md)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 'var(--space-xs)',
            }}
          >
            <span
              className="text-label-md"
              style={{ color: 'var(--color-secondary)' }}
            >
              Next 7 days forecast
            </span>
            <Chip variant="active">7d horizon</Chip>
          </div>

          <div className="text-headline-sm">
            {formatRWF(summary.totalRevenue7)}
          </div>
          <div
            className="text-body-sm"
            style={{ color: 'var(--color-secondary)', marginTop: '4px' }}
          >
            Predicted profit:{' '}
            <strong style={{ color: 'var(--color-on-surface)' }}>
              {formatRWF(summary.totalProfit7)}
            </strong>
          </div>
          <div
            className="text-label-sm"
            style={{ color: 'var(--color-secondary)', marginTop: '6px' }}
          >
            Total predicted volume: {summary.totalUnits7.toLocaleString()} units
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-md)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 'var(--space-xs)',
            }}
          >
            <span
              className="text-label-md"
              style={{ color: 'var(--color-secondary)' }}
            >
              Next 30 days forecast
            </span>
            <Chip variant="active">30d horizon</Chip>
          </div>

          <div className="text-headline-sm">
            {formatRWF(summary.totalRevenue30)}
          </div>
          <div
            className="text-body-sm"
            style={{ color: 'var(--color-secondary)', marginTop: '4px' }}
          >
            Predicted profit:{' '}
            <strong style={{ color: 'var(--color-on-surface)' }}>
              {formatRWF(summary.totalProfit30)}
            </strong>
          </div>
          <div
            className="text-label-sm"
            style={{ color: 'var(--color-secondary)', marginTop: '6px' }}
          >
            Total predicted volume: {summary.totalUnits30.toLocaleString()}{' '}
            units
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-md)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 'var(--space-xs)',
            }}
          >
            <span
              className="text-label-md"
              style={{ color: 'var(--color-secondary)' }}
            >
              Model accuracy (100 − WAPE)
            </span>
            <Chip variant="active">28d backtest</Chip>
          </div>

          <div
            className="text-headline-sm"
            style={{ color: 'var(--color-primary)' }}
          >
            {latestRunId ? `${summary.modelAccuracy.toFixed(1)}%` : '—'}
          </div>
          <div
            className="text-body-sm"
            style={{ color: 'var(--color-secondary)', marginTop: '4px' }}
          >
            7-day MA baseline:{' '}
            <strong style={{ color: 'var(--color-on-surface)' }}>
              {latestRunId ? `${summary.baselineAccuracy.toFixed(1)}%` : '—'}
            </strong>
          </div>
          <div
            className="text-label-sm"
            style={{ color: 'var(--color-secondary)', marginTop: '6px' }}
          >
            {latestRunId
              ? `Ridge WAPE: ${summary.avgWape.toFixed(1)}% vs Baseline WAPE: ${summary.avgBaselineWape.toFixed(1)}%`
              : 'Click "Run forecast" to generate metrics'}
          </div>
        </Card>
      </div>

      {/* Product Selector & 60d Actual + 30d Predicted Chart */}
      <Card style={{ padding: 'var(--space-md)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-sm)',
            marginBottom: 'var(--space-md)',
          }}
        >
          <div>
            <h2 className="text-label-lg">
              Product demand trajectory (last 60 days actual vs next 30 days
              predicted)
            </h2>
            <p
              className="text-body-sm"
              style={{ color: 'var(--color-secondary)', marginTop: '2px' }}
            >
              Solid dark line shows historical sales; dashed blue line shows
              ridge regression forecast.
            </p>
          </div>

          <div style={{ minWidth: '280px' }}>
            <select
              aria-label="Select product for forecast chart"
              className="ui-input"
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </select>
          </div>
        </div>

        {chartLoading ? (
          <div
            className="text-body-sm"
            style={{
              height: '320px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-secondary)',
            }}
          >
            Loading chart series...
          </div>
        ) : (
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border-subtle)"
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: '#303239' }}
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: '#303239' }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #D7DAE3',
                    borderRadius: '8px',
                    fontSize: '13px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '13px', paddingTop: '8px' }} />
                <Line
                  type="monotone"
                  dataKey="actual"
                  name="Actual daily sales (60d)"
                  stroke="#141518"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="predicted"
                  name="Predicted daily sales (30d)"
                  stroke="#2D4FFF"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* All Products Sortable Forecast Table */}
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
            All products forecast ({sortedRows.length})
          </h2>
          <Chip>Click column headers to sort</Chip>
        </div>

        {loading ? (
          <div
            className="text-body-sm"
            style={{
              padding: 'var(--space-md)',
              color: 'var(--color-secondary)',
            }}
          >
            Loading forecast table...
          </div>
        ) : !latestRunId ? (
          <div
            className="text-body-sm"
            style={{
              padding: 'var(--space-md)',
              color: 'var(--color-secondary)',
            }}
          >
            No forecast run found yet. Click <strong>Run forecast</strong> above
            to train the model and generate 7-day and 30-day predictions.
          </div>
        ) : (
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>
                    <button
                      type="button"
                      className="ui-btn ui-btn--link text-label-sm"
                      onClick={() => handleSort('name')}
                    >
                      Product <ArrowUpDown size={13} />
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="ui-btn ui-btn--link text-label-sm"
                      onClick={() => handleSort('units7')}
                    >
                      Predicted units (7d) <ArrowUpDown size={13} />
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="ui-btn ui-btn--link text-label-sm"
                      onClick={() => handleSort('units30')}
                    >
                      Predicted units (30d) <ArrowUpDown size={13} />
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="ui-btn ui-btn--link text-label-sm"
                      onClick={() => handleSort('profit30')}
                    >
                      Predicted profit (30d) <ArrowUpDown size={13} />
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="ui-btn ui-btn--link text-label-sm"
                      onClick={() => handleSort('currentStock')}
                    >
                      Current stock <ArrowUpDown size={13} />
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="ui-btn ui-btn--link text-label-sm"
                      onClick={() => handleSort('daysLeft')}
                    >
                      Est. days of stock left <ArrowUpDown size={13} />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => {
                  const isSelected = row.product.id === selectedProductId;
                  const isLowDays = row.daysLeft <= 7;

                  return (
                    <tr
                      key={row.product.id}
                      onClick={() => setSelectedProductId(row.product.id)}
                      style={{
                        cursor: 'pointer',
                        backgroundColor: isSelected
                          ? 'var(--color-primary-20)'
                          : undefined,
                      }}
                    >
                      <td>
                        <div className="text-label-lg">{row.product.name}</div>
                        <div
                          className="text-label-sm"
                          style={{ color: 'var(--color-secondary)' }}
                        >
                          {row.product.sku}
                        </div>
                      </td>
                      <td className="text-label-lg">
                        {row.units7.toLocaleString()}
                      </td>
                      <td className="text-label-lg">
                        {row.units30.toLocaleString()}
                      </td>
                      <td className="text-label-lg">
                        {formatRWF(row.profit30)}
                      </td>
                      <td>{row.product.current_stock.toLocaleString()}</td>
                      <td>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--space-xs)',
                          }}
                        >
                          <span className="text-label-lg">
                            {row.daysLeft >= 999
                              ? '90+ days'
                              : `${row.daysLeft} days`}
                          </span>
                          {isLowDays && (
                            <Chip variant="error">Reorder soon</Chip>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

