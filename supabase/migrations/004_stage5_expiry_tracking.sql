-- ============================================================================
-- Migration 004: Stage 5 — Expiry Tracking, Stock Batches, FEFO Sales & Write-Offs
-- ============================================================================

-- 1. Add tracks_expiry to public.products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS tracks_expiry boolean NOT NULL DEFAULT false;

-- 2. Create public.stock_batches
CREATE TABLE IF NOT EXISTS public.stock_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  received_on date NOT NULL DEFAULT CURRENT_DATE,
  expiry_date date NOT NULL,
  quantity_received integer NOT NULL CHECK (quantity_received > 0),
  quantity_remaining integer NOT NULL CHECK (quantity_remaining >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'written_off')),
  written_off_on timestamptz,
  written_off_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  loss_amount bigint NOT NULL DEFAULT 0 CHECK (loss_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_stock_batches_product_status_expiry
  ON public.stock_batches(product_id, status, expiry_date);

-- 3. Allow 'write_off' in public.stock_movements.type
ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_type_check;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_type_check
  CHECK (type IN ('delivery', 'sale', 'adjustment', 'write_off'));

-- 4. Update stock_movements trigger so 'write_off' reduces products.current_stock
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
  -- A write-off reduces current_stock by the written-off units
  ELSIF NEW.type = 'write_off' THEN
    UPDATE public.products
    SET current_stock = current_stock - NEW.quantity
    WHERE id = NEW.product_id;
  END IF;
  -- Note: type = 'sale' is created by handle_sale_after_insert(), which already reduced stock.

  RETURN NEW;
END;
$$;

-- 5. Before-insert trigger on sales so unit_cost is always populated server-side
--    (allowing clerks to record sales without ever needing to read cost_price)
CREATE OR REPLACE FUNCTION public.handle_sale_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost integer;
  v_price integer;
BEGIN
  SELECT cost_price, selling_price
    INTO v_cost, v_price
    FROM public.products
   WHERE id = NEW.product_id;

  IF NEW.unit_cost IS NULL OR NEW.unit_cost = 0 OR public.get_user_role() = 'clerk' THEN
    NEW.unit_cost := COALESCE(v_cost, 0);
  END IF;

  IF NEW.unit_price IS NULL OR NEW.unit_price = 0 THEN
    NEW.unit_price := COALESCE(v_price, 0);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sale_before_insert ON public.sales;
CREATE TRIGGER trg_sale_before_insert
BEFORE INSERT ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.handle_sale_before_insert();

-- 6. Update sales after-insert trigger to enforce FEFO (earliest expiry first) on in-date batches
--    for products with tracks_expiry = true.
--    CSV imports with "Also adjust stock" off set app.skip_stock_trigger = 'true'
--    and return immediately without touching current_stock or stock_batches.
CREATE OR REPLACE FUNCTION public.handle_sale_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tracks_expiry boolean := false;
  v_product_name text := '';
  v_in_date_units integer := 0;
  v_remaining_to_deduct integer := 0;
  v_deduct integer := 0;
  v_batch RECORD;
BEGIN
  -- If transaction-local flag app.skip_stock_trigger is set (CSV import with adjust_stock = false),
  -- do not alter current_stock or stock_batches.
  IF COALESCE(current_setting('app.skip_stock_trigger', true), 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  SELECT tracks_expiry, name
    INTO v_tracks_expiry, v_product_name
    FROM public.products
   WHERE id = NEW.product_id;

  -- If the product tracks expiry, deduct from active in-date batches (earliest expiry first)
  IF COALESCE(v_tracks_expiry, false) THEN
    SELECT COALESCE(SUM(quantity_remaining), 0)
      INTO v_in_date_units
      FROM public.stock_batches
     WHERE product_id = NEW.product_id
       AND status = 'active'
       AND quantity_remaining > 0
       AND expiry_date >= CURRENT_DATE;

    IF v_in_date_units < NEW.quantity THEN
      RAISE EXCEPTION 'Cannot record sale for "%": only % units are in date (requested % units).',
        v_product_name, v_in_date_units, NEW.quantity;
    END IF;

    v_remaining_to_deduct := NEW.quantity;

    FOR v_batch IN
      SELECT id, quantity_remaining
        FROM public.stock_batches
       WHERE product_id = NEW.product_id
         AND status = 'active'
         AND quantity_remaining > 0
         AND expiry_date >= CURRENT_DATE
       ORDER BY expiry_date ASC, received_on ASC, id ASC
       FOR UPDATE
    LOOP
      EXIT WHEN v_remaining_to_deduct <= 0;

      v_deduct := LEAST(v_batch.quantity_remaining, v_remaining_to_deduct);

      UPDATE public.stock_batches
         SET quantity_remaining = quantity_remaining - v_deduct
       WHERE id = v_batch.id;

      v_remaining_to_deduct := v_remaining_to_deduct - v_deduct;
    END LOOP;
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

-- 6. Row Level Security on public.stock_batches
--    Managers have full access to raw stock_batches.
--    Clerks can insert new delivery batches, but CANNOT SELECT from raw stock_batches
--    (so clerks can never read loss_amount from the table).
ALTER TABLE public.stock_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_batches_manager_all" ON public.stock_batches;
CREATE POLICY "stock_batches_manager_all"
  ON public.stock_batches
  FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'manager')
  WITH CHECK (public.get_user_role() = 'manager');

DROP POLICY IF EXISTS "stock_batches_clerk_insert" ON public.stock_batches;
CREATE POLICY "stock_batches_clerk_insert"
  ON public.stock_batches
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_user_role() = 'clerk'
    AND status = 'active'
    AND loss_amount = 0
  );

-- 7. Role-aware view for reading batches (used by both Manager and Clerk)
--    Clerks can read batch dates, quantities, and status, while cost_price,
--    value_at_cost, and loss_amount are strictly NULL for clerks.
CREATE OR REPLACE FUNCTION public.get_stock_batches_for_role()
RETURNS TABLE (
  id uuid,
  product_id uuid,
  product_name text,
  product_sku text,
  received_on date,
  expiry_date date,
  quantity_received integer,
  quantity_remaining integer,
  status text,
  written_off_on timestamptz,
  written_off_by uuid,
  cost_price integer,
  value_at_cost bigint,
  loss_amount bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    b.id,
    b.product_id,
    p.name AS product_name,
    p.sku AS product_sku,
    b.received_on,
    b.expiry_date,
    b.quantity_received,
    b.quantity_remaining,
    b.status,
    b.written_off_on,
    b.written_off_by,
    CASE WHEN public.get_user_role() = 'manager' THEN p.cost_price ELSE NULL END AS cost_price,
    CASE
      WHEN public.get_user_role() = 'manager' THEN (b.quantity_remaining::bigint * p.cost_price::bigint)
      ELSE NULL
    END AS value_at_cost,
    CASE WHEN public.get_user_role() = 'manager' THEN b.loss_amount ELSE NULL END AS loss_amount
  FROM public.stock_batches b
  JOIN public.products p ON p.id = b.product_id
  WHERE public.get_user_role() IN ('manager', 'clerk')
  ORDER BY b.expiry_date ASC, b.received_on ASC;
$$;

DROP VIEW IF EXISTS public.stock_batches_view;
CREATE VIEW public.stock_batches_view AS
  SELECT * FROM public.get_stock_batches_for_role();

GRANT SELECT ON public.stock_batches_view TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_stock_batches_for_role() TO authenticated;

-- 8. RPC Function: Write off a single batch (Manager and Clerk)
--    Changes batch status to 'written_off', records loss_amount = units * cost_price
--    internally on the server, and inserts a 'write_off' stock movement (which
--    reduces products.current_stock via trg_stock_movement_after_insert).
CREATE OR REPLACE FUNCTION public.write_off_batch(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_batch public.stock_batches%ROWTYPE;
  v_cost_price integer;
  v_loss bigint;
BEGIN
  v_role := public.get_user_role();
  IF v_role NOT IN ('manager', 'clerk') THEN
    RAISE EXCEPTION 'Access denied: only managers or clerks can write off batches.';
  END IF;

  SELECT *
    INTO v_batch
    FROM public.stock_batches
   WHERE id = p_batch_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found.';
  END IF;

  IF v_batch.status = 'written_off' THEN
    RAISE EXCEPTION 'This batch has already been written off.';
  END IF;

  IF v_batch.quantity_remaining <= 0 THEN
    RAISE EXCEPTION 'This batch has 0 remaining units to write off.';
  END IF;

  SELECT cost_price
    INTO v_cost_price
    FROM public.products
   WHERE id = v_batch.product_id;

  v_loss := (v_batch.quantity_remaining::bigint) * COALESCE(v_cost_price, 0)::bigint;

  -- Mark batch as written_off (keep quantity_remaining so the Written off view shows how many units were written off)
  UPDATE public.stock_batches
     SET status = 'written_off',
         written_off_on = now(),
         written_off_by = auth.uid(),
         loss_amount = v_loss
   WHERE id = p_batch_id;

  -- Log a stock movement of type 'write_off' (trigger reduces products.current_stock by quantity_remaining)
  INSERT INTO public.stock_movements (
    product_id,
    quantity,
    type,
    note,
    created_at,
    created_by
  )
  VALUES (
    v_batch.product_id,
    v_batch.quantity_remaining,
    'write_off',
    'Batch write-off (expiry ' || v_batch.expiry_date::text || ')',
    now(),
    auth.uid()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.write_off_batch(uuid) TO authenticated;

-- 9. RPC Function: Write off all expired active batches (Manager and Clerk)
CREATE OR REPLACE FUNCTION public.write_off_all_expired_batches()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_batch_id uuid;
  v_count integer := 0;
BEGIN
  v_role := public.get_user_role();
  IF v_role NOT IN ('manager', 'clerk') THEN
    RAISE EXCEPTION 'Access denied: only managers or clerks can write off expired batches.';
  END IF;

  FOR v_batch_id IN
    SELECT id
      FROM public.stock_batches
     WHERE status = 'active'
       AND quantity_remaining > 0
       AND expiry_date < CURRENT_DATE
     ORDER BY expiry_date ASC
  LOOP
    PERFORM public.write_off_batch(v_batch_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.write_off_all_expired_batches() TO authenticated;
