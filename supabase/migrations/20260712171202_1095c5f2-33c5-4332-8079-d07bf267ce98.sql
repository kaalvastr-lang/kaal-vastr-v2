ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_invoice_number_key;
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_public_token_key;
DROP INDEX IF EXISTS public.sales_public_token_key;
CREATE INDEX IF NOT EXISTS sales_invoice_number_idx ON public.sales(invoice_number);
CREATE INDEX IF NOT EXISTS sales_public_token_idx ON public.sales(public_token);