import { SupabaseClient } from '@supabase/supabase-js';
import { Forecast, ForecastDaily, Product } from '../types/database';

export type AlertType =
  | 'stock_out_risk'
  | 'low_stock'
  | 'overstock'
  | 'slow_mover';

export interface ProductAlert {
  id: string; // unique composite key: `${product.id}_${alertType}`
  product: Product;
  alertType: AlertType;
  alertLabel: string;
  priority: number; // 1 = Stock-out risk (highest), 2 = Low stock, 3 = Overstock, 4 = Slow mover
  currentStock: number;
  reorderLevel: number;
  predictedDemand30d: number | null;
  predictedDemand14d: number | null;
  daysOfStockLeft: number | null;
  stockOutDate: string | null;
  suggestedReorder: number | null;
}

/**
 * Fetch all forecast_daily rows for a given run_id using range pagination
 * so PostgREST's 1,000-row per-request cap never truncates the 1,500 rows (50 products × 30 days).
 */
export async function fetchAllForecastDailyForRun(
  client: SupabaseClient,
  runId: string
): Promise<{ data: ForecastDaily[]; error: Error | null }> {
  const allRows: ForecastDaily[] = [];
  const PAGE_SIZE = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await client
      .from('forecast_daily')
      .select('*')
      .eq('run_id', runId)
      .order('forecast_date', { ascending: true })
      .order('product_id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      return { data: [], error: new Error(error.message) };
    }
    if (!data || data.length === 0) {
      break;
    }
    allRows.push(...(data as ForecastDaily[]));
    if (data.length < PAGE_SIZE) {
      break;
    }
    from += PAGE_SIZE;
  }

  return { data: allRows, error: null };
}

/**
 * Compute alerts from products, forecast_daily, and the latest forecast run.
 *
 * Rules:
 * - Low stock: current_stock <= reorder_level.
 * - Predicted stock-out: cumulative predicted demand over next 30 days > current_stock.
 *   Shows the estimated stock-out date from forecast_daily.
 * - Overstock: current_stock > 45 days of predicted demand ((predicted_30d / 30) * 45).
 * - Slow mover: bottom 10% of active products by predicted 30-day units,
 *   EXCLUDING any product that has Low stock or Stock-out risk (no contradictions).
 * - Suggested reorder quantity (for low-stock and stock-out items):
 *   Math.max(0, Math.ceil(predicted_14d_demand + reorder_level - current_stock))
 */
export function computeProductAlerts(params: {
  products: Product[];
  forecasts: Forecast[];
  forecastDaily: ForecastDaily[];
  isManager: boolean;
}): ProductAlert[] {
  const { products, forecasts, forecastDaily, isManager } = params;

  // Clerks only see Low stock alerts based on products only (no forecast or profit data)
  if (!isManager) {
    return products
      .filter((p) => p.current_stock <= p.reorder_level)
      .map((p) => ({
        id: `${p.id}_low_stock`,
        product: p,
        alertType: 'low_stock' as const,
        alertLabel: 'Low stock',
        priority: 2,
        currentStock: p.current_stock,
        reorderLevel: p.reorder_level,
        predictedDemand30d: null,
        predictedDemand14d: null,
        daysOfStockLeft: null,
        stockOutDate: null,
        suggestedReorder: Math.max(
          0,
          Math.ceil(p.reorder_level - p.current_stock)
        ),
      }))
      .sort(
        (a, b) =>
          a.currentStock - b.currentStock ||
          a.product.name.localeCompare(b.product.name)
      );
  }

  // Build lookup of 30-day forecast summary by product_id
  const forecast30ByProduct = new Map<string, Forecast>();
  for (const f of forecasts) {
    if (f.horizon_days === 30) {
      forecast30ByProduct.set(f.product_id, f);
    }
  }

  // Group daily predictions by product_id sorted by forecast_date ASC (day 0 .. day 29)
  const dailyByProduct = new Map<string, ForecastDaily[]>();
  for (const d of forecastDaily) {
    let list = dailyByProduct.get(d.product_id);
    if (!list) {
      list = [];
      dailyByProduct.set(d.product_id, list);
    }
    list.push(d);
  }
  for (const list of dailyByProduct.values()) {
    list.sort((a, b) => a.forecast_date.localeCompare(b.forecast_date));
  }

  const hasForecast = forecast30ByProduct.size > 0;

  // Identify slow movers: bottom 10% of active products by predicted 30-day units
  const slowMoverIds = new Set<string>();
  if (hasForecast && products.length > 0) {
    const bottomCount = Math.max(1, Math.floor(products.length * 0.1));
    const rankedBy30d = [...products]
      .map((p) => ({
        id: p.id,
        units30: forecast30ByProduct.get(p.id)?.predicted_units ?? 0,
      }))
      .sort((a, b) => a.units30 - b.units30);

    for (let i = 0; i < bottomCount && i < rankedBy30d.length; i++) {
      slowMoverIds.add(rankedBy30d[i].id);
    }
  }

  const alerts: ProductAlert[] = [];

  for (const product of products) {
    const f30 = forecast30ByProduct.get(product.id);
    const dailyList = dailyByProduct.get(product.id) || [];

    const predicted30d = hasForecast
      ? f30?.predicted_units ??
        dailyList.reduce((acc, item) => acc + item.predicted_units, 0)
      : null;

    const predicted14d = hasForecast
      ? dailyList.length > 0
        ? dailyList
            .slice(0, 14)
            .reduce((acc, item) => acc + item.predicted_units, 0)
        : Math.round(((predicted30d ?? 0) * 14) / 30)
      : null;

    const dailyRate =
      predicted30d !== null && predicted30d > 0 ? predicted30d / 30 : 0;
    const daysOfStockLeft = hasForecast
      ? product.current_stock <= 0
        ? 0
        : dailyRate > 0
        ? Math.round(product.current_stock / dailyRate)
        : 999
      : null;

    // Estimated stock-out date:
    // Walk day-by-day in ascending date order starting from the first forecast day (day index 0).
    // The estimated stock-out date is the first forecast day where cumulative predicted demand
    // from the first forecast day exceeds current_stock (cumulative > current_stock).
    let stockOutDate: string | null = null;
    if (hasForecast && dailyList.length > 0) {
      let cumulative = 0;
      for (const dayRow of dailyList) {
        cumulative += dayRow.predicted_units;
        if (cumulative > product.current_stock) {
          stockOutDate = dayRow.forecast_date;
          break;
        }
      }
    } else if (
      hasForecast &&
      predicted30d !== null &&
      predicted30d > product.current_stock &&
      predicted30d > 0
    ) {
      // Fallback if daily rows are unavailable: 0-indexed offset from the first forecast day
      // (dayOffset = 0 means stock runs out on the very first forecast day, avoiding an off-by-one shift).
      const dayOffset = Math.max(
        0,
        Math.min(29, Math.floor((product.current_stock / predicted30d) * 30))
      );
      const baseDateStr =
        f30?.forecast_date || new Date().toISOString().slice(0, 10);
      const [y, m, d] = baseDateStr.split('-').map(Number);
      const outDate = new Date(Date.UTC(y, m - 1, d + dayOffset));
      stockOutDate = outDate.toISOString().slice(0, 10);
    }

    const isStockOutRisk =
      hasForecast &&
      predicted30d !== null &&
      predicted30d > product.current_stock;

    const isLowStock = product.current_stock <= product.reorder_level;

    // Overstock: current_stock > 45 days of predicted demand
    const demand45d =
      predicted30d !== null ? (predicted30d / 30) * 45 : null;
    const isOverstock =
      hasForecast &&
      demand45d !== null &&
      demand45d > 0 &&
      product.current_stock > demand45d;

    // A product with Low stock or Stock-out risk must NOT also be labelled Slow mover
    const isSlowMover =
      hasForecast &&
      slowMoverIds.has(product.id) &&
      !isLowStock &&
      !isStockOutRisk;

    // Suggested reorder quantity for low-stock and stock-out items:
    // predicted 14-day demand + reorder_level - current_stock, rounded up, min 0
    const reorderQty = Math.max(
      0,
      Math.ceil(
        (predicted14d ?? 0) + product.reorder_level - product.current_stock
      )
    );

    if (isStockOutRisk) {
      alerts.push({
        id: `${product.id}_stock_out_risk`,
        product,
        alertType: 'stock_out_risk',
        alertLabel: 'Stock-out risk',
        priority: 1,
        currentStock: product.current_stock,
        reorderLevel: product.reorder_level,
        predictedDemand30d: predicted30d,
        predictedDemand14d: predicted14d,
        daysOfStockLeft,
        stockOutDate,
        suggestedReorder: reorderQty,
      });
    }

    if (isLowStock) {
      alerts.push({
        id: `${product.id}_low_stock`,
        product,
        alertType: 'low_stock',
        alertLabel: 'Low stock',
        priority: 2,
        currentStock: product.current_stock,
        reorderLevel: product.reorder_level,
        predictedDemand30d: predicted30d,
        predictedDemand14d: predicted14d,
        daysOfStockLeft,
        stockOutDate,
        suggestedReorder: reorderQty,
      });
    }

    if (isOverstock) {
      alerts.push({
        id: `${product.id}_overstock`,
        product,
        alertType: 'overstock',
        alertLabel: 'Overstock',
        priority: 3,
        currentStock: product.current_stock,
        reorderLevel: product.reorder_level,
        predictedDemand30d: predicted30d,
        predictedDemand14d: predicted14d,
        daysOfStockLeft,
        stockOutDate: null,
        suggestedReorder: null,
      });
    }

    if (isSlowMover) {
      alerts.push({
        id: `${product.id}_slow_mover`,
        product,
        alertType: 'slow_mover',
        alertLabel: 'Slow mover',
        priority: 4,
        currentStock: product.current_stock,
        reorderLevel: product.reorder_level,
        predictedDemand30d: predicted30d,
        predictedDemand14d: predicted14d,
        daysOfStockLeft,
        stockOutDate: null,
        suggestedReorder: null,
      });
    }
  }

  // Sort stock-out risk first, earliest stock-out date first, then lowest current stock
  alerts.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    if (a.stockOutDate && b.stockOutDate && a.stockOutDate !== b.stockOutDate) {
      return a.stockOutDate.localeCompare(b.stockOutDate);
    }
    if (a.stockOutDate && !b.stockOutDate) return -1;
    if (!a.stockOutDate && b.stockOutDate) return 1;
    if (a.currentStock !== b.currentStock) {
      return a.currentStock - b.currentStock;
    }
    return a.product.name.localeCompare(b.product.name);
  });

  return alerts;
}
