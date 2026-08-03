import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, MessageCircle, Printer, Share2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  downloadInvoicePdf,
  invoicePublicUrl,
  whatsappLink,
  type InvoiceData,
  type InvoiceLine,
} from "@/lib/kv/invoice";

export const Route = createFileRoute("/invoice/$token")({
  head: () => ({
    meta: [
      { title: "Invoice — Kaal Vastr" },
      { name: "description", content: "Your Kaal Vastr invoice." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PublicInvoicePage,
});

const rupee = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

function PublicInvoicePage() {
  const { token } = Route.useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-invoice", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_invoice_by_token", { _token: token });
      if (error) throw error;
      const rows = Array.isArray(data) ? data : data ? [data] : [];
      if (!rows.length) throw new Error("Invoice not found");
      return rows as Array<{
        invoice_number: string;
        created_at: string;
        customer_name: string;
        customer_mobile: string;
        product_name: string;
        variant: string | null;
        size: string;
        quantity: number;
        unit_price: number;
        discount: number;
        total_amount: number;
        payment_method: string;
        payment_status: string;
        public_token: string;
      }>;
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading invoice…</div>
      </div>
    );
  }

  if (error || !data || !data.length) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <div className="max-w-md rounded-xl border border-border bg-card p-8">
          <div className="text-lg font-semibold tracking-wide">KAAL VASTR</div>
          <p className="mt-4 text-sm text-muted-foreground">
            This invoice link is invalid or has expired.
          </p>
        </div>
      </div>
    );
  }

  const first = data[0];
  const items: InvoiceLine[] = data.map((r) => ({
    productName: r.product_name,
    variant: r.variant ?? null,
    size: r.size,
    quantity: r.quantity,
    unitPrice: Number(r.unit_price),
    discount: Number(r.discount),
    lineTotal: Number(r.total_amount),
  }));
  const subtotal = items.reduce((a, i) => a + i.unitPrice * i.quantity, 0);
  const discount = items.reduce((a, i) => a + i.discount, 0);
  const total = items.reduce((a, i) => a + i.lineTotal, 0);
  const gstAmount = Math.max(0, total - (subtotal - discount));

  const invoice: InvoiceData = {
    invoiceNumber: first.invoice_number,
    createdAt: first.created_at,
    customerName: first.customer_name,
    customerMobile: first.customer_mobile,
    items,
    productName: first.product_name,
    size: first.size,
    quantity: first.quantity,
    unitPrice: Number(first.unit_price),
    discount,
    subtotal,
    gstAmount,
    total,
    paymentMethod: first.payment_method,
    publicToken: first.public_token,
    publicUrl: invoicePublicUrl(first.public_token),
  };

  const share = async () => {
    const url = invoice.publicUrl!;
    const shareData = {
      title: `Kaal Vastr Invoice ${invoice.invoiceNumber}`,
      text: `Your Kaal Vastr invoice ${invoice.invoiceNumber}`,
      url,
    };
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        /* fallthrough to copy */
      }
    }
    navigator.clipboard?.writeText(url);
    toast.success("Invoice link copied");
  };

  return (
    <div className="min-h-screen bg-background pb-24 pt-4 print:bg-white print:pb-0 print:pt-0">
      <div className="mx-auto w-full max-w-md px-4 sm:max-w-lg print:max-w-none print:px-8">
        <div className="rounded-lg border border-border bg-card p-5 text-foreground shadow-sm print:border-0 print:bg-white print:text-black print:shadow-none">
          {/* Store header */}
          <div className="border-b border-dashed border-border pb-4 text-center print:border-black/20">
            <h1 className="text-lg font-bold tracking-[0.2em]">KAAL VASTR</h1>
            <p className="mt-0.5 text-[11px] text-muted-foreground print:text-black/60">
              Retail Invoice
            </p>
          </div>

          {/* Invoice meta */}
          <div className="mt-3 flex flex-wrap justify-between gap-2 text-[12px]">
            <div>
              <p className="text-muted-foreground print:text-black/60">Invoice</p>
              <p className="font-mono font-medium">{invoice.invoiceNumber}</p>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground print:text-black/60">Date</p>
              <p className="font-medium">
                {new Date(invoice.createdAt).toLocaleString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>

          {/* Customer */}
          <div className="mt-3 rounded-md border border-border bg-secondary/30 p-3 text-[12px] print:border-black/20 print:bg-transparent">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground print:text-black/60">
              Billed To
            </p>
            <p className="mt-0.5 font-medium">{invoice.customerName}</p>
            <p className="text-muted-foreground print:text-black/60">{invoice.customerMobile}</p>
          </div>

          {/* Items — stacked for mobile */}
          <div className="mt-4 divide-y divide-dashed divide-border print:divide-black/20">
            <div className="grid grid-cols-[1fr_auto] gap-2 pb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground print:text-black/60">
              <span>Item</span>
              <span className="text-right">Amount</span>
            </div>
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] gap-2 py-2 text-[13px]">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {it.productName}
                    {it.variant ? ` - ${it.variant}` : ""}
                    {it.size ? ` - ${it.size}` : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground print:text-black/60">
                    {it.quantity} × {rupee(it.unitPrice)}
                    {it.discount > 0 && (
                      <span className="ml-1">· − {rupee(it.discount)}</span>
                    )}
                  </p>
                </div>
                <p className="text-right font-money font-medium">{rupee(it.lineTotal)}</p>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="mt-3 space-y-1 rounded-md border border-border bg-secondary/30 p-3 text-[13px] print:border-black/20 print:bg-transparent">
            <div className="flex justify-between text-muted-foreground print:text-black/60">
              <span>Subtotal</span>
              <span className="font-money">{rupee(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-muted-foreground print:text-black/60">
                <span>Discount</span>
                <span className="font-money">− {rupee(discount)}</span>
              </div>
            )}
            {gstAmount > 0 && (
              <div className="flex justify-between text-muted-foreground print:text-black/60">
                <span>GST</span>
                <span className="font-money">+ {rupee(gstAmount)}</span>
              </div>
            )}
            <div className="mt-2 flex items-center justify-between border-t border-border pt-2 print:border-black/30">
              <span className="text-sm font-semibold">Grand Total</span>
              <span className="font-money text-xl font-bold">{rupee(total)}</span>
            </div>
          </div>

          {/* Payment + QR */}
          <div className="mt-3 flex items-center justify-between rounded-md border border-border bg-secondary/30 p-3 text-[12px] print:border-black/20 print:bg-transparent">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground print:text-black/60">
                Payment
              </p>
              <p className="mt-0.5 font-medium">{invoice.paymentMethod}</p>
            </div>
            <div className="flex flex-col items-end">
              <div className="grid h-16 w-16 grid-cols-6 grid-rows-6 gap-[2px] rounded border border-border bg-white p-1">
                {Array.from({ length: 36 }).map((_, i) => (
                  <div
                    key={i}
                    className={((i * 7 + invoice.invoiceNumber.length) % 3 === 0) ? "bg-black" : "bg-white"}
                  />
                ))}
              </div>
              <p className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground print:text-black/60">
                Scan
              </p>
            </div>
          </div>

          <p className="mt-4 border-t border-dashed border-border pt-3 text-center text-[11px] text-muted-foreground print:border-black/20 print:text-black/60">
            Thank you for shopping at Kaal Vastr.
          </p>
        </div>

        {/* Sticky action bar on mobile */}
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card/95 p-3 backdrop-blur sm:static sm:mt-4 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-0 print:hidden">
          <div className="mx-auto grid max-w-md grid-cols-4 gap-2 sm:max-w-lg">
            <Button
              onClick={() => downloadInvoicePdf(invoice)}
              className="h-10 text-xs font-medium"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" /> PDF
            </Button>
            <Button
              onClick={() => window.print()}
              variant="outline"
              className="h-10 text-xs"
            >
              <Printer className="mr-1.5 h-3.5 w-3.5" /> Print
            </Button>
            <Button
              onClick={share}
              variant="outline"
              className="h-10 text-xs"
            >
              <Share2 className="mr-1.5 h-3.5 w-3.5" /> Share
            </Button>
            {/* Sends only the public invoice link over WhatsApp. */}
            <Button
              onClick={() => window.open(whatsappLink(invoice), "_blank")}
              variant="outline"
              className="h-10 text-xs"
            >
              <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> WhatsApp
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}