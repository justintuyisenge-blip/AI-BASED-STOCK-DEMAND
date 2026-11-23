-- ============================================================================
-- Migration 001: Core Schema & Stock Triggers
-- Supermarket Stock Demand and Profit Prediction System (Rwanda)
-- All monetary amounts are in Rwandan Francs (RWF) stored as whole integers.
-- ============================================================================

-- 1. PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('manager', 'clerk'))
);

-- 2. CATEGORIES
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE
);

-- 3. PRODUCTS
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sku text NOT NULL UNIQUE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  cost_price integer NOT NULL CHECK (cost_price >= 0),
  selling_price integer NOT NULL CHECK (selling_price >= 0),
  current_stock integer NOT NULL DEFAULT 0,
  reorder_level integer NOT NULL DEFAULT 10,
  is_active boolean NOT NULL DEFAULT true
);

-- 4. SALES
CREATE TABLE IF NOT EXISTS public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price integer NOT NULL CHECK (unit_price >= 0),
  unit_cost integer NOT NULL CHECK (unit_cost >= 0),
  sold_on date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid()
);

-- 5. STOCK MOVEMENTS
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity integer NOT NULL,
  type text NOT NULL CHECK (type IN ('delivery', 'sale', 'adjustment')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid()
);

-- 6. FORECASTS
CREATE TABLE IF NOT EXISTS public.forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  forecast_date date NOT NULL,
  horizon_days integer NOT NULL CHECK (horizon_days > 0),
  predicted_units integer NOT NULL,
  predicted_revenue bigint NOT NULL,
  predicted_profit bigint NOT NULL,
  model_name text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

-- 7. AI INSIGHTS
CREATE TABLE IF NOT EXISTS public.ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

-- Useful indexes for common queries
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_sales_product_id_sold_on ON public.sales(product_id, sold_on);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_forecasts_product_id_date ON public.forecasts(product_id, forecast_date);

-- ============================================================================
-- TRIGGERS
-- 1) Inserting a sale reduces products.current_stock and logs a stock movement.
-- 2) Inserting a delivery (or adjustment) in stock_movements updates current_stock.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_sale_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

DROP TRIGGER IF EXISTS trg_sale_after_insert ON public.sales;
CREATE TRIGGER trg_sale_after_insert
AFTER INSERT ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.handle_sale_after_insert();


CREATE OR REPLACE FUNCTION public.handle_stock_movement_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- A delivery increases stock
  IF NEW.type = 'delivery' THEN
    UPDATE public.products
    SET current_stock = current_stock + NEW.quantity
    WHERE id = NEW.product_id;
  -- An adjustment modifies stock by the signed quantity
  ELSIF NEW.type = 'adjustment' THEN
    UPDATE public.products
    SET current_stock = current_stock + NEW.quantity
    WHERE id = NEW.product_id;
  END IF;
  -- Note: type = 'sale' is created by handle_sale_after_insert(), which already reduced stock.

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_movement_after_insert ON public.stock_movements;
CREATE TRIGGER trg_stock_movement_after_insert
AFTER INSERT ON public.stock_movements
FOR EACH ROW
EXECUTE FUNCTION public.handle_stock_movement_after_insert();

