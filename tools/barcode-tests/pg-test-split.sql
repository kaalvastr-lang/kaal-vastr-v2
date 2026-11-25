\pset pager off
INSERT INTO auth.users (id,email) VALUES ('11111111-1111-1111-1111-111111111111','owner@kv.test');
INSERT INTO auth.users (id,email) VALUES ('22222222-2222-2222-2222-222222222222','staff@kv.test');
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT (kv_stock_in('aaaaaaaa-0000-0000-0000-000000000001','{"name":"Jeans","category":"Jeans","sku":"KV-JNS","cost_price":400,"selling_price":999}','[{"size":"30","colour":"Blue","quantity":10},{"size":"32","colour":"Blue","quantity":10}]') -> 'product' ->> 'name') AS product;
SELECT size_type, sizes, stock_by_size FROM products;
UPDATE products SET gst_pct = 5;

\echo '--- 1. old-style call (no p_payments, single method) still works'
SELECT r ->> 'payment_method' AS pm, r ->> 'total' AS total FROM (SELECT kv_complete_sale('bbbbbbbb-0000-0000-0000-000000000001','Asha','9','UPI','amount',0,
  (SELECT jsonb_build_array(jsonb_build_object('variant_id',id,'quantity',1)) FROM product_variants WHERE size='30')) AS r) t;

\echo '--- 2. split Cash 500 + UPI 549.50 on 1 x 999 (+5% GST = 1048.95 -> rounds to whole rupees)'
SELECT r ->> 'total' AS total, r ->> 'payment_method' AS pm, r -> 'payments' AS payments FROM (SELECT kv_complete_sale('bbbbbbbb-0000-0000-0000-000000000002','Ravi','9','Cash','percent',0,
  (SELECT jsonb_build_array(jsonb_build_object('variant_id',id,'quantity',1)) FROM product_variants WHERE size='30'),
  '[{"method":"Cash","amount":500},{"method":"UPI","amount":549}]') AS r) t;

\echo '--- 3. payments not adding up are rejected and nothing is saved'
SELECT count(*) AS sales_before FROM sales \gset
SELECT stock AS v_before FROM product_variants WHERE size='32' \gset
SELECT kv_complete_sale('bbbbbbbb-0000-0000-0000-000000000003','Ravi','9','Cash','amount',0,
  (SELECT jsonb_build_array(jsonb_build_object('variant_id',id,'quantity',2)) FROM product_variants WHERE size='32'),
  '[{"method":"Cash","amount":100},{"method":"UPI","amount":100}]');
SELECT (SELECT count(*) FROM sales) - :sales_before AS new_sales_after_reject, (SELECT stock FROM product_variants WHERE size='32') - :v_before AS stock_change_after_reject;

\echo '--- 4. duplicate method / zero amount / bad method / 4 parts rejected'
SELECT kv_complete_sale('bbbbbbbb-0000-0000-0000-000000000004','R','9','Cash','amount',0,(SELECT jsonb_build_array(jsonb_build_object('variant_id',id,'quantity',1)) FROM product_variants WHERE size='32'),'[{"method":"Cash","amount":500},{"method":"Cash","amount":549}]');
SELECT kv_complete_sale('bbbbbbbb-0000-0000-0000-000000000005','R','9','Cash','amount',0,(SELECT jsonb_build_array(jsonb_build_object('variant_id',id,'quantity',1)) FROM product_variants WHERE size='32'),'[{"method":"Cash","amount":0},{"method":"UPI","amount":1049}]');
SELECT kv_complete_sale('bbbbbbbb-0000-0000-0000-000000000006','R','9','Cash','amount',0,(SELECT jsonb_build_array(jsonb_build_object('variant_id',id,'quantity',1)) FROM product_variants WHERE size='32'),'[{"method":"Cheque","amount":1049}]');

\echo '--- 5. three-way split on 2 pieces with 10% discount'
SELECT r ->> 'total' AS total, r ->> 'payment_method' AS pm FROM (SELECT kv_complete_sale('bbbbbbbb-0000-0000-0000-000000000007','Meena','9','Cash','percent',10,
  (SELECT jsonb_build_array(jsonb_build_object('variant_id',id,'quantity',2)) FROM product_variants WHERE size='32'),
  '[{"method":"Cash","amount":500},{"method":"UPI","amount":500},{"method":"Card","amount":390}]'::jsonb) AS r) t;
