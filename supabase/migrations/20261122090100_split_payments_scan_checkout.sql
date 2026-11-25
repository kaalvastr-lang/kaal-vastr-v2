-- =====================================================================
-- Split payments for Scan Billing checkout
--
-- Replaces public.kv_complete_sale with a version that accepts an optional list of payments
-- (e.g. Cash 500 + UPI 300). The database validates that the payments add up to the bill total
-- it computed itself, and stores them in sales.payment_method as plain text:
--     single payment : 'Cash' | 'UPI' | 'Card'            (unchanged from before)
--     split payment  : 'Cash 500 + UPI 300'
-- Invoices, the public invoice page and the PDF already print payment_method verbatim, and
-- analytics reads the split text (see src/lib/kv/payments.ts). No new table, no data rewritten.
-- Callers that do not pass p_payments behave exactly as before.
-- =====================================================================

DROP FUNCTION IF EXISTS public.kv_complete_sale(uuid, text, text, text, text, numeric, jsonb);

CREATE OR REPLACE FUNCTION public.kv_complete_sale(
  p_request_key uuid,
  p_customer_name text,
  p_customer_mobile text,
  p_payment_method text,
  p_discount_type text,
  p_discount_value numeric,
  p_items jsonb,
  p_payments jsonb DEFAULT NULL
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
  v_calc      jsonb := '[]'::jsonb;
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
  v_part      jsonb;
  v_method    text;
  v_amt       numeric;
  v_pay_sum   numeric := 0;
  v_pay_text  text := '';
  v_pay_json  jsonb := '[]'::jsonb;
  v_seen      text[] := ARRAY[]::text[];
  v_split     boolean;
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

  v_split := p_payments IS NOT NULL
             AND jsonb_typeof(p_payments) = 'array'
             AND jsonb_array_length(p_payments) > 0;

  -- Validate input ------------------------------------------------------
  IF v_name = '' THEN RAISE EXCEPTION 'Customer name is required.' USING ERRCODE = 'KV003'; END IF;
  IF v_mobile = '' THEN RAISE EXCEPTION 'Customer mobile number is required.' USING ERRCODE = 'KV003'; END IF;
  IF NOT v_split AND v_pay NOT IN ('Cash', 'UPI', 'Card') THEN
    RAISE EXCEPTION 'Choose a valid payment method.' USING ERRCODE = 'KV003';
  END IF;
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

  -- Pass 2: work out every line (discount share, GST, total, profit) -----------
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

    v_gst_sum  := v_gst_sum + v_gst;
    v_disc_sum := v_disc_sum + v_ldisc;
    v_total    := v_total + v_ltotal;
    v_calc := v_calc || jsonb_build_array(v_line || jsonb_build_object(
      'disc', v_ldisc, 'ltotal', v_ltotal, 'profit', v_profit
    ));
  END LOOP;

  -- Payments: must add up to the total the database just computed --------------
  IF v_split THEN
    IF jsonb_array_length(p_payments) > 3 THEN
      RAISE EXCEPTION 'Use at most 3 payment methods.' USING ERRCODE = 'KV003';
    END IF;
    FOR v_part IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
      v_method := v_part ->> 'method';
      v_amt    := round((v_part ->> 'amount')::numeric, 2);
      IF v_method IS NULL OR v_method NOT IN ('Cash', 'UPI', 'Card') THEN
        RAISE EXCEPTION 'Choose a valid payment method.' USING ERRCODE = 'KV003';
      END IF;
      IF v_amt IS NULL OR v_amt <= 0 THEN
        RAISE EXCEPTION 'Each payment amount must be greater than 0.' USING ERRCODE = 'KV003';
      END IF;
      IF v_method = ANY (v_seen) THEN
        RAISE EXCEPTION 'Use each payment method only once.' USING ERRCODE = 'KV003';
      END IF;
      v_seen     := v_seen || v_method;
      v_pay_sum  := v_pay_sum + v_amt;
      v_pay_json := v_pay_json || jsonb_build_array(jsonb_build_object('method', v_method, 'amount', v_amt));
      v_pay_text := v_pay_text || CASE WHEN v_pay_text = '' THEN '' ELSE ' + ' END
                    || v_method || ' ' || trim_scale(v_amt)::text;
    END LOOP;
    IF abs(v_pay_sum - v_total) > 0.005 THEN
      RAISE EXCEPTION 'Payments (%) must add up to the bill total (%).', trim_scale(v_pay_sum), trim_scale(v_total)
        USING ERRCODE = 'KV003';
    END IF;
    IF jsonb_array_length(p_payments) = 1 THEN
      v_pay_text := v_seen[1];     -- one method paying the whole bill: store it plainly
    END IF;
  ELSE
    v_pay_text := v_pay;
    v_pay_json := jsonb_build_array(jsonb_build_object('method', v_pay, 'amount', v_total));
  END IF;

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

  -- Pass 3: insert sale rows + deduct variant stock ------------------------
  FOR v_line IN SELECT * FROM jsonb_array_elements(v_calc) LOOP
    INSERT INTO public.sales (
      invoice_number, public_token, customer_name, customer_mobile,
      product_id, product_name, variant, size, quantity,
      unit_cost, unit_price, discount, total_amount, profit,
      payment_method, payment_status, created_by, variant_id, barcode
    ) VALUES (
      v_invoice, v_token, v_name, v_mobile,
      (v_line ->> 'product_id')::uuid, v_line ->> 'name', nullif(v_line ->> 'colour', ''),
      v_line ->> 'size', (v_line ->> 'qty')::integer,
      (v_line ->> 'cost')::numeric, (v_line ->> 'price')::numeric,
      (v_line ->> 'disc')::numeric, (v_line ->> 'ltotal')::numeric, (v_line ->> 'profit')::numeric,
      v_pay_text, 'Paid', v_uid, (v_line ->> 'variant_id')::uuid, v_line ->> 'barcode'
    ) RETURNING * INTO v_sale;
    -- NOTE: the existing sales trigger has just lowered products.stock_by_size[size].

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

    v_created := v_sale.created_at;
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
    'payment_method', v_pay_text,
    'payments', v_pay_json,
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

REVOKE ALL ON FUNCTION public.kv_complete_sale(uuid, text, text, text, text, numeric, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kv_complete_sale(uuid, text, text, text, text, numeric, jsonb, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
