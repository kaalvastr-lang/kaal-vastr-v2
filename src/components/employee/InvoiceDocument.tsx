import { formatDateTime, formatINR } from "@/lib/pos/invoice";
import type { Invoice } from "@/lib/pos/types";
import { DEFAULT_BUSINESS, type Business } from "@/services/business";

/**
 * Premium retail invoice — mirrors the Owner Dashboard invoice design.
 * Pure presentation: it renders whatever `Invoice` it is handed.
 */
export function InvoiceDocument({
  invoice,
  business = DEFAULT_BUSINESS,
}: {
  invoice: Invoice;
  business?: Business;
}) {
  const name = business.business_name || DEFAULT_BUSINESS.business_name;
  const monogram = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="print-sheet mx-auto w-full max-w-xl rounded-2xl border border-border bg-card p-6 sm:p-8">
      <header className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-border bg-secondary">
          <span className="font-display text-lg font-bold tracking-[0.15em]">{monogram}</span>
        </div>
        <h2 className="mt-4 font-display text-2xl font-bold tracking-[0.35em] text-foreground sm:text-3xl">
          {name.toUpperCase()}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">Retail Invoice</p>
        {business.address ? (
          <p className="mt-1 text-xs text-muted-foreground">{business.address}</p>
        ) : null}
        {business.gst_number ? (
          <p className="mt-1 text-xs text-muted-foreground">GSTIN: {business.gst_number}</p>
        ) : null}
      </header>

      <div className="my-6 border-t border-dashed border-border" />

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Invoice</p>
          <p className="mt-1 font-mono text-sm font-semibold tracking-tight">{invoice.invoiceNo}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Date</p>
          <p className="mt-1 text-sm font-semibold">{formatDateTime(invoice.createdAt)}</p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-border p-4">
        <p className="text-[11px] tracking-[0.2em] text-muted-foreground uppercase">Billed to</p>
        <p className="mt-1 truncate font-semibold">{invoice.customerName}</p>
        {invoice.customerPhone ? (
          <p className="text-sm text-muted-foreground">{invoice.customerPhone}</p>
        ) : null}
      </div>

      <div className="mt-6 flex items-center justify-between text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
        <span>Item</span>
        <span>Amount</span>
      </div>
      <div className="mt-3 space-y-4">
        {invoice.items.map((item, i) => (
          <div key={`${item.productId ?? item.name}-${i}`} className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-semibold">
                {item.name} — {item.size}
              </p>
              {[item.color, item.category].filter(Boolean).length ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[item.color, item.category].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              <p className="mt-1 text-sm text-muted-foreground">
                {item.quantity} × {formatINR(item.price)}
              </p>
            </div>
            <p className="shrink-0 font-semibold">{formatINR(item.lineTotal)}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-border">
        <div className="flex items-center justify-between p-4">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="text-muted-foreground">{formatINR(invoice.subtotal)}</span>
        </div>
        {invoice.discountAmount > 0 ? (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <span className="text-muted-foreground">Discount</span>
            <span className="text-muted-foreground">- {formatINR(invoice.discountAmount)}</span>
          </div>
        ) : null}
        {invoice.gstAmount > 0 ? (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <span className="text-muted-foreground">GST</span>
            <span className="text-muted-foreground">{formatINR(invoice.gstAmount)}</span>
          </div>
        ) : null}
        <div className="flex items-center justify-between border-t border-border p-4">
          <span className="font-display text-lg font-bold">Grand Total</span>
          <span className="font-display text-2xl font-bold">{formatINR(invoice.total)}</span>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-border p-4">
        <div>
          <p className="text-[11px] tracking-[0.2em] text-muted-foreground uppercase">Payment</p>
          <p className="mt-1 font-semibold">{invoice.paymentMode}</p>
        </div>
        <div className="text-right">
          <QrGlyph seed={invoice.invoiceNo} />
          <p className="mt-1 text-[11px] tracking-[0.2em] text-muted-foreground uppercase">Scan</p>
        </div>
      </div>

      <div className="my-6 border-t border-dashed border-border" />

      <p className="text-center text-sm text-muted-foreground">
        {business.invoice_footer?.trim() || `Thank you for shopping at ${name}.`}
      </p>
    </div>
  );
}

/** Deterministic decorative glyph rendered from the invoice number. */
function QrGlyph({ seed }: { seed: string }) {
  const cells = Array.from({ length: 49 }, (_, i) => {
    const code = seed.charCodeAt(i % seed.length) + i * 7;
    return code % 3 !== 0;
  });
  return (
    <div className="ml-auto grid h-16 w-16 grid-cols-7 gap-px rounded bg-white p-1">
      {cells.map((on, i) => (
        <span key={i} className={on ? "bg-black" : "bg-white"} />
      ))}
    </div>
  );
}
