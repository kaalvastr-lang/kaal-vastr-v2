# Kaal Vastr — Barcode Stock In & Scan Billing

Owner-only additions to the existing dashboard (same app, same Supabase project, same login). Normal Billing is unchanged.
Dashboard navigation now has **Stock In** and **Scan Billing** (after Products). A *Normal Billing / Scan Billing*
switch appears at the top of both billing screens.

## 1. What was found in the existing project (Phase 1–2)

* The app is **TanStack Start** (SSR build, deployed from `.output`), with the dashboard as one route that switches
  sections in state — the new sections follow the same pattern. `/dashboard` is already admin-only (`_authenticated`
  route sends staff to `/employee`).
* There was **no variant table and no `sale_items`**. Stock lives on `products.stock_by_size` (per size, no per-colour
  stock); one `sales` row per invoice line (grouped by `invoice_number`). The existing trigger `apply_sale_stock`
  lowers `stock_by_size` when a `sales` row is inserted. Prices are per product (`cost_price`, `selling_price`).
* The UI is the existing near-black / gold theme (not grey) — the new screens reuse the same cards, tokens and components.

## 2. Design decisions

* `product_variants` (new) = one row per **product + size + colour**, with a **permanent unique barcode** (`KV000001`…)
  and its own stock. The parent `products` row is reused (matched by SKU, then name+category for legacy rows without a SKU),
  so no duplicate products or variants. Barcodes encode only the ID — never a price.
* `products.stock_by_size` / `products.stock` are updated in the **same transaction**, so every existing dashboard
  figure, report and profit calculation stays in sync. Scan sales use the existing `sales` table and trigger, so the
  existing invoice, public invoice link, WhatsApp/SMS sharing and analytics work unchanged. `sales.variant` stores the colour.
* Checkout sells `min(variant stock, product size stock)` so it can never oversell from either side.
* Prices/costs/GST are read by the **database**; the browser only sends variant ids and quantities.

## 3. Database changes (additive)

File: `supabase/migrations/20261113100000_barcode_inventory.sql`

| Object | Purpose |
|---|---|
| `product_variants` | variant + permanent barcode + stock; unique barcode, unique (product, size, colour), `stock >= 0` |
| `barcode_print_jobs` | print history |
| `kv_idempotency_keys` | stops double submission (no client access) |
| `sales.variant_id`, `sales.barcode` | nullable trace columns |
| `kv_stock_in(key, product, variants)` | atomic Stock In (owner only) |
| `kv_complete_sale(key, customer…, items)` | atomic Scan Billing checkout (owner only) |

RLS stays on everywhere. New tables are readable only by `admin`; clients cannot write `product_variants` directly;
both functions re-check `has_role(auth.uid(),'admin')` and are not executable by `anon`. No service-role key is used in the browser.

**Apply:** automatically on every push to `main` by the GitHub Action - see `docs/DEPLOYMENT_AND_MIGRATIONS.md` (one-time secret setup). Nothing existing is dropped or overwritten, and no stock is changed by the migrations; they are safe to run more than once.

**Optional fix I found** (not applied): `supabase/optional/drop_duplicate_stock_trigger.sql` — the old migrations leave two stock triggers on
`sales`, which can make `products.stock` drift by the last sold quantity after Normal Billing. Scan Billing is immune; read that file before applying.

## 4. Files

**Modified:** `src/routes/_authenticated/dashboard.tsx` (nav, 2 sections, billing switch), `src/integrations/supabase/types.ts` (new tables/functions/columns).

**New:**
`supabase/migrations/20261113100000_barcode_inventory.sql`, `supabase/optional/drop_duplicate_stock_trigger.sql`,
`src/services/barcodeInventory.ts`, `src/hooks/use-owner.ts`,
`src/lib/kv/barcode/{code128,label,settings,scanner,useBarcodeScanner,printer,usePrinting,billing}.ts`,
`src/components/kv/barcode/{OwnerOnly,BillingModeSwitch,LabelPreview,ScannerStatus,ScannerSettingsPanel,PrinterSettingsPanel}.tsx`,
`src/components/kv/stock-in/{StockInSection,LabelPrintTable,ChipInput}.tsx`,
`src/components/kv/scan-billing/ScanBillingSection.tsx`, `tools/barcode-tests/*`, this document.

**npm dependencies:** none added.

## 5. Using it

**Stock In → Receive stock.** Enter SKU, name, category, prices, then add sizes and colours (chips) and type quantities in the grid
(e.g. Black/White × M/L). *Add stock & generate barcodes* creates/reuses the product and variants, adds stock, logs activity and
shows the label table. Typing an existing SKU shows "already exists — stock will be added" (no duplicate). Re-sending the same
submission never adds stock twice. Barcodes are generated and saved at this step (there is no separate "generate" button because they cannot exist without the variant).
Labels: preview, *Print All*, *Print Selected*, per-row copies (20 pieces → 20 copies of the same barcode), *Test Print*.
**Barcodes & labels** tab reprints any variant any time; **Print history** keeps every attempt and offers *Retry* for failures. A failed print never touches stock.

**Scan Billing.** Scan (or type) a barcode → price, stock and cart quantity appear → scan again to add quantity. Invalid barcode shows
"Product not found. Please check the barcode or search manually."; out of stock is blocked. Manual search, quantity +/−, remove, customer, payment, % or ₹ discount, then *Complete sale*;
the invoice window opens (same one as Normal Billing) with WhatsApp / SMS / PDF buttons.

## 6. Zebra Browser Print (Windows)

1. Install the **Zebra ZD230** driver (ZDesigner / Zebra Setup Utilities) and connect it by USB; confirm it appears in Windows *Printers & scanners*.
2. Download and install **Zebra Browser Print** from Zebra's website (Browser Print for Windows). Leave its tray icon running (start with Windows).
3. In Chrome/Edge open the app → **Stock In → Printer & scanner**. Press *Re-detect*. If the browser asks to allow this site to access
   devices on your network/computer, choose Allow. The ZD230 is selected automatically when found.
4. If detection fails, open `http://localhost:9100/available` in the same browser — you should see JSON listing the printer. If you are asked to trust
   `https://localhost:9101`, accept that once.
5. Fallback: choose print method *Browser print dialog* and pick the label printer/page size 50 × 25 mm.

### ZD230 for 50 × 25 mm labels
* Load 50 × 25 mm gap labels; in Zebra Setup Utilities (or the printer menu) set label width 50 mm, length 25 mm, media **Label (web sensing / gap)**, thermal transfer or direct thermal to match your stock, then run **calibration** (or *Calibrate media* in the app).
* The app sends ZPL II for a 400 × 200 dot canvas at 203 DPI (`^PW400 ^LL200`). Label size, DPI, bar height, bar width and text positions are editable under Printer settings.

## 7. USB scanner setup

No driver is needed. Any scanner that works as a keyboard (Zebra, Honeywell, TVS, Symbol, generic USB, 2.4 GHz dongle, Bluetooth HID) is supported;
nothing is brand-specific. The service detects scanner-speed typing (default: characters < 80 ms apart), ends a scan on Enter / Tab, or on a short silence
if the scanner sends no suffix, and never captures normal typing. Characters a scanner types into a text box are removed and the Enter is swallowed.
Settings (Stock In → Printer & scanner, or the gear on Scan Billing): input mode (auto / dedicated scan box), Enter suffix, Tab suffix, minimum length, scan timeout, beep, and a live **Test Scanner**.
Tips: configure the scanner for **Code 128**, **Enter suffix**, **English/US keyboard layout**. Bluetooth scanners that are slow → raise the timeout (120–200 ms).
Codes are upper-cased before lookup, so a Caps Lock mismatch does not break scans.
Extra transports (Web Serial, WebHID, camera) can be added by implementing `ScannerAdapter` in `src/lib/kv/barcode/scanner.ts`.

## 8. Local setup

```bash
npm ci
npm run dev        # development
npm run build      # production build (passes)
```
Environment variables are unchanged (existing Supabase URL / publishable key). Apply the migration to your Supabase project first.

## 9. Testing results — what was and was NOT verified

Verified here (automated, on a local PostgreSQL 16 with the project's real migrations + the new one, and Node/jsdom):
* Migrations apply cleanly in order. Stock In: product + 4 variants created, unique barcodes `KV000001…`, aggregates (`stock_by_size`, `stock`, colours, sizes) correct; restock of the same SKU reuses the product and variant (no duplicates, same barcode); replaying a request does not add stock twice (TEST 1–3).
* Scan checkout: correct stock decrease on variant and product, correct totals/discount/GST/profit, activity rows, replay returns the same invoice, oversell is rejected and rolls back completely, existing manual-billing insert path still works, staff cannot call either function nor read/write the new tables, barcode uniqueness/format enforced (TEST 11, 12, 17, 20 at database level).
* Client cart totals equal the database totals on 40 random bills; Code 128 encoder identical to `jsbarcode` on 9 test strings; ZPL has no price/cost, escapes `^ ~ _`, centres the barcode inside 400 dots; scanner service passes 15 behaviour tests (suffix/no-suffix, text-field cleanup, slow typing ignored, dedicated mode, repeats, no duplicates) (TEST 21 with emulated keyboard-wedge input).
* `tsc` and `npm run build` pass; new files are lint-clean.

**Not verified (no hardware / no live project available):** physical Zebra ZD230 printing and label fit (TEST 5, 6, 18), real USB scanner reads (TEST 7–10 with hardware), a live Supabase project, browser click-through of the new screens, WhatsApp opening, invoice PDF output for scan sales, and running the migration against your production data. Please run the checklist below on the shop PC.

Checklist: Stock In 20 × Black/M → 20 labels print and scan back to the right product/size/colour/price → scan 2 different items + the same item twice → complete sale → stock and dashboard update → invoice + WhatsApp → unplug printer and confirm the error and Retry → log in as staff and confirm no access.

## 10. Known limitations / assumptions

* **Zebra Browser Print protocol is unverified on hardware.** The app talks to Browser Print's local service (`http://localhost:9100`, fallback `https://localhost:9101`) using its documented `/available` and `/write` calls. Chrome/Edge on Windows should allow this from the HTTPS site; Safari does not. If it fails, use the *Browser print dialog* method.
* One selling price and one purchase price per product (existing model): Stock In updates them for the whole product (past sales keep their own price).
* Stock that existed **before** this feature has no variant barcode; it stays sellable in Normal Billing but is not scannable until received through Stock In. Normal Billing sales of a barcoded product reduce the product's per-size stock but not a specific colour's variant stock (colour is not recorded there); Scan Billing therefore sells `min(variant, size stock)`.
* Discount in Scan Billing is bill-level (% or ₹), shared proportionally across lines; the existing manual billing's per-line discount is unchanged.
* Print history/settings: scanner, label and printer choices are stored per browser (per counter PC), not in the database.
* Invoice share: the invoice window opens after each sale (WhatsApp/SMS buttons), rather than auto-opening WhatsApp.

## 11. Later additions

* **Number sizes** - Stock In has a *Letter sizes / Number sizes* switch (28, 30, 32 … 44, plus *Add all*). Any other size can still be typed. Size columns are kept in order.
* **Split payments** - Normal Billing and Scan Billing both have *Split payment (two methods)*: pick the first method and amount, the second method automatically takes the rest (*Half & half* button). The bill stores e.g. `Cash 500 + UPI 300` in the existing payment column, so invoices, the public invoice page and the PDF show it, and Sales Analytics splits the amounts between Cash / UPI / Card. Scan Billing also verifies the amounts in the database against the bill total.
* **`variant` column** - `20261122090000_ensure_variant_columns.sql` (see DEPLOYMENT_AND_MIGRATIONS.md).
