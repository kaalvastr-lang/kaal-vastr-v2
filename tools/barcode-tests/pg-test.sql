\set ON_ERROR_STOP off
\pset pager off
INSERT INTO auth.users (id,email) VALUES ('11111111-1111-1111-1111-111111111111','owner@kv.test');
INSERT INTO auth.users (id,email) VALUES ('22222222-2222-2222-2222-222222222222','staff@kv.test');
SELECT u.email, r.role FROM auth.users u JOIN user_roles r ON r.user_id=u.id ORDER BY 1;

SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

\echo '--- TEST1/2/3: stock-in 4 variants'
SELECT jsonb_pretty(kv_stock_in('aaaaaaaa-0000-0000-0000-000000000001',
 '{"name":"Oversized T-Shirt","category":"T-Shirts","brand":"KV","sku":"KV-TSH-OVR","cost_price":350,"selling_price":799,"supplier":"Acme"}',
 '[{"size":"m","colour":"Black","quantity":20},{"size":"L","colour":"Black","quantity":15},{"size":"M","colour":"White","quantity":10},{"size":"L","colour":"White","quantity":12}]'));
SELECT name, sku, stock, stock_by_size, sizes, colors, cost_price, selling_price, size_type FROM products;
SELECT barcode, size, colour, stock FROM product_variants ORDER BY barcode;

\echo '--- replay same key (must not add stock)'
SELECT (kv_stock_in('aaaaaaaa-0000-0000-0000-000000000001', '{"name":"x","sku":"x","cost_price":1,"selling_price":1}','[{"size":"M","quantity":1}]') ->> 'replayed') AS replayed;
SELECT sum(stock) AS variant_total FROM product_variants;

\echo '--- restock existing variant + new variant, same product'
SELECT (kv_stock_in('aaaaaaaa-0000-0000-0000-000000000002',
 '{"name":"Oversized T-Shirt","category":"T-Shirts","sku":"kv-tsh-ovr","cost_price":360,"selling_price":849}',
 '[{"size":"M","colour":"black","quantity":5},{"size":"XL","colour":"Black","quantity":3}]') -> 'lines') AS lines;
SELECT count(*) AS products_count FROM products;
SELECT barcode, size, colour, stock FROM product_variants ORDER BY barcode;
SELECT name, stock, stock_by_size, selling_price FROM products;

\echo '--- TEST11/12: scan sale (Black M x2 as 2 scans, White L x1) 10% discount'
SELECT jsonb_pretty(kv_complete_sale('bbbbbbbb-0000-0000-0000-000000000001','Asha','9876543210','UPI','percent',10,
 (SELECT jsonb_agg(jsonb_build_object('variant_id',id,'quantity',q)) FROM (
    SELECT id,1 AS q FROM product_variants WHERE barcode='KV000001'
    UNION ALL SELECT id,1 FROM product_variants WHERE barcode='KV000001'
    UNION ALL SELECT id,1 FROM product_variants WHERE barcode='KV000004') t)));
SELECT invoice_number, product_name, variant, size, quantity, unit_price, discount, total_amount, profit, barcode FROM sales ORDER BY created_at, id;
SELECT barcode, stock FROM product_variants ORDER BY barcode;
SELECT stock, stock_by_size, (SELECT sum((value)::int) FROM jsonb_each_text(stock_by_size)) AS sum_map FROM products;
SELECT action, quantity, note FROM inventory_activity ORDER BY created_at, id;

\echo '--- replay same checkout key: no second sale'
SELECT (kv_complete_sale('bbbbbbbb-0000-0000-0000-000000000001','Asha','9876543210','UPI','percent',10,'[]') ->> 'replayed') AS replayed;
SELECT count(*) AS sale_rows FROM sales;

\echo '--- TEST17: oversell'
SELECT kv_complete_sale('bbbbbbbb-0000-0000-0000-000000000002','Ravi','9000000000','Cash','amount',0,
 (SELECT jsonb_build_array(jsonb_build_object('variant_id',id,'quantity',999)) FROM product_variants WHERE barcode='KV000001'));
SELECT count(*) AS sale_rows_after_failure FROM sales;
SELECT barcode, stock FROM product_variants WHERE barcode='KV000001';
SELECT count(*) AS leftover_keys FROM kv_idempotency_keys WHERE key='bbbbbbbb-0000-0000-0000-000000000002';

\echo '--- manual (existing) billing path still works and aggregate drops'
INSERT INTO sales (invoice_number,public_token,customer_name,customer_mobile,product_id,product_name,size,quantity,unit_price,total_amount)
 SELECT 'KV-MANUAL-1','TOKMANUAL1','M','1',id,name,'M',3,849,2547 FROM products;
SELECT stock_by_size FROM products;
\echo '--- scan sale now limited by min(variant, aggregate): White M has 10 variant stock, aggregate M is 30-? '
SELECT kv_complete_sale('bbbbbbbb-0000-0000-0000-000000000003','Ravi','9000000000','Cash','amount',0,
 (SELECT jsonb_build_array(jsonb_build_object('variant_id',id,'quantity',10)) FROM product_variants WHERE barcode='KV000003')) ->> 'invoice_number';

\echo '--- TEST20: staff blocked'
SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
SELECT kv_stock_in('cccccccc-0000-0000-0000-000000000001','{"name":"n","sku":"s","cost_price":1,"selling_price":2}','[{"size":"M","quantity":1}]');
SELECT kv_complete_sale('cccccccc-0000-0000-0000-000000000002','a','b','Cash','amount',0,'[]');

\echo '--- RLS as authenticated staff/owner on product_variants'
SET ROLE authenticated;
SELECT count(*) AS staff_sees_variants FROM product_variants;
SELECT count(*) AS staff_sees_print_jobs FROM barcode_print_jobs;
INSERT INTO product_variants (product_id,size,barcode) SELECT id,'S','HACK0001' FROM products;
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT count(*) AS owner_sees_variants FROM product_variants;
INSERT INTO product_variants (product_id,size,barcode) SELECT id,'S','HACK0002' FROM products;
INSERT INTO barcode_print_jobs (barcode,copies) VALUES ('KV000001',20);
SELECT count(*) AS owner_print_jobs FROM barcode_print_jobs;
RESET ROLE;

\echo '--- barcode uniqueness / format'
INSERT INTO product_variants (product_id,size,barcode) SELECT id,'S','KV000001' FROM products;
INSERT INTO product_variants (product_id,size,barcode) SELECT id,'S','bad code' FROM products;
