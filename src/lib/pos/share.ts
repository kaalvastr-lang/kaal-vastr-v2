import type { Invoice } from "@/lib/pos/types";
import { invoicePublicUrl } from "@/lib/kv/invoice";

/**
 * WhatsApp deep link for a generated bill.
 * The message deliberately carries ONLY the public invoice URL — the customer
 * views, prints or downloads the PDF from that page.
 */
export function waLinkForInvoice(invoice: Invoice, businessName = "Kaal Vastr", countryCode = "91") {
  const digits = (invoice.customerPhone ?? "").replace(/\D/g, "");
  const mobile = digits.length === 10 ? `${countryCode}${digits}` : digits;
  const url = invoicePublicUrl(invoice.publicToken);
  const message = [
    `Hello ${invoice.customerName},`,
    ``,
    `Thank you for shopping at *${businessName}*.`,
    `Invoice No: *${invoice.invoiceNo}*`,
    ``,
    `View / print / download your invoice:`,
    url,
  ].join("\n");
  return `https://wa.me/${mobile}?text=${encodeURIComponent(message)}`;
}