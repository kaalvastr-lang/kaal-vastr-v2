
-- Size-wise inventory: per-size stock map + size type
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS size_type text NOT NULL DEFAULT 'alpha',
  ADD COLUMN IF NOT EXISTS stock_by_size jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill stock_by_size for existing products: distribute existing stock evenly across sizes
UPDATE public.products
SET stock_by_size = (
  SELECT COALESCE(jsonb_object_agg(sz, per), '{}'::jsonb)
  FROM (
    SELECT
      unnest(CASE WHEN array_length(sizes,1) IS NULL OR array_length(sizes,1) = 0
                  THEN ARRAY['M']::text[] ELSE sizes END) AS sz,
      CASE
        WHEN array_length(sizes,1) IS NULL OR array_length(sizes,1) = 0 THEN stock
        ELSE (stock / GREATEST(array_length(sizes,1),1))
      END AS per
  ) s
)
WHERE (stock_by_size = '{}'::jsonb OR stock_by_size IS NULL);

-- Trigger function: on sale insert, decrement per-size stock and recompute total
CREATE OR REPLACE FUNCTION public.apply_sale_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur jsonb;
  cur_qty int;
  new_qty int;
  new_map jsonb;
  total_stock int;
BEGIN
  IF NEW.product_id IS NULL OR NEW.is_returned THEN
    RETURN NEW;
  END IF;

  SELECT stock_by_size INTO cur FROM public.products WHERE id = NEW.product_id FOR UPDATE;
  IF cur IS NULL THEN cur := '{}'::jsonb; END IF;

  cur_qty := COALESCE((cur ->> NEW.size)::int, 0);
  new_qty := GREATEST(cur_qty - NEW.quantity, 0);
  new_map := cur || jsonb_build_object(NEW.size, new_qty);

  -- Recompute total stock as sum of map values
  SELECT COALESCE(SUM((value)::int), 0) INTO total_stock
  FROM jsonb_each_text(new_map);

  UPDATE public.products
  SET stock_by_size = new_map,
      stock = total_stock,
      updated_at = now()
  WHERE id = NEW.product_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_sale_stock ON public.sales;
CREATE TRIGGER trg_apply_sale_stock
  AFTER INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.apply_sale_stock();

-- Update get_invoice_by_token to return ALL line items sharing the same invoice_number.
-- This enables multi-product invoices while keeping the public token model.
DROP FUNCTION IF EXISTS public.get_invoice_by_token(text);
CREATE OR REPLACE FUNCTION public.get_invoice_by_token(_token text)
RETURNS TABLE(
  id uuid,
  invoice_number text,
  created_at timestamptz,
  customer_name text,
  customer_mobile text,
  product_name text,
  size text,
  quantity int,
  unit_price numeric,
  discount numeric,
  total_amount numeric,
  payment_method text,
  payment_status text,
  public_token text,
  pdf_url text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.invoice_number, s.created_at, s.customer_name, s.customer_mobile,
         s.product_name, s.size, s.quantity, s.unit_price, s.discount,
         s.total_amount, s.payment_method, s.payment_status, s.public_token, s.pdf_url
  FROM public.sales s
  WHERE s.invoice_number = (
    SELECT invoice_number FROM public.sales WHERE public_token = _token LIMIT 1
  )
  ORDER BY s.created_at ASC, s.id ASC;
$$;
