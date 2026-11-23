/**
 * ============================================================================
 * SUPABASE EDGE FUNCTION: run-forecast
 * ============================================================================
 *
 * MODEL EXPLANATION (FOR PROJECT DEFENCE):
 * ----------------------------------------
 * 1. Algorithm: Ridge Regression (L2-Regularized Ordinary Least Squares).
 *    We model daily unit demand y_t for each product as a linear combination
 *    of calendar and trend features X_t:
 *
 *      y_hat = X * w
 *
 *    The weights w are solved in closed form via:
 *
 *      w = (X^T * X + lambda * I_reg)^(-1) * (X^T * y)
 *
 *    where lambda = 1.0 is the L2 regularization penalty and I_reg is the
 *    identity matrix with a 0 on the intercept diagonal (so the baseline
 *    demand intercept is not shrunk toward zero). Regularization prevents
 *    overfitting and guarantees that (X^T * X + lambda * I_reg) is always
 *    invertible even when collinear one-hot indicators are present.
 *
 * 2. Features (11 dimensions per day):
 *    - Intercept (1.0): baseline daily demand level for the product.
 *    - Trend Index (t / 180): captures gradual 6-month demand growth or decline.
 *    - Day-of-Week One-Hot (7 binary features, Sun..Sat): captures weekly
 *      shopping cycles (e.g., Friday evening and weekend supermarket surges).
 *    - Month-End Flag (1 if in the last 3 days or first 2 days of the month):
 *      captures household restocking at month transition.
 *    - Payday-Window Flag (1 if day of month >= 25): captures salary-driven
 *      purchasing spikes typical in Rwandan retail at month-end.
 *
 * 3. Backtesting & Accuracy Evaluation (WAPE):
 *    - For each product, we take the last 180 complete days of sales history
 *      (days without recorded sales are filled with 0).
 *    - We hold out the most recent 28 days as a test set and train on the
 *      preceding 152 days.
 *    - We compare our Ridge Regression predictions against a 7-day moving
 *      average baseline using WAPE (Weighted Absolute Percentage Error):
 *
 *        WAPE = ( sum(|Actual_t - Predicted_t|) / sum(Actual_t) ) * 100
 *
 *      WAPE is standard in retail demand forecasting because it weights errors
 *      by volume and avoids division-by-zero issues on zero-sale days.
 *    - Finally, we retrain on all 180 days and forecast the next 30 days,
 *      clamping negative values at 0 and rounding to whole units.
 * ============================================================================
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ProductRow {
  id: string;
  name: string;
  sku: string;
  cost_price: number;
  selling_price: number;
}

interface SaleRow {
  product_id: string;
  quantity: number;
  sold_on: string;
}

/**
 * Format a UTC Date object as YYYY-MM-DD.
 */
function formatDateUTC(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Return the total number of days in a given UTC year and 0-indexed UTC month.
 */
function getDaysInMonthUTC(year: number, monthZeroIndexed: number): number {
  return new Date(Date.UTC(year, monthZeroIndexed + 1, 0)).getUTCDate();
}

/**
 * Build the 11-element feature vector for a given UTC date and day index.
 * Features:
 *   [0]  Intercept (1)
 *   [1]  Normalized trend index (dayIndex / 180)
 *   [2..8] One-hot day of week (Sunday = 2 .. Saturday = 8)
 *   [9]  Month-end flag (last 3 days or first 2 days of the month)
 *   [10] Payday-window flag (25th to end of the month)
 */
function extractFeatures(date: Date, dayIndex: number): number[] {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const dayOfMonth = date.getUTCDate();
  const dayOfWeek = date.getUTCDay(); // 0 (Sun) .. 6 (Sat)
  const daysInMonth = getDaysInMonthUTC(year, month);

  const dowOneHot = [0, 0, 0, 0, 0, 0, 0];
  dowOneHot[dayOfWeek] = 1;

  const isMonthEnd = dayOfMonth >= daysInMonth - 2 || dayOfMonth <= 2 ? 1 : 0;
  const isPaydayWindow = dayOfMonth >= 25 ? 1 : 0;
  const trendIndex = dayIndex / 180;

  return [
    1,
    trendIndex,
    ...dowOneHot,
    isMonthEnd,
    isPaydayWindow,
  ];
}

/**
 * Solve a linear system A * x = b using Gaussian elimination with partial pivoting.
 */
function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Partial pivoting: find row with maximum absolute value in current column
    let maxRow = col;
    let maxVal = Math.abs(M[col][col]);
    for (let row = col + 1; row < n; row++) {
      const absVal = Math.abs(M[row][col]);
      if (absVal > maxVal) {
        maxVal = absVal;
        maxRow = row;
      }
    }

    // Swap rows
    if (maxRow !== col) {
      const temp = M[col];
      M[col] = M[maxRow];
      M[maxRow] = temp;
    }

    const pivot = M[col][col];
    if (Math.abs(pivot) < 1e-12) {
      continue;
    }

    // Eliminate column entries below pivot
    for (let row = col + 1; row < n; row++) {
      const factor = M[row][col] / pivot;
      for (let k = col; k <= n; k++) {
        M[row][k] -= factor * M[col][k];
      }
    }
  }

  // Back-substitution
  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = M[row][n];
    for (let col = row + 1; col < n; col++) {
      sum -= M[row][col] * x[col];
    }
    const pivot = M[row][row];
    x[row] = Math.abs(pivot) < 1e-12 ? 0 : sum / pivot;
  }

  return x;
}

/**
 * Train Ridge Regression weights: w = (X^T * X + lambda * I_reg)^(-1) * (X^T * y)
 */
function trainRidgeRegression(
  X: number[][],
  y: number[],
  lambda = 1.0
): number[] {
  const nSamples = X.length;
  const nFeatures = X[0].length;

  // Compute X^T * X (nFeatures x nFeatures) and X^T * y (nFeatures)
  const XtX: number[][] = Array.from({ length: nFeatures }, () =>
    new Array(nFeatures).fill(0)
  );
  const Xty: number[] = new Array(nFeatures).fill(0);

  for (let i = 0; i < nSamples; i++) {
    const row = X[i];
    const target = y[i];
    for (let j = 0; j < nFeatures; j++) {
      Xty[j] += row[j] * target;
      for (let k = j; k < nFeatures; k++) {
        XtX[j][k] += row[j] * row[k];
      }
    }
  }

  // Fill symmetric lower triangle and add L2 penalty to non-intercept features (j >= 1)
  for (let j = 0; j < nFeatures; j++) {
    for (let k = 0; k < j; k++) {
      XtX[j][k] = XtX[k][j];
    }
    if (j >= 1) {
      XtX[j][j] += lambda;
    }
  }

  return solveLinearSystem(XtX, Xty);
}

/**
 * Predict a single day's units given feature vector and weights, clamped >= 0 and rounded.
 */
function predictUnits(features: number[], weights: number[]): number {
  let raw = 0;
  for (let i = 0; i < features.length; i++) {
    raw += features[i] * weights[i];
  }
  return Math.max(0, Math.round(raw));
}

/**
 * Compute Weighted Absolute Percentage Error (WAPE) in percent [0..100+].
 */
function computeWape(actuals: number[], predictions: number[]): number {
  let sumAbsError = 0;
  let sumActual = 0;
  for (let i = 0; i < actuals.length; i++) {
    sumAbsError += Math.abs(actuals[i] - predictions[i]);
    sumActual += actuals[i];
  }
  if (sumActual === 0) return 0;
  return Number(((sumAbsError / sumActual) * 100).toFixed(2));
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error('Missing Supabase environment variables in Edge Function.');
    }

    // 1. Verify caller's JWT and confirm role === 'manager'
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header.' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired authentication token.' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || profile?.role !== 'manager') {
      return new Response(
        JSON.stringify({
          error: 'Forbidden: only managers can run the forecast engine.',
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 2. Build the 180-day historical date window (ending yesterday) and 30-day future window
    const now = new Date();
    const todayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );

    const HISTORY_DAYS = 180;
    const BACKTEST_DAYS = 28;
    const TRAIN_SPLIT = HISTORY_DAYS - BACKTEST_DAYS; // 152 days
    const FUTURE_DAYS = 30;

    const historyDates: Date[] = [];
    const historyDateStrings: string[] = [];

    for (let offset = HISTORY_DAYS; offset >= 1; offset--) {
      const d = new Date(todayUtc.getTime() - offset * 86400000);
      historyDates.push(d);
      historyDateStrings.push(formatDateUTC(d));
    }

    const futureDates: Date[] = [];
    const futureDateStrings: string[] = [];
    for (let offset = 0; offset < FUTURE_DAYS; offset++) {
      const d = new Date(todayUtc.getTime() + offset * 86400000);
      futureDates.push(d);
      futureDateStrings.push(formatDateUTC(d));
    }

    const startDateStr = historyDateStrings[0];
    const endDateStr = historyDateStrings[historyDateStrings.length - 1];

    // 3. Load active products and historical sales over the 180-day window
    const { data: products, error: prodError } = await adminClient
      .from('products')
      .select('id, name, sku, cost_price, selling_price')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (prodError || !products) {
      throw new Error(`Failed to fetch active products: ${prodError?.message}`);
    }

    // Fetch all sales in [startDateStr, endDateStr] using pagination to avoid 1,000-row cap
    const allSales: SaleRow[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;

    while (true) {
      const { data: page, error: salesError } = await adminClient
        .from('sales')
        .select('product_id, quantity, sold_on')
        .gte('sold_on', startDateStr)
        .lte('sold_on', endDateStr)
        .range(from, from + PAGE_SIZE - 1);

      if (salesError) {
        throw new Error(`Failed to fetch historical sales: ${salesError.message}`);
      }
      if (!page || page.length === 0) {
        break;
      }
      allSales.push(...(page as SaleRow[]));
      if (page.length < PAGE_SIZE) {
        break;
      }
      from += PAGE_SIZE;
    }

    // Aggregate daily units per product: Map<productId, Map<YYYY-MM-DD, number>>
    const salesByProductDate = new Map<string, Map<string, number>>();
    for (const s of allSales) {
      let dateMap = salesByProductDate.get(s.product_id);
      if (!dateMap) {
        dateMap = new Map<string, number>();
        salesByProductDate.set(s.product_id, dateMap);
      }
      dateMap.set(s.sold_on, (dateMap.get(s.sold_on) || 0) + s.quantity);
    }

    // Precompute feature vectors for the 180 historical days and 30 future days
    const historyFeatures = historyDates.map((d, idx) =>
      extractFeatures(d, idx)
    );
    const futureFeatures = futureDates.map((d, idx) =>
      extractFeatures(d, HISTORY_DAYS + idx)
    );

    const runId = crypto.randomUUID();
    const generatedAt = new Date().toISOString();
    const forecastStartDate = futureDateStrings[0];

    const forecastDailyRows: Array<{
      run_id: string;
      product_id: string;
      forecast_date: string;
      predicted_units: number;
    }> = [];

    const forecastSummaryRows: Array<{
      run_id: string;
      product_id: string;
      forecast_date: string;
      horizon_days: number;
      predicted_units: number;
      predicted_revenue: number;
      predicted_profit: number;
      model_name: string;
      wape: number;
      baseline_wape: number;
      generated_at: string;
    }> = [];

    // 4. Train, backtest, and forecast for each active product
    for (const product of products as ProductRow[]) {
      const dateMap = salesByProductDate.get(product.id);

      // Build 180-day daily sales series (days with no sales = 0)
      const dailySeries: number[] = historyDateStrings.map(
        (dateStr) => dateMap?.get(dateStr) || 0
      );

      // --- Step A: Backtest on last 28 days (train on first 152 days) ---
      const trainX = historyFeatures.slice(0, TRAIN_SPLIT);
      const trainY = dailySeries.slice(0, TRAIN_SPLIT);
      const testX = historyFeatures.slice(TRAIN_SPLIT);
      const testY = dailySeries.slice(TRAIN_SPLIT);

      const backtestWeights = trainRidgeRegression(trainX, trainY, 1.0);
      const modelTestPreds = testX.map((feat) =>
        predictUnits(feat, backtestWeights)
      );

      // 7-day moving-average baseline on the 28 test days
      const baselineTestPreds: number[] = [];
      for (let t = TRAIN_SPLIT; t < HISTORY_DAYS; t++) {
        let sum7 = 0;
        for (let k = 1; k <= 7; k++) {
          sum7 += dailySeries[t - k];
        }
        baselineTestPreds.push(Math.max(0, Math.round(sum7 / 7)));
      }

      const wape = computeWape(testY, modelTestPreds);
      const baselineWape = computeWape(testY, baselineTestPreds);

      // --- Step B: Retrain on all 180 days and predict the next 30 days ---
      const fullWeights = trainRidgeRegression(
        historyFeatures,
        dailySeries,
        1.0
      );

      const next30Units: number[] = futureFeatures.map((feat) =>
        predictUnits(feat, fullWeights)
      );

      for (let dayIdx = 0; dayIdx < FUTURE_DAYS; dayIdx++) {
        forecastDailyRows.push({
          run_id: runId,
          product_id: product.id,
          forecast_date: futureDateStrings[dayIdx],
          predicted_units: next30Units[dayIdx],
        });
      }

      const units7 = next30Units.slice(0, 7).reduce((a, b) => a + b, 0);
      const units30 = next30Units.reduce((a, b) => a + b, 0);
      const unitMargin = product.selling_price - product.cost_price;

      // Save horizon 7 summary
      forecastSummaryRows.push({
        run_id: runId,
        product_id: product.id,
        forecast_date: forecastStartDate,
        horizon_days: 7,
        predicted_units: units7,
        predicted_revenue: units7 * product.selling_price,
        predicted_profit: units7 * unitMargin,
        model_name: 'ridge_regression',
        wape,
        baseline_wape: baselineWape,
        generated_at: generatedAt,
      });

      // Save horizon 30 summary
      forecastSummaryRows.push({
        run_id: runId,
        product_id: product.id,
        forecast_date: forecastStartDate,
        horizon_days: 30,
        predicted_units: units30,
        predicted_revenue: units30 * product.selling_price,
        predicted_profit: units30 * unitMargin,
        model_name: 'ridge_regression',
        wape,
        baseline_wape: baselineWape,
        generated_at: generatedAt,
      });
    }

    // 5. Save daily predictions to forecast_daily and summaries to forecasts
    const BATCH_SIZE = 1000;
    for (let i = 0; i < forecastDailyRows.length; i += BATCH_SIZE) {
      const chunk = forecastDailyRows.slice(i, i + BATCH_SIZE);
      const { error: dailyErr } = await adminClient
        .from('forecast_daily')
        .insert(chunk);
      if (dailyErr) {
        throw new Error(
          `Failed to insert forecast_daily rows: ${dailyErr.message}`
        );
      }
    }

    const { error: summaryErr } = await adminClient
      .from('forecasts')
      .insert(forecastSummaryRows);

    if (summaryErr) {
      throw new Error(
        `Failed to insert forecasts summary rows: ${summaryErr.message}`
      );
    }

    return new Response(
      JSON.stringify({
        run_id: runId,
        generated_at: generatedAt,
        products_forecasted: products.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

