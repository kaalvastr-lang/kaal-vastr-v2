-- OPTIONAL — review before applying. NOT part of supabase/migrations on purpose.
--
-- Finding: the existing migrations create TWO AFTER INSERT triggers on public.sales:
--   trg_apply_sale_stock  (recomputes products.stock_by_size and products.stock = SUM(map))
--   trg_decrement_stock   (older; subtracts the sold quantity from products.stock AGAIN)
-- Because trg_decrement_stock fires after trg_apply_sale_stock, products.stock can end up lower than
-- SUM(stock_by_size) after a Normal Billing sale (it self-corrects on the next sale of that product).
--
-- The new Scan Billing function recomputes products.stock itself, so it is correct either way.
-- If you confirm in your live database that both triggers exist AND the totals drift, run:

-- 1) Check:
--    SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.sales'::regclass AND NOT tgisinternal;
--    SELECT name, stock, (SELECT COALESCE(SUM((value)::int),0) FROM jsonb_each_text(stock_by_size)) AS map_total
--      FROM public.products WHERE stock <> (SELECT COALESCE(SUM((value)::int),0) FROM jsonb_each_text(stock_by_size));

-- 2) Fix (removes only the redundant trigger) and re-sync totals:
DROP TRIGGER IF EXISTS trg_decrement_stock ON public.sales;
UPDATE public.products
   SET stock = COALESCE((SELECT SUM((value)::int) FROM jsonb_each_text(stock_by_size)), 0)
 WHERE stock_by_size IS NOT NULL AND stock_by_size <> '{}'::jsonb;
