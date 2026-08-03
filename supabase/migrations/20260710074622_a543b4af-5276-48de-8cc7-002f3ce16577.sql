
-- 1. Add columns
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS public_token TEXT,
  ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- 2. Backfill tokens for existing rows (10-byte hex = 20 chars, uppercase-friendly)
UPDATE public.sales
SET public_token = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
WHERE public_token IS NULL;

-- 3. Ensure uniqueness + non-null going forward
CREATE UNIQUE INDEX IF NOT EXISTS sales_public_token_key ON public.sales(public_token);
ALTER TABLE public.sales ALTER COLUMN public_token SET NOT NULL;

-- 4. Public lookup function (single invoice by token). Security definer bypasses RLS
--    but only returns the ONE matching row, so sequential invoice numbers and the
--    full sales list stay hidden.
CREATE OR REPLACE FUNCTION public.get_invoice_by_token(_token TEXT)
RETURNS TABLE (
  id UUID,
  invoice_number TEXT,
  created_at TIMESTAMPTZ,
  customer_name TEXT,
  customer_mobile TEXT,
  product_name TEXT,
  size TEXT,
  quantity INTEGER,
  unit_price NUMERIC,
  discount NUMERIC,
  total_amount NUMERIC,
  payment_method TEXT,
  payment_status TEXT,
  public_token TEXT,
  pdf_url TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.invoice_number, s.created_at, s.customer_name, s.customer_mobile,
         s.product_name, s.size, s.quantity, s.unit_price, s.discount,
         s.total_amount, s.payment_method, s.payment_status, s.public_token, s.pdf_url
  FROM public.sales s
  WHERE s.public_token = _token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_invoice_by_token(TEXT) TO anon, authenticated;
