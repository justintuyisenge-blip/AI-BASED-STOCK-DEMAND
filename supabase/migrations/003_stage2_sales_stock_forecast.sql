-- ============================================================================
-- Migration 003: Stage 2 — Sales, Stock In, CSV Import RPC, and Forecast Schema
-- ============================================================================

-- 1. Add optional note column to stock_movements for delivery notes
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS note text;

-- 2. RLS policy: Clerks can read only the sales they recorded today
DROP POLICY IF EXISTS "sales_clerk_select_today_own" ON public.sales;
CREATE POLICY "sales_clerk_select_today_own"
  ON public.sales
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role() = 'clerk'
    AND created_by = auth.uid()
    AND sold_on = CURRENT_DATE
  );

-- 3. RLS policy: Clerks can view recent deliveries on the Stock In page
DROP POLICY IF EXISTS "stock_movements_clerk_select_deliveries" ON public.stock_movements;
CREATE POLICY "stock_movements_clerk_select_deliveries"
  ON public.stock_movements
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role() = 'clerk'
    AND type = 'delivery'
  );

-- 4. Update sale trigger so historical CSV imports can safely bypass stock deduction
--    using a transaction-local setting (app.skip_stock_trigger = 'true')
CREATE OR REPLACE FUNCTION public.handle_sale_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If transaction-local flag app.skip_stock_trigger is set, do not alter current_stock
  IF COALESCE(current_setting('app.skip_stock_trigger', true), 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  -- 1. Reduce product current_stock by the quantity sold
  UPDATE public.products
  SET current_stock = current_stock - NEW.quantity
  WHERE id = NEW.product_id;

  -- 2. Log a stock movement entry of type 'sale'
  INSERT INTO public.stock_movements (product_id, quantity, type, created_at, created_by)
  VALUES (NEW.product_id, NEW.quantity, 'sale', now(), NEW.created_by);

  RETURN NEW;
END;
$$;

-- 5. RPC function for Manager CSV Import
--    Bypasses the stock trigger when adjust_stock is false (the default).
CREATE OR REPLACE FUNCTION public.import_historical_sales(
  p_rows jsonb,
  p_adjust_stock boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted_count integer := 0;
BEGIN
  -- Only managers are permitted to import CSV sales
  IF public.get_user_role() IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Access denied: only managers can import sales CSV files.';
  END IF;

  -- When p_adjust_stock is false, disable the stock trigger for this transaction only
  IF NOT COALESCE(p_adjust_stock, false) THEN
    PERFORM set_config('app.skip_stock_trigger', 'true', true);
  END IF;

  WITH inserted AS (
    INSERT INTO public.sales (
      product_id,
      quantity,
      unit_price,
      unit_cost,
      sold_on,
      created_by
    )
    SELECT
      (item->>'product_id')::uuid,
      (item->>'quantity')::integer,
      (item->>'unit_price')::integer,
      (item->>'unit_cost')::integer,
      (item->>'sold_on')::date,
      auth.uid()
    FROM jsonb_array_elements(p_rows) AS item
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted_count FROM inserted;

  RETURN v_inserted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_historical_sales(jsonb, boolean) TO authenticated;

-- 6. Forecast Schema Extensions
--    Add wape, baseline_wape, and run_id to public.forecasts
ALTER TABLE public.forecasts
  ADD COLUMN IF NOT EXISTS run_id uuid,
  ADD COLUMN IF NOT EXISTS wape numeric(6,2),
  ADD COLUMN IF NOT EXISTS baseline_wape numeric(6,2);

--    Create public.forecast_daily for day-by-day 30-day predictions per run
CREATE TABLE IF NOT EXISTS public.forecast_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  forecast_date date NOT NULL,
  predicted_units integer NOT NULL CHECK (predicted_units >= 0)
);

CREATE INDEX IF NOT EXISTS idx_forecast_daily_run_product_date
  ON public.forecast_daily(run_id, product_id, forecast_date);

CREATE INDEX IF NOT EXISTS idx_forecasts_run_id
  ON public.forecasts(run_id, product_id, horizon_days);

-- 7. Enable RLS on forecast_daily (manager only)
ALTER TABLE public.forecast_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "forecast_daily_manager_all" ON public.forecast_daily;
CREATE POLICY "forecast_daily_manager_all"
  ON public.forecast_daily
  FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'manager')
  WITH CHECK (public.get_user_role() = 'manager');

