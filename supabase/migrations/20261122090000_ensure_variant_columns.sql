-- =====================================================================
-- Ensure the `variant` columns exist (idempotent, data-preserving)
--
-- Billing (Normal + Scan) writes the colour/variant name into sales.variant, and the product
-- form uses products.variant. The very first definition lives in migration 20260718141829, but a
-- client database that never received that migration fails with:
--     column "variant" of relation "sales" does not exist
-- This migration repairs such a database and is a no-op on a healthy one. It can run any
-- number of times. No rows are changed, dropped or rewritten.
-- =====================================================================

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS variant TEXT;
ALTER TABLE public.sales    ADD COLUMN IF NOT EXISTS variant TEXT;

-- The public invoice page reads `variant` through get_invoice_by_token. Re-create the function
-- only when the installed version predates the column (same definition as 20260718141829).
DO $$
DECLARE
  v_result text;
BEGIN
  SELECT pg_get_function_result(p.oid) INTO v_result
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_invoice_by_token'
   LIMIT 1;

  IF v_result IS NULL OR v_result NOT LIKE '%variant%' THEN
    DROP FUNCTION IF EXISTS public.get_invoice_by_token(text);

    CREATE FUNCTION public.get_invoice_by_token(_token text)
     RETURNS TABLE(id uuid, invoice_number text, created_at timestamp with time zone, customer_name text, customer_mobile text, product_name text, variant text, size text, quantity integer, unit_price numeric, discount numeric, total_amount numeric, payment_method text, payment_status text, public_token text, pdf_url text)
     LANGUAGE sql
     STABLE SECURITY DEFINER
     SET search_path TO 'public'
    AS $fn$
      SELECT s.id, s.invoice_number, s.created_at, s.customer_name, s.customer_mobile,
             s.product_name, s.variant, s.size, s.quantity, s.unit_price, s.discount,
             s.total_amount, s.payment_method, s.payment_status, s.public_token, s.pdf_url
      FROM public.sales s
      WHERE s.invoice_number = (
        SELECT invoice_number FROM public.sales WHERE public_token = _token LIMIT 1
      )
      ORDER BY s.created_at ASC, s.id ASC;
    $fn$;

    REVOKE ALL ON FUNCTION public.get_invoice_by_token(text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.get_invoice_by_token(text) TO anon, authenticated;
  END IF;
END
$$;

-- Make PostgREST (the Supabase API) pick up the column straight away.
NOTIFY pgrst, 'reload schema';
