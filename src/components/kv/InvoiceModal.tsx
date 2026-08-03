import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Printer, MessageCircle, Send, Link as LinkIcon } from "lucide-react";
import {
  downloadInvoicePdf,
  invoicePublicUrl,
  smsHref,
  type InvoiceData,
  type InvoiceLine,
} from "@/lib/kv/invoice";
import { sendWhatsApp, isWhatsAppApiConfigured } from "@/lib/kv/whatsapp";
import { useBusinessSettings, DEFAULT_BUSINESS } from "@/lib/kv/businessSettings";
import { toast } from "sonner";

const rupee = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

export function InvoiceModal({
  invoice,
  onClose,
}: {
  invoice: InvoiceData | null;
  onClose: () => void;
}) {
  const { data: business = DEFAULT_BUSINESS } = useBusinessSettings();
  if (!invoice) return null;

  const sendSMS = () => {
    const a = document.createElement("a");
    a.href = smsHref(invoice, business);
    a.rel = "noopener";
    a.click();
    toast.success(`SMS drafted for ${invoice.customerMobile}`);
  };

  const sendWhatsapp = async () => {
    const url =
      invoice.publicUrl ??
      (invoice.publicToken ? invoicePublicUrl(invoice.publicToken) : "");
    const res = await sendWhatsApp({
      customerName: invoice.customerName,
      customerMobile: invoice.customerMobile,
      invoiceNumber: invoice.invoiceNumber,
      invoiceUrl: url,
      pdfUrl: null,
      businessName: business.business_name,
      countryCode: business.default_country_code,
      footer: business.invoice_footer,
    });
    if (!res.ok) {
      toast.error("WhatsApp send failed", { description: res.error });
      return;
    }
    toast.success(
      res.via === "api" ? "WhatsApp message sent" : "WhatsApp opened",
      {
        description: isWhatsAppApiConfigured()
          ? undefined
          : "Configure VITE_WHATSAPP_API_URL and VITE_WHATSAPP_API_TOKEN to send automatically.",
      },
    );
  };

  const publicUrl = invoice.publicUrl ?? (invoice.publicToken ? invoicePublicUrl(invoice.publicToken) : null);
  const copyLink = () => {
    if (!publicUrl) return;
    navigator.clipboard?.writeText(publicUrl);
    toast.success("Invoice link copied", { description: publicUrl });
  };

  const items: InvoiceLine[] = invoice.items && invoice.items.length
    ? invoice.items
    : [
        {
          productName: invoice.productName,
          size: invoice.size,
          quantity: invoice.quantity,
          unitPrice: invoice.unitPrice,
          discount: invoice.discount,
          lineTotal: invoice.total,
        },
      ];

  return (
    <>
      <Dialog open={!!invoice} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-lg border-border bg-card p-0">
          <div className="p-5">
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div>
                <div className="flex items-center gap-2">
                  {business.business_logo_url ? (
                    <img
                      src={business.business_logo_url}
                      alt=""
                      className="h-6 w-6 rounded object-cover"
                    />
                  ) : null}
                  <div className="text-base font-bold tracking-[0.2em]">
                    {(business.business_name || "").toUpperCase()}
                  </div>
                </div>
                <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Retail Invoice
                </p>
                {business.gst_number ? (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    GSTIN {business.gst_number}
                  </p>
                ) : null}
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Invoice</p>
                <p className="mt-0.5 font-mono text-xs">{invoice.invoiceNumber}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {new Date(invoice.createdAt).toLocaleString("en-IN")}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Billed to</p>
                <p className="mt-1 font-medium">{invoice.customerName}</p>
                <p className="text-xs text-muted-foreground">{invoice.customerMobile}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Payment</p>
                <p className="mt-1 font-medium">{invoice.paymentMethod}</p>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Product</th>
                    <th className="p-2">Size</th>
                    <th className="p-2">Qty</th>
                    <th className="p-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} className="border-t border-border text-sm">
                      <td className="p-2">{it.productName}</td>
                      <td className="p-2 text-center">{it.size}</td>
                      <td className="p-2 text-center">{it.quantity}</td>
                      <td className="p-2 text-right font-money">{rupee(it.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-end justify-between">
              <p className="text-xs text-muted-foreground">
                {items.length} item{items.length !== 1 ? "s" : ""}
              </p>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p>
                <p className="font-money mt-0.5 text-2xl font-semibold">{rupee(invoice.total)}</p>
              </div>
            </div>

            {publicUrl && (
              <button
                onClick={copyLink}
                className="mt-4 flex w-full items-center justify-between gap-2 rounded-md border border-border bg-secondary/30 px-3 py-2 text-left text-xs hover:bg-secondary/60"
              >
                <span className="text-muted-foreground">
                  <LinkIcon className="mr-2 inline h-3.5 w-3.5" /> Public invoice link
                </span>
                <span className="font-mono truncate max-w-[60%]">{publicUrl}</span>
              </button>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Button
                onClick={() => downloadInvoicePdf(invoice, business)}
                className="h-9 text-xs"
              >
                <Download className="mr-1.5 h-3.5 w-3.5" /> PDF
              </Button>
              <Button
                onClick={() => window.print()}
                variant="outline"
                className="h-9 text-xs"
              >
                <Printer className="mr-1.5 h-3.5 w-3.5" /> Print
              </Button>
              <Button
                onClick={sendWhatsapp}
                variant="outline"
                className="h-9 text-xs"
              >
                <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> WhatsApp
              </Button>
              <Button
                onClick={sendSMS}
                variant="outline"
                className="h-9 text-xs"
              >
                <Send className="mr-1.5 h-3.5 w-3.5" /> SMS
              </Button>
            </div>

            {(business.invoice_footer || business.address) && (
              <p className="mt-4 whitespace-pre-wrap text-center text-[11px] text-muted-foreground">
                {business.invoice_footer || `Thank you for shopping at ${business.business_name}.`}
                {business.address ? `\n${business.address}` : ""}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Print layout */}
      <div className="invoice-print">
        <h1 style={{ fontFamily: "Inter, sans-serif", color: "#1E1E1E", letterSpacing: "0.15em" }}>
          {(business.business_name || "").toUpperCase()}
        </h1>
        <p style={{ marginTop: 4, color: "#555" }}>Retail Invoice</p>
        {business.gst_number ? (
          <p style={{ marginTop: 2, color: "#555" }}>GSTIN: {business.gst_number}</p>
        ) : null}
        <hr style={{ margin: "20px 0", borderColor: "#ccc" }} />
        <p><strong>Invoice:</strong> {invoice.invoiceNumber}</p>
        <p><strong>Date:</strong> {new Date(invoice.createdAt).toLocaleString("en-IN")}</p>
        <p><strong>Customer:</strong> {invoice.customerName} ({invoice.customerMobile})</p>
        <table style={{ width: "100%", marginTop: 24, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#efefef" }}>
              <th style={{ padding: 8, textAlign: "left", border: "1px solid #ddd" }}>Product</th>
              <th style={{ padding: 8, border: "1px solid #ddd" }}>Size</th>
              <th style={{ padding: 8, border: "1px solid #ddd" }}>Qty</th>
              <th style={{ padding: 8, border: "1px solid #ddd" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td style={{ padding: 8, border: "1px solid #ddd" }}>{it.productName}</td>
                <td style={{ padding: 8, textAlign: "center", border: "1px solid #ddd" }}>{it.size}</td>
                <td style={{ padding: 8, textAlign: "center", border: "1px solid #ddd" }}>{it.quantity}</td>
                <td style={{ padding: 8, textAlign: "right", border: "1px solid #ddd" }}>{rupee(it.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2 style={{ marginTop: 24, textAlign: "right" }}>Total: {rupee(invoice.total)}</h2>
        <p style={{ marginTop: 8, textAlign: "right" }}>Payment: {invoice.paymentMethod}</p>
        <p style={{ marginTop: 40, fontStyle: "italic", textAlign: "center" }}>
          {business.invoice_footer || `Thank you for shopping at ${business.business_name}.`}
        </p>
        {business.address ? (
          <p style={{ marginTop: 4, textAlign: "center", color: "#555" }}>{business.address}</p>
        ) : null}
        {business.upi_id ? (
          <p style={{ marginTop: 4, textAlign: "center", color: "#555" }}>UPI: {business.upi_id}</p>
        ) : null}
      </div>
    </>
  );
}