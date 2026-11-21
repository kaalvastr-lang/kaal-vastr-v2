import JsBarcode from "jsbarcode";
import { code128BModules, code128BWidthModules, isCode128B } from "./out/code128.js";
let fails = 0;
const samples = ["KV000001","KV000002","KV999999","KV-TEST-0001","ABC abc 123 ~!@#","0123456789","Hello, World!","a","KV1234567890ABC"];
for (const s of samples) {
  const obj = {};
  JsBarcode(obj, s, { format: "CODE128B" });
  const ref = obj.encodings[0].data;
  const mine = code128BModules(s).map((w,i)=> (i%2===0?"1":"0").repeat(w)).join("");
  const ok = ref === mine;
  if (!ok) fails++;
  console.log(ok ? "OK  " : "FAIL", JSON.stringify(s), "modules", code128BWidthModules(s));
}
console.log("isCode128B('é') =", isCode128B("é"), " isCode128B('KV1') =", isCode128B("KV1"));
// every one of the 107 patterns must sum to 11 (13 for stop) — structural check
const { CODE128_PATTERNS } = await import("./out/code128.js");
const bad = CODE128_PATTERNS.map((p,i)=>[i,[...p].reduce((a,c)=>a+Number(c),0)]).filter(([i,sum])=>sum!==(i===106?13:11));
console.log("pattern sum errors:", bad.length, "unique:", new Set(CODE128_PATTERNS).size);
process.exit(fails || bad.length ? 1 : 0);
