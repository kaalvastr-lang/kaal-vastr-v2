import { JSDOM } from "jsdom";
const dom = new JSDOM(`<body><input id="name" value="Asha"><input id="scan" data-scan-input><div id="plain" tabindex="0"></div></body>`, { pretendToBeVisual: true });
const w = dom.window;
globalThis.window = w; globalThis.document = w.document;
globalThis.HTMLInputElement = w.HTMLInputElement; globalThis.HTMLTextAreaElement = w.HTMLTextAreaElement; globalThis.Event = w.Event;
const { KeyboardWedgeScanner, normalizeBarcode } = await import("./out/scanner.js");
const { DEFAULT_SCANNER_SETTINGS } = await import("./out/settings.js");

let t = 0; const clock = () => t;
let settings = { ...DEFAULT_SCANNER_SETTINGS, scanTimeoutMs: 30 };
const scans = [], ignored = [];
const sc = new KeyboardWedgeScanner({ target: w, clock });
sc.start({ onScan: e => scans.push(e), onIgnored: i => ignored.push(i) }, () => settings);

function key(el, k, gap = 5) {
  t += gap;
  const ev = new w.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  if (!ev.defaultPrevented && k.length === 1 && "value" in el) el.value += k; // browser would type it
  return ev;
}
function burst(el, text, suffix, gap = 5) { for (const c of text) key(el, c, gap); return suffix ? key(el, suffix, gap) : null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, extra="") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", name, extra); };
const $ = id => w.document.getElementById(id);
const reset = () => { scans.length = 0; ignored.length = 0; t += 1000; $("scan").value = ""; $("name").value = "Asha"; settings = { ...DEFAULT_SCANNER_SETTINGS, scanTimeoutMs: 30 }; };

// 1. non-field target + Enter
reset(); let ev = burst($("plain"), "KV000001", "Enter");
check("burst on non-field ends on Enter", scans.length === 1 && scans[0].code === "KV000001" && scans[0].terminator === "enter" && ev.defaultPrevented);

// 2. scan box, no suffix -> idle completion; input cleaned
reset(); burst($("scan"), "kv000002", null); await sleep(70);
check("scan box w/o suffix completes on silence, upper-cased, input cleared", scans.length === 1 && scans[0].code === "KV000002" && scans[0].terminator === "idle" && $("scan").value === "", JSON.stringify(scans.map(s=>s.code)));

// 3. plain text field + Enter -> scan, field restored, Enter swallowed
reset(); ev = burst($("name"), "KV000003", "Enter");
check("scan inside text field restores field & swallows Enter", scans.length === 1 && $("name").value === "Asha" && ev.defaultPrevented, `value=${$("name").value}`);

// 4. plain text field without Enter -> nothing (fast typing of digits must not become a scan)
reset(); burst($("name"), "9876543210", null); await sleep(70);
check("fast typing in text field with no suffix is NOT a scan", scans.length === 0 && $("name").value === "Asha9876543210");

// 5. slow human typing + Enter -> normal Enter
reset(); ev = burst($("scan"), "KV000004", "Enter", 200);
check("slow typing is not a scan; Enter passes through", scans.length === 0 && !ev.defaultPrevented);

// 6. same code twice
reset(); burst($("plain"), "KV000001", "Enter"); burst($("plain"), "KV000001", "Enter");
check("repeat scans of same code both delivered with distinct ids", scans.length === 2 && scans[0].id !== scans[1].id);

// 7. too short
reset(); burst($("plain"), "AB", "Enter");
check("short input ignored", scans.length === 0);

// 8. dedicated mode
reset(); settings.inputMode = "dedicated"; burst($("plain"), "KV000005", "Enter");
check("dedicated mode ignores bursts outside scan box", scans.length === 0);
burst($("scan"), "KV000005", "Enter");
check("dedicated mode accepts scan box", scans.length === 1);

// 9. tab suffix (enabled) in text field
reset(); settings.enterSuffix = false; settings.tabSuffix = true; ev = burst($("name"), "KV000006", "Tab");
check("Tab suffix ends scan in text field", scans.length === 1 && ev.defaultPrevented && $("name").value === "Asha");

// 10. tolerant: scanner sends Enter though toggle off, in scan box
reset(); settings.enterSuffix = false; ev = burst($("scan"), "KV000007", "Enter");
check("unexpected Enter after burst in scan box still completes once (no leak)", scans.length === 1 && ev.defaultPrevented);
await sleep(70); check("…and idle timer does not fire a duplicate", scans.length === 1);

// 11. modifier keys (Shift) inside burst don't break it
reset(); for (const c of "KV") { key($("plain"), "Shift"); key($("plain"), c); } burst($("plain"), "000008", "Enter");
check("Shift key events inside burst tolerated", scans.length === 1 && scans[0].code === "KV000008");

// 12. ctrl shortcuts reset
reset(); key($("plain"), "K"); const ce = new w.KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true, cancelable: true }); $("plain").dispatchEvent(ce);
burst($("plain"), "V0", "Enter");
check("Ctrl combos reset buffer", scans.length === 0);

// 13. stop() removes listener
sc.stop(); reset(); burst($("plain"), "KV000009", "Enter");
check("no events after stop()", scans.length === 0);
console.log("normalize:", normalizeBarcode(" kv00\u0000001\r\n "));
process.exit(fails ? 1 : 0);
