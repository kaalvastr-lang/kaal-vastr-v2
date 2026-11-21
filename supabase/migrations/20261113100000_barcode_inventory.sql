-- =====================================================================
-- Kaal Vastr — Barcode Stock In + Scan Billing (ADDITIVE migration)
--
-- Adds:
--   * product_variants      one row per (product, size, colour) with ONE permanent barcode
--   * barcode_print_jobs    print history for label printing
--   * kv_idempotency_keys   protects Stock In / Scan checkout against double submission
--   * sales.variant_id / sales.barcode   (nullable, traceability only)
--   * kv_stock_in(...)      atomic, owner-only Stock In
--   * kv_complete_sale(...) atomic, owner-only Scan Billing checkout
--
-- Nothing existing is dropped or rewritten. The existing `products` model
-- (stock_by_size, colors, sizes, cost_price, selling_price) stays the source of
-- truth for the Owner Dashboard; product_variants adds per-colour stock + barcode
-- on top of it and both are updated in the same transaction.
-- =====================================================================

-- 1. Barcode sequence ---------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.kv_barcode_seq START 1;

CREATE OR REPLACE FUNCTION public.kv_next_barcode()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  c text;
BEGIN
  LOOP
    c := 'KV' || lpad(nextval('public.kv_barcode_seq')::text, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.product_variants WHERE barcode = c);
  END LOOP;
  RETURN c;
END;
$$;

-- 2. product_variants ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_variants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  size       text NOT NULL,
  colour     text NOT NULL DEFAULT '',
  barcode    text NOT NULL,
  stock      integer NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_variants_stock_non_negative CHECK (stock >= 0),
  CONSTRAINT product_variants_barcode_format CHECK (barcode ~ '^[A-Z0-9-]{4,32}$'),
  CONSTRAINT product_variants_barcode_key UNIQUE (barcode)
);

-- One variant per product + size + colour (case/whitespace-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_unique_variant
  ON public.product_variants (product_id, lower(btrim(size)), lower(btrim(colour)));
CREATE INDEX IF NOT EXISTS product_variants_product_idx ON public.product_variants (product_id);

CREATE OR REPLACE FUNCTION public.kv_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_variants_updated_at ON public.product_variants;
CREATE TRIGGER trg_product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.kv_touch_updated_at();

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

-- Owner-only. Writes happen exclusively through the SECURITY DEFINER RPCs below,
-- so clients only get SELECT.
GRANT SELECT ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;

DROP POLICY IF EXISTS "Owner reads product variants" ON public.product_variants;
CREATE POLICY "Owner reads product variants"
  ON public.product_variants FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. barcode_print_jobs -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.barcode_print_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id   uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  barcode      text NOT NULL,
  product_name text,
  size         text,
  colour       text,
  copies       integer NOT NULL DEFAULT 1,
  status       text NOT NULL DEFAULT 'success',
  printer_name text,
  error        text,
  created_by   uuid DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT barcode_print_jobs_copies_positive CHECK (copies > 0 AND copies <= 5000),
  CONSTRAINT barcode_print_jobs_status_check CHECK (status IN ('success', 'failed', 'test'))
);
CREATE INDEX IF NOT EXISTS barcode_print_jobs_created_at_idx ON public.barcode_print_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS barcode_print_jobs_variant_idx ON public.barcode_print_jobs (variant_id);

ALTER TABLE public.barcode_print_jobs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.barcode_print_jobs TO authenticated;
GRANT ALL ON public.barcode_print_jobs TO service_role;

DROP POLICY IF EXISTS "Owner reads print jobs" ON public.barcode_print_jobs;
CREATE POLICY "Owner reads print jobs"
  ON public.barcode_print_jobs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Owner logs print jobs" ON public.barcode_print_jobs;
CREATE POLICY "Owner logs print jobs"
  ON public.barcode_print_jobs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. Idempotency keys (internal, no client access) ---------------------
CREATE TABLE IF NOT EXISTS public.kv_idempotency_keys (
  key        uuid PRIMARY KEY,
  kind       text NOT NULL,
  created_by uuid,
  result     jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.kv_idempotency_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kv_idempotency_keys FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.kv_idempotency_keys TO service_role;

-- 5. Traceability columns on sales (nullable, existing rows untouched) --
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS barcode text;
CREATE INDEX IF NOT EXISTS sales_variant_idx ON public.sales (variant_id);

-- 6. kv_stock_in --------------------------------------------------------
-- p_product  : { name, category, brand, sku, cost_price, selling_price, description, supplier }
-- p_variants : [ { size, colour, quantity }, ... ]
-- Creates/reuses the parent product, creates/reuses each variant, adds stock to
-- BOTH product_variants.stock and products.stock_by_size / products.stock, writes
-- inventory_activity, all in one transaction. Re-sending the same p_request_key
-- returns the original result and never adds stock twice.
CREATE OR REPLACE FUNCTION public.kv_stock_in(
  p_request_key uuid,
  p_product jsonb,
  p_variants jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_email      text;
  v_rows       integer;
  v_existing   jsonb;
  v_name       text;
  v_category   text;
  v_brand      text;
  v_sku        text;
  v_desc       text;
  v_supplier   text;
  v_cost       numeric;
  v_sell       numeric;
  v_product    public.products%ROWTYPE;
  v_prod_new   boolean := false;
  v_old_cost   numeric;
  v_old_sell   numeric;
  v_line       jsonb;
  v_size_in    text;
  v_size       text;
  v_colour     text;
  v_qty        integer;
  v_variant    public.product_variants%ROWTYPE;
  v_var_new    boolean;
  v_map        jsonb;
  v_total      integer;
  v_sizes      text[];
  v_colors     text[];
  v_label      text;
  v_note       text;
  v_results    jsonb := '[]'::jsonb;
  v_result     jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only the owner can record stock-in.' USING ERRCODE = '42501';
  END IF;
  IF p_request_key IS NULL THEN
    RAISE EXCEPTION 'Missing request key.' USING ERRCODE = 'KV003';
  END IF;

  -- Idempotency: a retry of the same request returns the stored result.
  INSERT INTO public.kv_idempotency_keys (key, kind, created_by)
  VALUES (p_request_key, 'stock_in', v_uid)
  ON CONFLICT (key) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    SELECT result INTO v_existing FROM public.kv_idempotency_keys
      WHERE key = p_request_key AND created_by = v_uid;
    IF v_existing IS NOT NULL THEN
      RETURN v_existing || jsonb_build_object('replayed', true);
    END IF;
    RAISE EXCEPTION 'This request key was already used.' USING ERRCODE = 'KV003';
  END IF;

  -- Validate input ------------------------------------------------------
  v_name     := btrim(coalesce(p_product ->> 'name', ''));
  v_category := coalesce(nullif(btrim(coalesce(p_product ->> 'category', '')), ''), 'General');
  v_brand    := nullif(btrim(coalesce(p_product ->> 'brand', '')), '');
  v_sku      := btrim(coalesce(p_product ->> 'sku', ''));
  v_desc     := nullif(btrim(coalesce(p_product ->> 'description', '')), '');
  v_supplier := nullif(btrim(coalesce(p_product ->> 'supplier', '')), '');
  v_cost     := (p_product ->> 'cost_price')::numeric;
  v_sell     := (p_product ->> 'selling_price')::numeric;

  IF v_name = '' THEN RAISE EXCEPTION 'Product name is required.' USING ERRCODE = 'KV003'; END IF;
  IF v_sku = '' THEN RAISE EXCEPTION 'SKU is required.' USING ERRCODE = 'KV003'; END IF;
  IF v_cost IS NULL OR v_cost < 0 THEN RAISE EXCEPTION 'Purchase price must be 0 or more.' USING ERRCODE = 'KV003'; END IF;
  IF v_sell IS NULL OR v_sell <= 0 THEN RAISE EXCEPTION 'Selling price must be greater than 0.' USING ERRCODE = 'KV003'; END IF;
  IF p_variants IS NULL OR jsonb_typeof(p_variants) <> 'array' OR jsonb_array_length(p_variants) = 0 THEN
    RAISE EXCEPTION 'Add at least one size/colour with a quantity.' USING ERRCODE = 'KV003';
  END IF;

  -- Serialise stock-ins for the same SKU so two sessions cannot create duplicate products.
  PERFORM pg_advisory_xact_lock(hashtext('kv_stock_in:' || lower(v_sku)));

  SELECT email INTO v_email FROM public.profiles WHERE id = v_uid;

  -- Find the parent product: SKU first, then name+category for legacy rows without a SKU.
  SELECT * INTO v_product FROM public.products
   WHERE is_archived = false AND lower(btrim(coalesce(sku, ''))) = lower(v_sku)
   ORDER BY created_at ASC LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN
    SELECT * INTO v_product FROM public.products
     WHERE is_archived = false
       AND btrim(coalesce(sku, '')) = ''
       AND lower(btrim(name)) = lower(v_name)
       AND lower(btrim(category)) = lower(v_category)
     ORDER BY created_at ASC LIMIT 1
     FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    INSERT INTO public.products (name, category, brand, sku, cost_price, selling_price, stock,
                                 sizes, colors, description, size_type, stock_by_size)
    VALUES (v_name, v_category, v_brand, v_sku, v_cost, v_sell, 0,
            ARRAY[]::text[], ARRAY[]::text[], v_desc, 'alpha', '{}'::jsonb)
    RETURNING * INTO v_product;
    v_prod_new := true;
  END IF;

  v_old_cost := v_product.cost_price;
  v_old_sell := v_product.selling_price;
  v_map      := coalesce(v_product.stock_by_size, '{}'::jsonb);
  v_sizes    := coalesce(v_product.sizes, ARRAY[]::text[]);
  v_colors   := coalesce(v_product.colors, ARRAY[]::text[]);

  -- Process each variant line --------------------------------------------
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_variants) LOOP
    v_size_in := btrim(coalesce(v_line ->> 'size', ''));
    v_colour  := btrim(coalesce(v_line ->> 'colour', ''));
    v_qty     := (v_line ->> 'quantity')::integer;

    IF v_size_in = '' THEN RAISE EXCEPTION 'Every line needs a size.' USING ERRCODE = 'KV003'; END IF;
    IF v_qty IS NULL OR v_qty < 1 OR v_qty > 100000 THEN
      RAISE EXCEPTION 'Quantity must be between 1 and 100000 (size %).', v_size_in USING ERRCODE = 'KV003';
    END IF;

    -- Canonical size spelling: existing variant, then existing stock key / size list, else UPPER.
    v_size := NULL;
    SELECT pv.size INTO v_size FROM public.product_variants pv
     WHERE pv.product_id = v_product.id AND lower(btrim(pv.size)) = lower(v_size_in) LIMIT 1;
    IF v_size IS NULL THEN
      SELECT k INTO v_size FROM jsonb_object_keys(v_map) k WHERE lower(btrim(k)) = lower(v_size_in) LIMIT 1;
    END IF;
    IF v_size IS NULL THEN
      SELECT s INTO v_size FROM unnest(v_sizes) s WHERE lower(btrim(s)) = lower(v_size_in) LIMIT 1;
    END IF;
    IF v_size IS NULL THEN v_size := upper(v_size_in); END IF;

    SELECT * INTO v_variant FROM public.product_variants
     WHERE product_id = v_product.id
       AND lower(btrim(size)) = lower(v_size)
       AND lower(btrim(colour)) = lower(v_colour)
     FOR UPDATE;

    IF FOUND THEN
      UPDATE public.product_variants
         SET stock = stock + v_qty, is_active = true
       WHERE id = v_variant.id
       RETURNING * INTO v_variant;
      v_var_new := false;
    ELSE
      INSERT INTO public.product_variants (product_id, size, colour, barcode, stock)
      VALUES (v_product.id, v_size, v_colour, public.kv_next_barcode(), v_qty)
      RETURNING * INTO v_variant;
      v_var_new := true;
    END IF;

    -- Mirror into the product-level aggregates the rest of the dashboard reads.
    v_map := v_map || jsonb_build_object(
      v_size, coalesce((v_map ->> v_size)::integer, 0) + v_qty
    );
    IF NOT EXISTS (SELECT 1 FROM unnest(v_sizes) s WHERE lower(btrim(s)) = lower(v_size)) THEN
      v_sizes := v_sizes || v_size;
    END IF;
    IF v_colour <> '' AND NOT EXISTS (SELECT 1 FROM unnest(v_colors) c WHERE lower(btrim(c)) = lower(v_colour)) THEN
      v_colors := v_colors || v_colour;
    END IF;

    v_label := CASE WHEN v_variant.colour = '' THEN v_variant.size ELSE v_variant.colour || ' / ' || v_variant.size END;
    v_note := 'Barcode stock-in · ' || v_variant.barcode || ' · ' || v_label
              || coalesce(' · Supplier: ' || v_supplier, '');

    INSERT INTO public.inventory_activity (product_id, product_name, action, quantity, note, user_id, user_email)
    VALUES (v_product.id, v_product.name, 'stock_added', v_qty, v_note, v_uid, v_email);

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'variant_id', v_variant.id,
      'barcode', v_variant.barcode,
      'size', v_variant.size,
      'colour', v_variant.colour,
      'quantity_added', v_qty,
      'new_stock', v_variant.stock,
      'created', v_var_new
    ));
  END LOOP;

  SELECT COALESCE(SUM((value)::integer), 0) INTO v_total FROM jsonb_each_text(v_map);

  UPDATE public.products
     SET stock_by_size = v_map,
         stock         = v_total,
         sizes         = v_sizes,
         colors        = v_colors,
         cost_price    = v_cost,
         selling_price = v_sell,
         brand         = coalesce(v_brand, brand),
         description   = coalesce(v_desc, description),
         size_type     = CASE WHEN v_prod_new AND NOT EXISTS (SELECT 1 FROM unnest(v_sizes) s WHERE s !~ '^[0-9]+$')
                              THEN 'numeric' ELSE size_type END,
         updated_at    = now()
   WHERE id = v_product.id
   RETURNING * INTO v_product;

  IF v_prod_new THEN
    INSERT INTO public.inventory_activity (product_id, product_name, action, quantity, note, user_id, user_email)
    VALUES (v_product.id, v_product.name, 'created', 0, 'Created via barcode Stock In · SKU ' || v_sku, v_uid, v_email);
  ELSIF v_old_cost IS DISTINCT FROM v_cost OR v_old_sell IS DISTINCT FROM v_sell THEN
    INSERT INTO public.inventory_activity (product_id, product_name, action, quantity, note, user_id, user_email)
    VALUES (v_product.id, v_product.name, 'edited', 0,
            'Prices updated by Stock In · cost ' || v_old_cost || ' → ' || v_cost
              || ' · selling ' || v_old_sell || ' → ' || v_sell, v_uid, v_email);
  END IF;

  v_result := jsonb_build_object(
    'product', jsonb_build_object(
      'id', v_product.id, 'name', v_product.name, 'category', v_product.category,
      'sku', v_product.sku, 'created', v_prod_new,
      'cost_price', v_product.cost_price, 'selling_price', v_product.selling_price
    ),
    'lines', v_results,
    'replayed', false
  );

  UPDATE public.kv_idempotency_keys SET result = v_result WHERE key = p_request_key;
  RETURN v_result;
END;
$$;

-- 7. kv_complete_sale ---------------------------------------------------
-- p_items : [ { variant_id, quantity }, ... ]  — prices are NEVER accepted from the client.
-- Locks the affected products + variants, validates stock, inserts one `sales` row per
-- line (the existing trg_apply_sale_stock trigger lowers products.stock_by_size), lowers
-- product_variants.stock, recomputes products.stock, and logs inventory_activity.
-- Any failure rolls the whole thing back. Re-sending p_request_key returns the same bill.
CREATE OR REPLACE FUNCTION public.kv_complete_sale(
  p_request_key uuid,
  p_customer_name text,
  p_customer_mobile text,
  p_payment_method text,
  p_discount_type text,
  p_discount_value numeric,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_email     text;
  v_rows      integer;
  v_existing  jsonb;
  v_name      text := btrim(coalesce(p_customer_name, ''));
  v_mobile    text := btrim(coalesce(p_customer_mobile, ''));
  v_pay       text := coalesce(p_payment_method, '');
  v_dtype     text := coalesce(p_discount_type, 'amount');
  v_dval      numeric := coalesce(p_discount_value, 0);
  v_ids       uuid[];
  r           record;
  v_rec       record;
  v_agg       integer;
  v_lines     jsonb := '[]'::jsonb;
  v_line      jsonb;
  v_n         integer;
  v_i         integer := 0;
  v_subtotal  numeric := 0;
  v_discount  numeric;
  v_alloc     numeric := 0;
  v_ldisc     numeric;
  v_lsub      numeric;
  v_taxable   numeric;
  v_gst       numeric;
  v_ltotal    numeric;
  v_profit    numeric;
  v_gst_sum   numeric := 0;
  v_total     numeric := 0;
  v_disc_sum  numeric := 0;
  v_invoice   text;
  v_token     text;
  v_alphabet  constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_ua        bytea;
  v_ub        bytea;
  v_sale      public.sales%ROWTYPE;
  v_out_lines jsonb := '[]'::jsonb;
  v_label     text;
  v_result    jsonb;
  v_created   timestamptz;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only the owner can use Scan Billing.' USING ERRCODE = '42501';
  END IF;
  IF p_request_key IS NULL THEN
    RAISE EXCEPTION 'Missing request key.' USING ERRCODE = 'KV003';
  END IF;

  INSERT INTO public.kv_idempotency_keys (key, kind, created_by)
  VALUES (p_request_key, 'sale', v_uid)
  ON CONFLICT (key) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    SELECT result INTO v_existing FROM public.kv_idempotency_keys
      WHERE key = p_request_key AND created_by = v_uid;
    IF v_existing IS NOT NULL THEN
      RETURN v_existing || jsonb_build_object('replayed', true);
    END IF;
    RAISE EXCEPTION 'This bill was already submitted.' USING ERRCODE = 'KV003';
  END IF;

  -- Validate input ------------------------------------------------------
  IF v_name = '' THEN RAISE EXCEPTION 'Customer name is required.' USING ERRCODE = 'KV003'; END IF;
  IF v_mobile = '' THEN RAISE EXCEPTION 'Customer mobile number is required.' USING ERRCODE = 'KV003'; END IF;
  IF v_pay NOT IN ('Cash', 'UPI', 'Card') THEN RAISE EXCEPTION 'Choose a valid payment method.' USING ERRCODE = 'KV003'; END IF;
  IF v_dtype NOT IN ('percent', 'amount') THEN RAISE EXCEPTION 'Invalid discount type.' USING ERRCODE = 'KV003'; END IF;
  IF v_dval < 0 OR (v_dtype = 'percent' AND v_dval > 100) THEN
    RAISE EXCEPTION 'Invalid discount value.' USING ERRCODE = 'KV003';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Add at least one product to the bill.' USING ERRCODE = 'KV003';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS e(elem)
     WHERE (e.elem ->> 'variant_id') IS NULL
        OR (e.elem ->> 'quantity') IS NULL
        OR (e.elem ->> 'quantity')::integer < 1
        OR (e.elem ->> 'quantity')::integer > 10000
  ) THEN
    RAISE EXCEPTION 'Every line needs a valid product and a quantity of at least 1.' USING ERRCODE = 'KV003';
  END IF;

  SELECT array_agg(DISTINCT (e.elem ->> 'variant_id')::uuid) INTO v_ids
    FROM jsonb_array_elements(p_items) AS e(elem);

  -- Lock products first (id order), then variants (id order) — same order everywhere, no deadlocks.
  PERFORM 1 FROM public.products p
   WHERE p.id IN (SELECT pv.product_id FROM public.product_variants pv WHERE pv.id = ANY (v_ids))
   ORDER BY p.id FOR UPDATE;
  PERFORM 1 FROM public.product_variants pv WHERE pv.id = ANY (v_ids) ORDER BY pv.id FOR UPDATE;

  SELECT email INTO v_email FROM public.profiles WHERE id = v_uid;

  -- Pass 1: validate stock, take prices from the database -----------------
  -- Duplicate scans of the same variant are merged; first-seen order is kept.
  FOR r IN
    SELECT (e.elem ->> 'variant_id')::uuid AS variant_id,
           SUM((e.elem ->> 'quantity')::integer)::integer AS qty,
           MIN(e.ord) AS ord
      FROM jsonb_array_elements(p_items) WITH ORDINALITY AS e(elem, ord)
     GROUP BY 1
     ORDER BY 3
  LOOP
    SELECT pv.id AS variant_id, pv.product_id, pv.size, pv.colour, pv.barcode, pv.stock AS v_stock,
           pv.is_active, p.name, p.selling_price, p.cost_price, p.gst_pct, p.stock_by_size, p.is_archived
      INTO v_rec
      FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
     WHERE pv.id = r.variant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found. Please check the barcode or search manually.' USING ERRCODE = 'KV002';
    END IF;
    IF NOT v_rec.is_active OR v_rec.is_archived THEN
      RAISE EXCEPTION '% is no longer available for sale.', v_rec.name USING ERRCODE = 'KV002';
    END IF;
    IF v_rec.selling_price IS NULL OR v_rec.selling_price <= 0 THEN
      RAISE EXCEPTION '% has no selling price set.', v_rec.name USING ERRCODE = 'KV002';
    END IF;

    v_label := CASE WHEN v_rec.colour = '' THEN v_rec.size ELSE v_rec.colour || ' / ' || v_rec.size END;
    v_agg   := coalesce((v_rec.stock_by_size ->> v_rec.size)::integer, 0);

    IF least(v_rec.v_stock, v_agg) < r.qty THEN
      RAISE EXCEPTION 'Only % left of % (%).', greatest(least(v_rec.v_stock, v_agg), 0), v_rec.name, v_label
        USING ERRCODE = 'KV001';
    END IF;

    v_subtotal := v_subtotal + v_rec.selling_price * r.qty;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'variant_id', v_rec.variant_id, 'product_id', v_rec.product_id, 'name', v_rec.name,
      'size', v_rec.size, 'colour', v_rec.colour, 'barcode', v_rec.barcode, 'qty', r.qty,
      'price', v_rec.selling_price, 'cost', v_rec.cost_price, 'gst_pct', coalesce(v_rec.gst_pct, 0),
      'label', v_label
    ));
  END LOOP;

  -- Bill-level discount, same rounding rules as the existing billing code ------
  IF v_dtype = 'percent' THEN
    v_discount := round(v_subtotal * v_dval / 100);
  ELSE
    v_discount := round(v_dval);
  END IF;
  v_discount := greatest(0, least(v_subtotal, v_discount));

  -- Invoice number + public token ---------------------------------------
  LOOP
    v_invoice := 'KV-' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD') || '-'
                 || lpad((1000 + floor(random() * 9000))::integer::text, 4, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.sales WHERE invoice_number = v_invoice);
  END LOOP;

  v_ua := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  v_ub := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  v_token := '';
  FOR v_i IN 0..4 LOOP
    v_token := v_token || substr(v_alphabet, (get_byte(v_ua, v_i) % 32) + 1, 1)
                       || substr(v_alphabet, (get_byte(v_ub, v_i) % 32) + 1, 1);
  END LOOP;

  -- Pass 2: insert sale rows + deduct variant stock ------------------------
  v_n := jsonb_array_length(v_lines);
  v_i := 0;
  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    v_i := v_i + 1;
    v_lsub := (v_line ->> 'price')::numeric * (v_line ->> 'qty')::integer;
    IF v_i = v_n THEN
      v_ldisc := v_discount - v_alloc;
    ELSIF v_subtotal > 0 THEN
      v_ldisc := round(v_lsub / v_subtotal * v_discount);
    ELSE
      v_ldisc := 0;
    END IF;
    v_ldisc := greatest(0, least(v_lsub, v_ldisc));
    v_alloc := v_alloc + v_ldisc;

    v_taxable := greatest(0, v_lsub - v_ldisc);
    v_gst     := round(v_taxable * (v_line ->> 'gst_pct')::numeric / 100);
    v_ltotal  := v_taxable + v_gst;
    v_profit  := ((v_line ->> 'price')::numeric - (v_line ->> 'cost')::numeric)
                 * (v_line ->> 'qty')::integer - v_ldisc;

    INSERT INTO public.sales (
      invoice_number, public_token, customer_name, customer_mobile,
      product_id, product_name, variant, size, quantity,
      unit_cost, unit_price, discount, total_amount, profit,
      payment_method, payment_status, created_by, variant_id, barcode
    ) VALUES (
      v_invoice, v_token, v_name, v_mobile,
      (v_line ->> 'product_id')::uuid, v_line ->> 'name', nullif(v_line ->> 'colour', ''),
      v_line ->> 'size', (v_line ->> 'qty')::integer,
      (v_line ->> 'cost')::numeric, (v_line ->> 'price')::numeric, v_ldisc, v_ltotal, v_profit,
      v_pay, 'Paid', v_uid, (v_line ->> 'variant_id')::uuid, v_line ->> 'barcode'
    ) RETURNING * INTO v_sale;
    -- NOTE: trg_apply_sale_stock (existing) has just lowered products.stock_by_size[size].

    UPDATE public.product_variants
       SET stock = stock - (v_line ->> 'qty')::integer
     WHERE id = (v_line ->> 'variant_id')::uuid;   -- CHECK (stock >= 0) is the last line of defence

    -- Keep products.stock = SUM(stock_by_size) regardless of any other stock trigger.
    UPDATE public.products p
       SET stock = COALESCE((SELECT SUM((value)::integer) FROM jsonb_each_text(p.stock_by_size)), 0),
           updated_at = now()
     WHERE p.id = (v_line ->> 'product_id')::uuid;

    INSERT INTO public.inventory_activity (product_id, product_name, action, quantity, note, user_id, user_email)
    VALUES ((v_line ->> 'product_id')::uuid, v_line ->> 'name', 'sold', -((v_line ->> 'qty')::integer),
            'Invoice ' || v_invoice || ' · Scan Billing · ' || (v_line ->> 'barcode') || ' · ' || (v_line ->> 'label'),
            v_uid, v_email);

    v_gst_sum  := v_gst_sum + v_gst;
    v_disc_sum := v_disc_sum + v_ldisc;
    v_total    := v_total + v_ltotal;
    v_created  := v_sale.created_at;

    v_out_lines := v_out_lines || jsonb_build_array(jsonb_build_object(
      'sale_id', v_sale.id, 'product_id', v_sale.product_id, 'variant_id', v_sale.variant_id,
      'product_name', v_sale.product_name, 'variant', v_sale.variant, 'size', v_sale.size,
      'barcode', v_sale.barcode, 'quantity', v_sale.quantity, 'unit_price', v_sale.unit_price,
      'discount', v_sale.discount, 'line_total', v_sale.total_amount
    ));
  END LOOP;

  v_result := jsonb_build_object(
    'invoice_number', v_invoice,
    'public_token', v_token,
    'created_at', v_created,
    'customer_name', v_name,
    'customer_mobile', v_mobile,
    'payment_method', v_pay,
    'subtotal', v_subtotal,
    'discount', v_disc_sum,
    'gst', v_gst_sum,
    'total', v_total,
    'lines', v_out_lines,
    'replayed', false
  );

  UPDATE public.kv_idempotency_keys SET result = v_result WHERE key = p_request_key;
  RETURN v_result;
END;
$$;

-- 8. Function privileges: owner-only, enforced again inside each function ---
REVOKE ALL ON FUNCTION public.kv_next_barcode() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kv_touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kv_stock_in(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kv_stock_in(uuid, jsonb, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.kv_complete_sale(uuid, text, text, text, text, numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kv_complete_sale(uuid, text, text, text, text, numeric, jsonb) TO authenticated;
