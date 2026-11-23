import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

export interface ProductRow {
  id: string;
  name: string;
  sku: string;
  cost_price: number;
  selling_price: number;
  current_stock: number;
  reorder_level: number;
  categories?: { name: string } | null;
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
  current_stock: number;
  reorder_level: number;
  predicted_14d_units: number | null;
  predicted_30d_units: number | null;
  days_of_stock_left: number | null;
  stock_out_date: string | null;
  suggested_reorder_units: number | null;
}

/**
 * Shared server-side helper used by BOTH `ai-insights` and `ai-assistant`
 * so the language model always receives the exact same verified dataset.
 */
export async function buildSupermarketSummary(adminClient: SupabaseClient) {
  const { data: latestForecast } = await adminClient
    .from('forecasts')
    .select('run_id, generated_at')
    .not('run_id', 'is', null)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: prodData, error: prodErr } = await adminClient
    .from('products')
    .select(
      'id, name, sku, cost_price, selling_price, current_stock, reorder_level, categories(name)'
    )
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (prodErr || !prodData) {
    throw new Error(`Failed to load products: ${prodErr?.message}`);
  }

  const products = prodData as unknown as ProductRow[];
  let forecasts: ForecastRow[] = [];
  let forecastDaily: ForecastDailyRow[] = [];

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

  // Identify slow movers: bottom 10% of products by predicted 30-day units
  const slowMoverIds = new Set<string>();
  if (hasForecast && products.length > 0) {
    const bottomCount = Math.max(1, Math.floor(products.length * 0.1));
    const sortedByUnits30 = [...products]
      .map((p) => ({
        id: p.id,
        units30: f30ByProduct.get(p.id)?.predicted_units ?? 0,
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
    reorder_level: number;
    days_of_stock_left: number | null;
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
    const dailyList = dailyByProduct.get(p.id) || [];

    const u7 = f7?.predicted_units ?? 0;
    const r7 = f7?.predicted_revenue ?? 0;
    const pf7 = f7?.predicted_profit ?? 0;

    const u30 = f30?.predicted_units ?? 0;
    const r30 = f30?.predicted_revenue ?? 0;
    const pf30 = f30?.predicted_profit ?? 0;

    const stockCostVal = p.current_stock * p.cost_price;

    totalUnits7 += u7;
    totalRevenue7 += r7;
    totalProfit7 += pf7;
    totalUnits30 += u30;
    totalRevenue30 += r30;
    totalProfit30 += pf30;
    totalStockValueAtCost += stockCostVal;

    if (hasForecast) {
      const w = Math.max(1, u30);
      weightedWapeSum += Number(f30?.wape ?? 0) * w;
      weightedBaselineWapeSum += Number(f30?.baseline_wape ?? 0) * w;
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
    catAgg.predicted_7d_units += u7;
    catAgg.predicted_7d_revenue_rwf += r7;
    catAgg.predicted_7d_profit_rwf += pf7;
    catAgg.predicted_30d_units += u30;
    catAgg.predicted_30d_revenue_rwf += r30;
    catAgg.predicted_30d_profit_rwf += pf30;
    categoryTotalsMap.set(catName, catAgg);

    const dailyRate = hasForecast && u30 > 0 ? u30 / 30 : 0;
    const daysOfStockLeft = hasForecast
      ? p.current_stock <= 0
        ? 0
        : dailyRate > 0
        ? Math.round(p.current_stock / dailyRate)
        : 999
      : null;

    productSummaries.push({
      name: p.name,
      sku: p.sku,
      category: catName,
      current_stock: p.current_stock,
      reorder_level: p.reorder_level,
      days_of_stock_left: daysOfStockLeft,
      predicted_7d_units: u7,
      predicted_7d_revenue_rwf: r7,
      predicted_7d_profit_rwf: pf7,
      predicted_30d_units: u30,
      predicted_30d_revenue_rwf: r30,
      predicted_30d_profit_rwf: pf30,
    });

    const u14 = hasForecast
      ? dailyList.length > 0
        ? dailyList
            .slice(0, 14)
            .reduce((acc, item) => acc + item.predicted_units, 0)
        : Math.round((u30 * 14) / 30)
      : null;

    let stockOutDate: string | null = null;
    if (hasForecast && dailyList.length > 0) {
      let cumulative = 0;
      for (const dayRow of dailyList) {
        cumulative += dayRow.predicted_units;
        if (cumulative > p.current_stock) {
          stockOutDate = dayRow.forecast_date;
          break;
        }
      }
    }

    const isStockOutRisk = hasForecast && u30 > p.current_stock;
    const isLowStock = p.current_stock <= p.reorder_level;
    const isOverstock =
      hasForecast && u30 > 0 && p.current_stock > (u30 / 30) * 45;

    // NO CONTRADICTIONS: a product with Low stock or Stock-out risk must NOT also be labelled Slow mover
    const isSlowMover =
      hasForecast &&
      slowMoverIds.has(p.id) &&
      !isLowStock &&
      !isStockOutRisk;

    const suggestedReorder = Math.max(
      0,
      Math.ceil((u14 ?? 0) + p.reorder_level - p.current_stock)
    );

    if (isStockOutRisk) {
      allAlerts.push({
        product: p.name,
        sku: p.sku,
        category: catName,
        alert_type: 'stock_out_risk',
        alert_label: 'Stock-out risk',
        priority: 1,
        current_stock: p.current_stock,
        reorder_level: p.reorder_level,
        predicted_14d_units: u14,
        predicted_30d_units: u30,
        days_of_stock_left: daysOfStockLeft,
        stock_out_date: stockOutDate,
        suggested_reorder_units: suggestedReorder,
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
        current_stock: p.current_stock,
        reorder_level: p.reorder_level,
        predicted_14d_units: u14,
        predicted_30d_units: hasForecast ? u30 : null,
        days_of_stock_left: daysOfStockLeft,
        stock_out_date: stockOutDate,
        suggested_reorder_units: suggestedReorder,
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
        current_stock: p.current_stock,
        reorder_level: p.reorder_level,
        predicted_14d_units: u14,
        predicted_30d_units: u30,
        days_of_stock_left: daysOfStockLeft,
        stock_out_date: null,
        suggested_reorder_units: null,
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
        current_stock: p.current_stock,
        reorder_level: p.reorder_level,
        predicted_14d_units: u14,
        predicted_30d_units: u30,
        days_of_stock_left: daysOfStockLeft,
        stock_out_date: null,
        suggested_reorder_units: null,
      });
    }
  }

  // Sort alerts in the exact same order as the Dashboard & Alerts page:
  // Stock-out risk first, earliest stock-out date first, then lowest current stock
  allAlerts.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    if (
      a.stock_out_date &&
      b.stock_out_date &&
      a.stock_out_date !== b.stock_out_date
    ) {
      return a.stock_out_date.localeCompare(b.stock_out_date);
    }
    if (a.stock_out_date && !b.stock_out_date) return -1;
    if (!a.stock_out_date && b.stock_out_date) return 1;
    if (a.current_stock !== b.current_stock) {
      return a.current_stock - b.current_stock;
    }
    return a.product.localeCompare(b.product);
  });

  const avgWape = weightSum > 0 ? weightedWapeSum / weightSum : 0;
  const avgBaselineWape =
    weightSum > 0 ? weightedBaselineWapeSum / weightSum : 0;
  const modelAccuracy = Number(
    Math.max(0, Math.min(100, 100 - avgWape)).toFixed(1)
  );
  const baselineAccuracy = Number(
    Math.max(0, Math.min(100, 100 - avgBaselineWape)).toFixed(1)
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
    forecast_generated_at: latestForecast?.generated_at ?? null,
    totals_7_days: {
      predicted_units: totalUnits7,
      predicted_revenue_rwf: totalRevenue7,
      predicted_profit_rwf: totalProfit7,
    },
    totals_30_days: {
      predicted_units: totalUnits30,
      predicted_revenue_rwf: totalRevenue30,
      predicted_profit_rwf: totalProfit30,
    },
    inventory_overview: {
      active_products_count: products.length,
      total_stock_value_at_cost_rwf: totalStockValueAtCost,
      low_stock_products_count: products.filter(
        (p) => p.current_stock <= p.reorder_level
      ).length,
      stock_out_risk_count: stockOutAlerts.length,
      overstock_count: overstockAlerts.length,
      slow_mover_count: slowMoverAlerts.length,
    },
    model_performance: hasForecast
      ? {
          model_name: 'ridge_regression',
          model_accuracy_percent: modelAccuracy,
          model_wape_percent: Number(avgWape.toFixed(1)),
          baseline_7d_ma_accuracy_percent: baselineAccuracy,
          baseline_wape_percent: Number(avgBaselineWape.toFixed(1)),
        }
      : null,
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

