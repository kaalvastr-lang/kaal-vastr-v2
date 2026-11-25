import { encodePayments, decodePayments, validateSplit } from "./out/payments.js";
import { computeMetrics } from "./out/analytics.js";
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", name, extra); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

check("encode single", encodePayments([{ method: "UPI", amount: 800 }]) === "UPI");
check("encode split == database text", encodePayments([{ method: "Cash", amount: 500 }, { method: "UPI", amount: 549 }]) === "Cash 500 + UPI 549");
check("encode 3-way == database text", encodePayments([{ method: "Cash", amount: 500 }, { method: "UPI", amount: 500 }, { method: "Card", amount: 888 }]) === "Cash 500 + UPI 500 + Card 888");
check("encode decimals", encodePayments([{ method: "Cash", amount: 250.5 }, { method: "Card", amount: 100 }]) === "Cash 250.5 + Card 100");
check("decode plain", eq(decodePayments("cash", 900), [{ method: "Cash", amount: 900 }]));
check("decode split", eq(decodePayments("Cash 500 + UPI 300", 800), [{ method: "Cash", amount: 500 }, { method: "UPI", amount: 300 }]));
check("decode unknown -> []", eq(decodePayments("Cheque", 100), []) && eq(decodePayments("", 100), []) && eq(decodePayments("Cash x + UPI 1", 1), []));
check("validate ok", validateSplit([{ method: "Cash", amount: 400 }, { method: "UPI", amount: 400 }], 800) === null);
check("validate mismatch", /add up/.test(validateSplit([{ method: "Cash", amount: 400 }, { method: "UPI", amount: 300 }], 800) ?? ""));
check("validate same method", /different/.test(validateSplit([{ method: "Cash", amount: 400 }, { method: "Cash", amount: 400 }], 800) ?? ""));
check("validate zero part", /more than 0/.test(validateSplit([{ method: "Cash", amount: 0 }, { method: "UPI", amount: 800 }], 800) ?? ""));

const row = (inv, total, pm, extra = {}) => ({ invoice_number: inv, total_amount: total, profit: 1, quantity: 1, payment_method: pm, is_returned: false, created_at: "2026-11-22", ...extra });
// legacy behaviour unchanged
let m = computeMetrics([row("A", 100, "Cash"), row("B", 200, "UPI"), row("C", 300, "Card")]);
check("legacy single-method totals unchanged", m.cashSales === 100 && m.upiSales === 200 && m.cardSales === 300 && m.totalSales === 600);
// split bill across two lines: 600 + 200 = 800, paid Cash 500 + UPI 300
m = computeMetrics([row("S", 600, "Cash 500 + UPI 300"), row("S", 200, "Cash 500 + UPI 300")]);
check("split bill: cash 500 / upi 300", Math.abs(m.cashSales - 500) < 1e-9 && Math.abs(m.upiSales - 300) < 1e-9 && m.billsGenerated === 1, JSON.stringify([m.cashSales, m.upiSales]));
// mixed + returned line excluded + method buckets add up to total
m = computeMetrics([row("S", 600, "Cash 500 + UPI 300"), row("S", 200, "Cash 500 + UPI 300"), row("T", 1000, "Cash"), row("U", 400, "Card 100 + UPI 300", { is_returned: true })]);
check("mixed: buckets sum to total sales, returned excluded", Math.abs(m.cashSales + m.upiSales + m.cardSales - m.totalSales) < 1e-9 && m.totalSales === 1800, JSON.stringify([m.cashSales, m.upiSales, m.cardSales, m.totalSales]));
process.exit(fails ? 1 : 0);
