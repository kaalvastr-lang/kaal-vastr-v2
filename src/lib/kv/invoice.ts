import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { buildMessage, toWaMeUrl, type WhatsAppRequest } from "./whatsapp";
import { DEFAULT_BUSINESS, type BusinessSettings } from "./businessSettings";

export type InvoiceLine = {
  productName: string;
  variant?: string | null;
  size: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  gstPct?: number;
  lineTotal: number;
};

export type InvoiceData = {
  invoiceNumber: string;
  createdAt: string;
  customerName: string;
  customerMobile: string;
  items: InvoiceLine[];
  /** legacy single-item convenience fields (first line) */
  productName: string;
  size: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  subtotal?: number;
  gstAmount?: number;
  paymentMethod: string;
  publicToken?: string;
  publicUrl?: string;
};

const rupee = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

export function generateInvoiceNumber() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate(),
  ).padStart(2, "0")}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `KV-${stamp}-${rand}`;
}

// 10-char URL-safe token. Uses crypto.getRandomValues for security.
export function generatePublicToken(len = 10) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing chars
  const bytes = new Uint8Array(len);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export function invoicePublicUrl(token: string) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/invoice/${token}`;
}

export function downloadInvoicePdf(inv: InvoiceData, business: BusinessSettings = DEFAULT_BUSINESS) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const w = doc.internal.pageSize.getWidth();

  doc.setFillColor(30, 30, 30);
  doc.rect(0, 0, w, 90, "F");

  doc.setTextColor(245, 245, 245);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text((business.business_name || "").toUpperCase() || "INVOICE", 40, 45);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(190, 190, 190);
  doc.text("Retail Invoice", 40, 62);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(245, 245, 245);
  doc.text(inv.invoiceNumber, w - 40, 45, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(190, 190, 190);
  doc.text(new Date(inv.createdAt).toLocaleString("en-IN"), w - 40, 62, { align: "right" });

  doc.setTextColor(30, 30, 30);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("BILLED TO", 40, 125);
  doc.setFont("helvetica", "normal");
  doc.text(inv.customerName, 40, 142);
  doc.text(inv.customerMobile, 40, 156);
  doc.setFont("helvetica", "bold");
  doc.text("PAYMENT", w - 40, 125, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.text(inv.paymentMethod, w - 40, 142, { align: "right" });
  if (business.gst_number) {
    doc.setFont("helvetica", "bold");
    doc.text("GSTIN", w - 40, 156, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.text(business.gst_number, w - 40, 170, { align: "right" });
  }

  const rows = (inv.items && inv.items.length
    ? inv.items
    : [
        {
          productName: inv.productName,
          size: inv.size,
          quantity: inv.quantity,
          unitPrice: inv.unitPrice,
          discount: inv.discount,
          lineTotal: inv.total,
        } as InvoiceLine,
      ]).map((l) => [
    [l.productName, l.variant, l.size].filter(Boolean).join(" - "),
    String(l.quantity),
    rupee(l.unitPrice),
    rupee(l.discount),
    rupee(l.lineTotal),
  ]);

  autoTable(doc, {
    startY: 180,
    head: [["Item", "Qty", "Unit", "Discount", "Amount"]],
    body: rows,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 6, textColor: [40, 40, 40] },
    headStyles: { fillColor: [42, 42, 42], textColor: [245, 245, 245], fontStyle: "bold" },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text("TOTAL", w - 160, finalY);
  doc.setFontSize(14);
  doc.text(rupee(inv.total), w - 40, finalY, { align: "right" });

  doc.setTextColor(120, 120, 120);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const footer =
    business.invoice_footer?.trim() ||
    `Thank you for shopping at ${business.business_name}.`;
  doc.text(footer, 40, finalY + 48);
  if (business.address) {
    doc.text(business.address, 40, finalY + 62);
  }
  if (business.upi_id) {
    doc.text(`UPI: ${business.upi_id}`, 40, finalY + 76);
  }

  doc.save(`${inv.invoiceNumber}.pdf`);
}

function toWhatsAppRequest(inv: InvoiceData, business: BusinessSettings): WhatsAppRequest {
  const url = inv.publicUrl ?? (inv.publicToken ? invoicePublicUrl(inv.publicToken) : "");
  return {
    customerName: inv.customerName,
    customerMobile: inv.customerMobile,
    invoiceNumber: inv.invoiceNumber,
    invoiceUrl: url,
    pdfUrl: null,
    businessName: business.business_name || "Our Store",
    countryCode: business.default_country_code || "91",
    footer: business.invoice_footer,
  };
}

export function whatsappLink(inv: InvoiceData, business: BusinessSettings = DEFAULT_BUSINESS) {
  return toWaMeUrl(toWhatsAppRequest(inv, business));
}

export function smsMessage(inv: InvoiceData, business: BusinessSettings = DEFAULT_BUSINESS) {
  const url = inv.publicUrl ?? (inv.publicToken ? invoicePublicUrl(inv.publicToken) : "");
  return buildMessage(toWhatsAppRequest({ ...inv, publicUrl: url }, business))
    .split("\n")
    .filter(Boolean)
    .slice(0, 4)
    .join(" ");
}

export function smsHref(inv: InvoiceData, business: BusinessSettings = DEFAULT_BUSINESS) {
  const mobile = inv.customerMobile.replace(/\D/g, "");
  return `sms:${mobile}?&body=${encodeURIComponent(smsMessage(inv, business))}`;
}