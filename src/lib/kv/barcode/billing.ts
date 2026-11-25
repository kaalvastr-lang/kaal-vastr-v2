/**
 * Preview maths for the Scan Billing cart. The DATABASE (kv_complete_sale) recomputes everything
 * with the same rules and its numbers are the ones saved on the invoice; this only keeps the
 * screen total in step with what the server will charge.
 *
 *  - discount: percent of subtotal or a flat amount, rounded to whole rupees, capped at subtotal
 *  - the discount is shared across lines in proportion to line value (last line takes the remainder)
 *  - GST is calculated per line on the discounted amount, rounded to whole rupees
 */

export interface PreviewLine {
  price: number;
  qty: number;
  gstPct: number;
}

export interface PreviewTotals {
  subtotal: number;
  discount: number;
  gst: number;
  total: number;
  lineDiscounts: number[];
}

export function previewTotals(
  lines: PreviewLine[],
  type: "percent" | "amount",
  value: number,
): PreviewTotals {
  const subtotal = lines.reduce((a, l) => a + l.price * l.qty, 0);
  const v = Number.isFinite(value) && value > 0 ? value : 0;
  const raw = type === "percent" ? Math.round((subtotal * Math.min(v, 100)) / 100) : Math.round(v);
  const discount = Math.max(0, Math.min(subtotal, raw));

  let allocated = 0;
  let gst = 0;
  let total = 0;
  let appliedSum = 0;
  const lineDiscounts: number[] = [];
  lines.forEach((l, i) => {
    const lineSub = l.price * l.qty;
    let d =
      i === lines.length - 1
        ? discount - allocated
        : subtotal > 0
          ? Math.round((lineSub / subtotal) * discount)
          : 0;
    d = Math.max(0, Math.min(lineSub, d));
    allocated += d;
    appliedSum += d;
    const taxable = Math.max(0, lineSub - d);
    const g = Math.round((taxable * l.gstPct) / 100);
    gst += g;
    total += taxable + g;
    lineDiscounts.push(d);
  });
  return { subtotal, discount: appliedSum, gst, total, lineDiscounts };
}
