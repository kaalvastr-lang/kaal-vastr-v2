
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS variant TEXT;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS variant TEXT;

DROP FUNCTION IF EXISTS public.get_invoice_by_token(text);

CREATE OR REPLACE FUNCTION public.get_invoice_by_token(_token text)
 RETURNS TABLE(id uuid, invoice_number text, created_at timestamp with time zone, customer_name text, customer_mobile text, product_name text, variant text, size text, quantity integer, unit_price numeric, discount numeric, total_amount numeric, payment_method text, payment_status text, public_token text, pdf_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.id, s.invoice_number, s.created_at, s.customer_name, s.customer_mobile,
         s.product_name, s.variant, s.size, s.quantity, s.unit_price, s.discount,
         s.total_amount, s.payment_method, s.payment_status, s.public_token, s.pdf_url
  FROM public.sales s
  WHERE s.invoice_number = (
    SELECT invoice_number FROM public.sales WHERE public_token = _token LIMIT 1
  )
  ORDER BY s.created_at ASC, s.id ASC;
$function$;
