# Barcode feature verification scripts

These are the scripts used to verify the barcode modules. They are standalone (not part of `npm run build`).

* `pg-stub.sql`, `pg-test.sql` — run the real migrations plus the Stock In / Scan Billing functions on a plain
  PostgreSQL 16 (Supabase `auth` schema stubbed). Covers stock-in, duplicate prevention, atomic checkout, oversell
  rejection, replay protection, owner-only access and RLS.
* `build.mjs`, `test-code128.mjs`, `test-label.mjs`, `test-scanner.mjs`, `test-billing.mjs` — Node tests for the
  Code 128 encoder (compared with `jsbarcode`), ZPL/label generation, the keyboard-wedge scanner (jsdom) and the
  cart totals preview (compared with the database over random bills).

Setup: `mkdir h && cd h && npm i jsdom jsbarcode esbuild`, copy these files in, point `build.mjs` at `src/lib/kv/barcode`,
`node build.mjs`, then run the `test-*.mjs` files.
