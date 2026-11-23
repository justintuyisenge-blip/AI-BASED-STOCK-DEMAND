-- ============================================================================
-- Migration 002: Row Level Security (RLS) Policies
-- Manager: full access to everything.
-- Clerk: can read products and categories, and insert sales and stock movements.
--        Cannot see forecasts, profit or ai_insights.
-- ============================================================================

-- Helper function to look up the current authenticated user's role safely
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Enable Row Level Security on every table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 1. PROFILES
-- Managers have full access; any authenticated user can read their own profile.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_manager_all" ON public.profiles;
CREATE POLICY "profiles_manager_all"
  ON public.profiles
  FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'manager')
  WITH CHECK (public.get_user_role() = 'manager');

DROP POLICY IF EXISTS "profiles_read_own" ON public.profiles;
CREATE POLICY "profiles_read_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- ----------------------------------------------------------------------------
-- 2. CATEGORIES
-- Managers: full access. Clerks: read access.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "categories_manager_all" ON public.categories;
CREATE POLICY "categories_manager_all"
  ON public.categories
  FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'manager')
  WITH CHECK (public.get_user_role() = 'manager');

DROP POLICY IF EXISTS "categories_clerk_select" ON public.categories;
CREATE POLICY "categories_clerk_select"
  ON public.categories
  FOR SELECT
  TO authenticated
  USING (public.get_user_role() = 'clerk');

-- ----------------------------------------------------------------------------
-- 3. PRODUCTS
-- Managers: full access. Clerks: read access.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "products_manager_all" ON public.products;
CREATE POLICY "products_manager_all"
  ON public.products
  FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'manager')
  WITH CHECK (public.get_user_role() = 'manager');

DROP POLICY IF EXISTS "products_clerk_select" ON public.products;
CREATE POLICY "products_clerk_select"
  ON public.products
  FOR SELECT
  TO authenticated
  USING (public.get_user_role() = 'clerk');

-- ----------------------------------------------------------------------------
-- 4. SALES
-- Managers: full access (including reading unit_cost and profit metrics).
-- Clerks: can insert sales only (cannot read historical sales/profit data).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "sales_manager_all" ON public.sales;
CREATE POLICY "sales_manager_all"
  ON public.sales
  FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'manager')
  WITH CHECK (public.get_user_role() = 'manager');

DROP POLICY IF EXISTS "sales_clerk_insert" ON public.sales;
CREATE POLICY "sales_clerk_insert"
  ON public.sales
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role() = 'clerk');

-- ----------------------------------------------------------------------------
-- 5. STOCK MOVEMENTS
-- Managers: full access. Clerks: can insert stock movements.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "stock_movements_manager_all" ON public.stock_movements;
CREATE POLICY "stock_movements_manager_all"
  ON public.stock_movements
  FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'manager')
  WITH CHECK (public.get_user_role() = 'manager');

DROP POLICY IF EXISTS "stock_movements_clerk_insert" ON public.stock_movements;
CREATE POLICY "stock_movements_clerk_insert"
  ON public.stock_movements
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role() = 'clerk');

-- ----------------------------------------------------------------------------
-- 6. FORECASTS
-- Managers: full access. Clerks: no access.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "forecasts_manager_all" ON public.forecasts;
CREATE POLICY "forecasts_manager_all"
  ON public.forecasts
  FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'manager')
  WITH CHECK (public.get_user_role() = 'manager');

-- ----------------------------------------------------------------------------
-- 7. AI INSIGHTS
-- Managers: full access. Clerks: no access.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "ai_insights_manager_all" ON public.ai_insights;
CREATE POLICY "ai_insights_manager_all"
  ON public.ai_insights
  FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'manager')
  WITH CHECK (public.get_user_role() = 'manager');

