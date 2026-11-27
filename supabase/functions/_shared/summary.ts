import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

export interface ProductRow {
  id: string;
  name: string;
  sku: string;
  cost_price: number;
  selling_price: number;
  current_stock: number;
  reorder_level: number;
  tracks_expiry?: boolean;
  categories?: { name: string } | null;
}

export interface StockBatchRow {
  id: string;
  product_id: string;
  received_on: string;
  expiry_date: string;
  quantity_received: number;
  quantity_remaining: number;
  status: 'active' | 'written_off';
}

export interface ForecastRow {
  id: string;
  run_id: string;
  product_id: string;
  horizon_days: number;
  predicted_units: number;
  predicted_revenue: number;
  predicted_profit: number;
  wape: number | null;
  baseline_wape: number | null;
  generated_at: string;
}

export interface ForecastDailyRow {
  product_id: string;
  forecast_date: string;
  predicted_units: number;
}

export interface SummaryAlertItem {
  product: string;
  sku: string;
  category: string;
  alert_type: 'stock_out_risk' | 'low_stock' | 'overstock' | 'slow_mover';
  alert_label: 'Stock-out risk' | 'Low stock' | 'Overstock' | 'Slow mover';
  priority: number;
  current_stock: number; // Sellable stock for tracked products
  on_hand_stock: number;
  reorder_level: number;
  predicted_14d_units: number;
  predicted_30d_units: number;
  days_of_stock_left: number;
  stock_out_date: string;
  suggested_reorder_units: number;
}

/**
 * Guarantee a finite number (never NaN, null, or Infinity).
 */
function safeNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function formatDateUTC(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function computeDaysDiffUTC(expiryDateStr: string, todayStr: string): number {
  const [ey, em, ed] = expiryDateStr.split('-').map(Number);
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const expiryUtc = Date.UTC(ey, em - 1, ed);
  const todayUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((expiryUtc - todayUtc) / 86400000);
}

/**
 * Shared server-side helper used by BOTH `ai-insights` and `ai-assistant`
 * so the language model always receives the exact same verified dataset,
 * using sellable stock for expiry-tracked products, and never receives NaN or null figures.
 */
export async function buildSupermarketSummary(adminClient: SupabaseClient) {
  const now = new Date();
  const todayStr = formatDateUTC(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  );

  const [latestForecastRes, prodRes, batchesRes] = await Promise.all([
    adminClient
      .from('forecasts')
      .select('run_id, generated_at')
      .not('run_id', 'is', null)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    adminClient
      .from('products')
      .select(
        'id, name, sku, cost_price, selling_price, current_stock, reorder_level, tracks_expiry, categories(name)'
      )
      .eq('is_active', true)
      .order('name', { ascending: true }),
    adminClient
      .from('stock_batches')
      .select(
        'id, product_id, received_on, expiry_date, quantity_received, quantity_remaining, status'
      )
      .eq('status', 'active')
      .gt('quantity_remaining', 0),
  ]);

  const latestForecast = latestForecastRes.data;

  if (prodRes.error || !prodRes.data) {
    throw new Error(`Failed to load products: ${prodRes.error?.message}`);
  }

  const products = prodRes.data as unknown as ProductRow[];
  const activeBatches = (batchesRes.data as StockBatchRow[]) || [];

  const productById = new Map<string, ProductRow>();
  for (const p of products) {
    productById.set(p.id, p);
  }

  // Compute expired active units per product and build expired / expiring-soon list
  const expiredUnitsByProduct = new Map<string, number>();
  let expiredUnitsTotal = 0;
  let expiredValueAtCostRwf = 0;
  let expiring7dUnitsTotal = 0;
  let expiring7dValueAtCostRwf = 0;
  let expiring30dUnitsTotal = 0;
  let expiring30dValueAtCostRwf = 0;

  const expiredAndExpiringItems: Array<{
    product: string;
    sku: string;
    category: string;
    expiry_date: string;
    days_until_expiry: number;
    status_label: string;
    units: number;
    value_at_cost_rwf: number;
  }> = [];

  for (const b of activeBatches) {
    const prod = productById.get(b.product_id);
    if (!prod) continue;

    const units = safeNumber(b.quantity_remaining, 0);
    if (units <= 0) continue;

    const costPrice = safeNumber(prod.cost_price, 0);
    const valueAtCost = units * costPrice;
    const daysLeft = computeDaysDiffUTC(b.expiry_date, todayStr);
    const catName = prod.categories?.name || 'Uncategorized';

    if (daysLeft < 0) {
      expiredUnitsByProduct.set(
        b.product_id,
        (expiredUnitsByProduct.get(b.product_id) || 0) + units
      );
      expiredUnitsTotal += units;
      expiredValueAtCostRwf += valueAtCost;

      expiredAndExpiringItems.push({
        product: prod.name,
        sku: prod.sku,
        category: catName,
        expiry_date: b.expiry_date,
        days_until_expiry: daysLeft,
        status_label: `Expired ${Math.abs(daysLeft)} days ago`,
        units,
        value_at_cost_rwf: valueAtCost,
      });
    } else if (daysLeft <= 30) {
      expiring30dUnitsTotal += units;
      expiring30dValueAtCostRwf += valueAtCost;

      if (daysLeft <= 7) {
        expiring7dUnitsTotal += units;
        expiring7dValueAtCostRwf += valueAtCost;
      }

      expiredAndExpiringItems.push({
        product: prod.name,
        sku: prod.sku,
        category: catName,
        expiry_date: b.expiry_date,
        days_until_expiry: daysLeft,
        status_label:
          daysLeft <= 7
            ? 'Expiring within 7 days'
            : 'Expiring within 30 days',
        units,
        value_at_cost_rwf: valueAtCost,
      });
    }
  }

  // Top 10 expired and expiring-soon items by value at cost (RWF)
  const top10ExpiredAndExpiringByCost = [...expiredAndExpiringItems]
    .sort((a, b) => b.value_at_cost_rwf - a.value_at_cost_rwf)
    .slice(0, 10);

  let forecasts: ForecastRow[] = [];
  const forecastDaily: ForecastDailyRow[] = [];

  if (latestForecast?.run_id) {
    const forecastsRes = await adminClient
      .from('forecasts')
      .select('*')
      .eq('run_id', latestForecast.run_id);

    if (forecastsRes.error) {
      throw new Error(
        `Failed to load forecast summaries: ${forecastsRes.error.message}`
      );
    }
    forecasts = (forecastsRes.data as ForecastRow[]) || [];

    // Paginate forecast_daily with .range() so PostgREST's 1,000-row limit
    // never truncates the 1,500 rows (50 products × 30 forecast days).
    const PAGE_SIZE = 1000;
    let from = 0;
    while (true) {
      const { data: page, error: dailyErr } = await adminClient
        .from('forecast_daily')
        .select('product_id, forecast_date, predicted_units')
        .eq('run_id', latestForecast.run_id)
        .order('forecast_date', { ascending: true })
        .order('product_id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (dailyErr) {
        throw new Error(
          `Failed to load daily forecasts: ${dailyErr.message}`
        );
      }
      if (!page || page.length === 0) {
        break;
      }
      forecastDaily.push(...(page as ForecastDailyRow[]));
      if (page.length < PAGE_SIZE) {
        break;
      }
      from += PAGE_SIZE;
    }
  }

  const f7ByProduct = new Map<string, ForecastRow>();
  const f30ByProduct = new Map<string, ForecastRow>();
  for (const f of forecasts) {
    if (f.horizon_days === 7) f7ByProduct.set(f.product_id, f);
    if (f.horizon_days === 30) f30ByProduct.set(f.product_id, f);
  }

  const dailyByProduct = new Map<string, ForecastDailyRow[]>();
  for (const d of forecastDaily) {
    let arr = dailyByProduct.get(d.product_id);
    if (!arr) {
      arr = [];
      dailyByProduct.set(d.product_id, arr);
    }
    arr.push(d);
  }
  for (const list of dailyByProduct.values()) {
    list.sort((a, b) => a.forecast_date.localeCompare(b.forecast_date));
  }

  const hasForecast = f30ByProduct.size > 0;

  // Identify slow movers: bottom 10% of forecasted products by predicted 30-day units
  const slowMoverIds = new Set<string>();
  const forecastedProducts = products.filter((p) => f30ByProduct.has(p.id));
  if (hasForecast && forecastedProducts.length > 0) {
    const bottomCount = Math.max(1, Math.floor(forecastedProducts.length * 0.1));
    const sortedByUnits30 = [...forecastedProducts]
      .map((p) => ({
        id: p.id,
        units30: safeNumber(f30ByProduct.get(p.id)?.predicted_units, 0),
      }))
      .sort((a, b) => a.units30 - b.units30);

    for (let i = 0; i < bottomCount && i < sortedByUnits30.length; i++) {
      slowMoverIds.add(sortedByUnits30[i].id);
    }
  }

  let totalUnits7 = 0;
  let totalRevenue7 = 0;
  let totalProfit7 = 0;
  let totalUnits30 = 0;
  let totalRevenue30 = 0;
  let totalProfit30 = 0;
  let totalStockValueAtCost = 0;
  let lowStockProductsCount = 0;
  let weightedWapeSum = 0;
  let weightedBaselineWapeSum = 0;
  let weightSum = 0;

  const categoryTotalsMap = new Map<
    string,
    {
      category: string;
      product_count: number;
      stock_value_at_cost_rwf: number;
      predicted_7d_units: number;
      predicted_7d_revenue_rwf: number;
      predicted_7d_profit_rwf: number;
      predicted_30d_units: number;
      predicted_30d_revenue_rwf: number;
      predicted_30d_profit_rwf: number;
    }
  >();

  const allAlerts: SummaryAlertItem[] = [];

  const productSummaries: Array<{
    name: string;
    sku: string;
    category: string;
    current_stock: number;
    on_hand_stock: number;
    reorder_level: number;
    days_of_stock_left: number;
    predicted_7d_units: number;
    predicted_7d_revenue_rwf: number;
    predicted_7d_profit_rwf: number;
    predicted_30d_units: number;
    predicted_30d_revenue_rwf: number;
    predicted_30d_profit_rwf: number;
  }> = [];

  for (const p of products) {
    const catName = p.categories?.name || 'Uncategorized';
    const f7 = f7ByProduct.get(p.id);
    const f30 = f30ByProduct.get(p.id);
    const productHasForecast = Boolean(f7 && f30);
    const dailyList = dailyByProduct.get(p.id) || [];

    const onHandStock = safeNumber(p.current_stock, 0);
    const expiredUnits = p.tracks_expiry
      ? safeNumber(expiredUnitsByProduct.get(p.id), 0)
      : 0;
    // Sellable stock = current_stock minus units in expired active batches
    const sellableStock = Math.max(0, onHandStock - expiredUnits);

    const reorderLevel = safeNumber(p.reorder_level, 0);
    const costPrice = safeNumber(p.cost_price, 0);
    const stockCostVal = sellableStock * costPrice;
    totalStockValueAtCost += stockCostVal;

    if (sellableStock <= reorderLevel) {
      lowStockProductsCount += 1;
    }

    const u7 = productHasForecast ? safeNumber(f7?.predicted_units, 0) : 0;
    const r7 = productHasForecast ? safeNumber(f7?.predicted_revenue, 0) : 0;
    const pf7 = productHasForecast ? safeNumber(f7?.predicted_profit, 0) : 0;

    const u30 = productHasForecast ? safeNumber(f30?.predicted_units, 0) : 0;
    const r30 = productHasForecast ? safeNumber(f30?.predicted_revenue, 0) : 0;
    const pf30 = productHasForecast ? safeNumber(f30?.predicted_profit, 0) : 0;

    if (productHasForecast) {
      totalUnits7 += u7;
      totalRevenue7 += r7;
      totalProfit7 += pf7;
      totalUnits30 += u30;
      totalRevenue30 += r30;
      totalProfit30 += pf30;

      const w = Math.max(1, u30);
      weightedWapeSum += safeNumber(f30?.wape, 0) * w;
      weightedBaselineWapeSum += safeNumber(f30?.baseline_wape, 0) * w;
      weightSum += w;
    }

    const catAgg = categoryTotalsMap.get(catName) || {
      category: catName,
      product_count: 0,
      stock_value_at_cost_rwf: 0,
      predicted_7d_units: 0,
      predicted_7d_revenue_rwf: 0,
      predicted_7d_profit_rwf: 0,
      predicted_30d_units: 0,
      predicted_30d_revenue_rwf: 0,
      predicted_30d_profit_rwf: 0,
    };
    catAgg.product_count += 1;
    catAgg.stock_value_at_cost_rwf += stockCostVal;
    if (productHasForecast) {
      catAgg.predicted_7d_units += u7;
      catAgg.predicted_7d_revenue_rwf += r7;
      catAgg.predicted_7d_profit_rwf += pf7;
      catAgg.predicted_30d_units += u30;
      catAgg.predicted_30d_revenue_rwf += r30;
      catAgg.predicted_30d_profit_rwf += pf30;
    }
    categoryTotalsMap.set(catName, catAgg);

    const dailyRate = productHasForecast && u30 > 0 ? u30 / 30 : 0;
    const daysOfStockLeft = productHasForecast
      ? sellableStock <= 0
        ? 0
        : dailyRate > 0
        ? Math.round(sellableStock / dailyRate)
        : 999
      : 0;

    if (productHasForecast) {
      productSummaries.push({
        name: p.name,
        sku: p.sku,
        category: catName,
        current_stock: sellableStock,
        on_hand_stock: onHandStock,
        reorder_level: reorderLevel,
        days_of_stock_left: safeNumber(daysOfStockLeft, 0),
        predicted_7d_units: u7,
        predicted_7d_revenue_rwf: r7,
        predicted_7d_profit_rwf: pf7,
        predicted_30d_units: u30,
        predicted_30d_revenue_rwf: r30,
        predicted_30d_profit_rwf: pf30,
      });
    }

    const u14 = productHasForecast
      ? dailyList.length > 0
        ? dailyList
            .slice(0, 14)
            .reduce(
              (acc, item) => acc + safeNumber(item.predicted_units, 0),
              0
            )
        : Math.round((u30 * 14) / 30)
      : 0;

    // Estimated stock-out date: first forecast day where cumulative predicted demand exceeds sellableStock
    let stockOutDate = 'none';
    if (productHasForecast && dailyList.length > 0) {
      let cumulative = 0;
      for (const dayRow of dailyList) {
        cumulative += safeNumber(dayRow.predicted_units, 0);
        if (cumulative > sellableStock) {
          stockOutDate = dayRow.forecast_date;
          break;
        }
      }
    }

    const isStockOutRisk = productHasForecast && u30 > sellableStock;
    const isLowStock = sellableStock <= reorderLevel;
    const isOverstock =
      productHasForecast && u30 > 0 && sellableStock > (u30 / 30) * 45;

    // NO CONTRADICTIONS: a product with Low stock or Stock-out risk must NOT also be labelled Slow mover
    const isSlowMover =
      productHasForecast &&
      slowMoverIds.has(p.id) &&
      !isLowStock &&
      !isStockOutRisk;

    const suggestedReorder = Math.max(
      0,
      Math.ceil(u14 + reorderLevel - sellableStock)
    );

    if (isStockOutRisk) {
      allAlerts.push({
        product: p.name,
        sku: p.sku,
        category: catName,
        alert_type: 'stock_out_risk',
        alert_label: 'Stock-out risk',
        priority: 1,
        current_stock: sellableStock,
        on_hand_stock: onHandStock,
        reorder_level: reorderLevel,
        predicted_14d_units: safeNumber(u14, 0),
        predicted_30d_units: safeNumber(u30, 0),
        days_of_stock_left: safeNumber(daysOfStockLeft, 0),
        stock_out_date: stockOutDate,
        suggested_reorder_units: safeNumber(suggestedReorder, 0),
      });
    }

    if (isLowStock) {
      allAlerts.push({
        product: p.name,
        sku: p.sku,
        category: catName,
        alert_type: 'low_stock',
        alert_label: 'Low stock',
        priority: 2,
        current_stock: sellableStock,
        on_hand_stock: onHandStock,
        reorder_level: reorderLevel,
        predicted_14d_units: safeNumber(u14, 0),
        predicted_30d_units: safeNumber(u30, 0),
        days_of_stock_left: safeNumber(daysOfStockLeft, 0),
        stock_out_date: stockOutDate,
        suggested_reorder_units: safeNumber(suggestedReorder, 0),
      });
    }

    if (isOverstock) {
      allAlerts.push({
        product: p.name,
        sku: p.sku,
        category: catName,
        alert_type: 'overstock',
        alert_label: 'Overstock',
        priority: 3,
        current_stock: sellableStock,
        on_hand_stock: onHandStock,
        reorder_level: reorderLevel,
        predicted_14d_units: safeNumber(u14, 0),
        predicted_30d_units: safeNumber(u30, 0),
        days_of_stock_left: safeNumber(daysOfStockLeft, 0),
        stock_out_date: 'none',
        suggested_reorder_units: 0,
      });
    }

    if (isSlowMover) {
      allAlerts.push({
        product: p.name,
        sku: p.sku,
        category: catName,
        alert_type: 'slow_mover',
        alert_label: 'Slow mover',
        priority: 4,
        current_stock: sellableStock,
        on_hand_stock: onHandStock,
        reorder_level: reorderLevel,
        predicted_14d_units: safeNumber(u14, 0),
        predicted_30d_units: safeNumber(u30, 0),
        days_of_stock_left: safeNumber(daysOfStockLeft, 0),
        stock_out_date: 'none',
        suggested_reorder_units: 0,
      });
    }
  }

  // Sort alerts in the exact same order as the Dashboard & Alerts page
  allAlerts.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    const aHasDate = a.stock_out_date !== 'none';
    const bHasDate = b.stock_out_date !== 'none';
    if (aHasDate && bHasDate && a.stock_out_date !== b.stock_out_date) {
      return a.stock_out_date.localeCompare(b.stock_out_date);
    }
    if (aHasDate && !bHasDate) return -1;
    if (!aHasDate && bHasDate) return 1;
    if (a.current_stock !== b.current_stock) {
      return a.current_stock - b.current_stock;
    }
    return a.product.localeCompare(b.product);
  });

  const avgWape =
    weightSum > 0 ? safeNumber(weightedWapeSum / weightSum, 0) : 0;
  const avgBaselineWape =
    weightSum > 0 ? safeNumber(weightedBaselineWapeSum / weightSum, 0) : 0;
  const modelAccuracy = safeNumber(
    Number(Math.max(0, Math.min(100, 100 - avgWape)).toFixed(1)),
    0
  );
  const baselineAccuracy = safeNumber(
    Number(Math.max(0, Math.min(100, 100 - avgBaselineWape)).toFixed(1)),
    0
  );

  const top10ByProfit = [...productSummaries]
    .sort((a, b) => b.predicted_30d_profit_rwf - a.predicted_30d_profit_rwf)
    .slice(0, 10);

  const stockOutAlerts = allAlerts.filter(
    (a) => a.alert_type === 'stock_out_risk'
  );
  const lowStockAlerts = allAlerts.filter((a) => a.alert_type === 'low_stock');
  const overstockAlerts = allAlerts.filter((a) => a.alert_type === 'overstock');
  const slowMoverAlerts = allAlerts.filter(
    (a) => a.alert_type === 'slow_mover'
  );

  const summary = {
    currency: 'RWF (Rwandan Francs, whole integers)',
    has_forecast_run: hasForecast,
    forecast_generated_at: latestForecast?.generated_at || 'not_run_yet',
    totals_7_days: {
      predicted_units: safeNumber(totalUnits7, 0),
      predicted_revenue_rwf: safeNumber(totalRevenue7, 0),
      predicted_profit_rwf: safeNumber(totalProfit7, 0),
    },
    totals_30_days: {
      predicted_units: safeNumber(totalUnits30, 0),
      predicted_revenue_rwf: safeNumber(totalRevenue30, 0),
      predicted_profit_rwf: safeNumber(totalProfit30, 0),
    },
    inventory_overview: {
      active_products_count: safeNumber(products.length, 0),
      forecasted_products_count: safeNumber(forecastedProducts.length, 0),
      total_stock_value_at_cost_rwf: safeNumber(totalStockValueAtCost, 0),
      low_stock_products_count: safeNumber(lowStockProductsCount, 0),
      stock_out_risk_count: safeNumber(stockOutAlerts.length, 0),
      overstock_count: safeNumber(overstockAlerts.length, 0),
      slow_mover_count: safeNumber(slowMoverAlerts.length, 0),
    },
    expiry_overview: {
      expired_units_total: safeNumber(expiredUnitsTotal, 0),
      expired_value_at_cost_rwf: safeNumber(expiredValueAtCostRwf, 0),
      expiring_within_7_days_units: safeNumber(expiring7dUnitsTotal, 0),
      expiring_within_7_days_value_at_cost_rwf: safeNumber(
        expiring7dValueAtCostRwf,
        0
      ),
      expiring_within_30_days_units: safeNumber(expiring30dUnitsTotal, 0),
      expiring_within_30_days_value_at_cost_rwf: safeNumber(
        expiring30dValueAtCostRwf,
        0
      ),
      expired_and_expiring_soon_top_10_by_cost: top10ExpiredAndExpiringByCost,
    },
    model_performance: {
      model_name: 'ridge_regression',
      model_accuracy_percent: modelAccuracy,
      model_wape_percent: safeNumber(Number(avgWape.toFixed(1)), 0),
      baseline_7d_ma_accuracy_percent: baselineAccuracy,
      baseline_wape_percent: safeNumber(Number(avgBaselineWape.toFixed(1)), 0),
    },
    top_5_urgent_alerts_dashboard_order: allAlerts.slice(0, 5),
    all_alerts_dashboard_order: allAlerts,
    stock_out_alerts: stockOutAlerts,
    low_stock_alerts: lowStockAlerts,
    overstock_alerts: overstockAlerts,
    slow_mover_alerts: slowMoverAlerts,
    top_10_products_by_predicted_30d_profit: top10ByProfit,
    category_totals: Array.from(categoryTotalsMap.values()).sort(
      (a, b) => b.predicted_30d_profit_rwf - a.predicted_30d_profit_rwf
    ),
  };

  return {
    latestForecast,
    summary,
  };
}
