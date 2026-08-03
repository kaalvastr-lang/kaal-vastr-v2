import type { Invoice } from "./types";
import type { Business } from "@/services/business";

export const formatINR = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export const isToday = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
};

/** Public, login-free invoice page for a bill. */
export function publicInvoiceUrl(token: string) {
  const origin =
    typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
  return `${origin}/invoice/${token}`;
}

/** Short, professional WhatsApp message — link only, never the full bill as text. */
export function buildWhatsAppMessage(invoice: Invoice, businessName: string) {
  return [
    `Hello ${invoice.customerName},`,
    "",
    `Thank you for shopping at ${businessName}.`,
    "",
    `Invoice No: ${invoice.invoiceNo}`,
    "",
    "Your invoice is ready.",
    "",
    "View Invoice:",
    publicInvoiceUrl(invoice.publicToken),
    "",
    "You can view, download or print your invoice anytime using the above link.",
    "",
    `Thank you for choosing ${businessName}.`,
  ].join("\n");
}

export function whatsAppUrl(invoice: Invoice, business: Pick<Business, "business_name" | "default_country_code">) {
  const cc = (business.default_country_code || "91").replace(/\D/g, "");
  const digits = invoice.customerPhone.replace(/\D/g, "");
  const phone = digits.length === 10 ? `${cc}${digits}` : digits;
  const text = encodeURIComponent(buildWhatsAppMessage(invoice, business.business_name));
  return phone.length >= 10 ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
}

export function printInvoice() {
  if (typeof window !== "undefined") window.print();
}
