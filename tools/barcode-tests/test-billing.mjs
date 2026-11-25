import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { previewTotals } from "./out/billing.js";
const psql = (sql) => execFileSync("su", ["postgres", "-c", `psql -q -At -d kvtest -v ON_ERROR_STOP=1 -c "${sql.replace(/"/g, '\\"')}"`], { encoding: "utf8" }).trim();
const OWNER = "11111111-1111-1111-1111-111111111111";
const run = (sql) => psql(`SET request.jwt.claim.sub='${OWNER}'; ${sql}`);
let fails = 0, n = 0;
for (let t = 0; t < 40; t++) {
  const lines = [];
  const items = [];
  const k = 1 + Math.floor(Math.random() * 4);
  for (let i = 0; i < k; i++) {
    const price = [199, 349, 499, 599, 799, 849, 999, 1299, 1499][Math.floor(Math.random() * 9)] + Math.floor(Math.random()*3);
    const gst = [0, 5, 12, 18][Math.floor(Math.random() * 4)];
    const qty = 1 + Math.floor(Math.random() * 4);
    const sku = `T${t}-${i}`;
    const res = run(`SELECT kv_stock_in('${randomUUID()}','{"name":"P ${sku}","category":"C","sku":"${sku}","cost_price":100,"selling_price":${price}}','[{"size":"M","colour":"X","quantity":50}]') -> 'lines' -> 0 ->> 'variant_id'`);
    const vid = res.split("\n").pop();
    run(`UPDATE products SET gst_pct=${gst} WHERE sku='${sku}'`);
    lines.push({ price, qty, gstPct: gst });
    items.push({ variant_id: vid, quantity: qty });
  }
  const type = Math.random() < 0.5 ? "percent" : "amount";
  const value = type === "percent" ? [0, 5, 10, 12.5, 15, 33][Math.floor(Math.random() * 6)] : [0, 50, 100, 333, 777][Math.floor(Math.random() * 5)];
  const out = run(`SELECT (kv_complete_sale('${randomUUID()}','A','9','Cash','${type}',${value},'${JSON.stringify(items)}'::jsonb))::text`).split("\n").pop();
  const r = JSON.parse(out);
  const p = previewTotals(lines, type, value);
  const ok = p.subtotal === Number(r.subtotal) && p.discount === Number(r.discount) && p.gst === Number(r.gst) && p.total === Number(r.total);
  n++; if (!ok) { fails++; console.log("MISMATCH", JSON.stringify({ lines, type, value, preview: p, server: { s: r.subtotal, d: r.discount, g: r.gst, t: r.total } })); }
}
console.log(`${n - fails}/${n} random bills: client preview == database totals`);
process.exit(fails ? 1 : 0);
