import { jsPDF } from "jspdf";
import { formatDateTime } from "./invoice";
import type { Invoice } from "./types";
import { DEFAULT_BUSINESS, type Business } from "@/services/business";

/** Plain-number INR formatting (jsPDF core fonts have no ₹ glyph). */
const inr = (v: number) => `Rs. ${new Intl.NumberFormat("en-IN").format(v)}`;

/** Builds the downloadable invoice PDF from a live `Invoice`. */
export function downloadInvoicePdf(invoice: Invoice, business: Business = DEFAULT_BUSINESS) {
  const storeName = business.business_name || DEFAULT_BUSINESS.business_name;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 48;
  const right = pageWidth - 48;
  let y = 64;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(storeName.toUpperCase(), pageWidth / 2, y, { align: "center" });

  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text("Retail Invoice", pageWidth / 2, y, { align: "center" });

  if (business.address) {
    y += 14;
    doc.text(business.address, pageWidth / 2, y, { align: "center", maxWidth: right - left });
  }
  if (business.gst_number) {
    y += 14;
    doc.text(`GSTIN: ${business.gst_number}`, pageWidth / 2, y, { align: "center" });
  }

  y += 22;
  doc.setDrawColor(200);
  doc.line(left, y, right, y);

  y += 24;
  doc.setTextColor(110);
  doc.text("Invoice", left, y);
  doc.text("Date", right, y, { align: "right" });
  y += 15;
  doc.setTextColor(30);
  doc.setFont("helvetica", "bold");
  doc.text(invoice.invoiceNo, left, y);
  doc.text(formatDateTime(invoice.createdAt), right, y, { align: "right" });

  y += 28;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110);
  doc.text("BILLED TO", left, y);
  y += 15;
  doc.setTextColor(30);
  doc.setFont("helvetica", "bold");
  doc.text(invoice.customerName, left, y);
  if (invoice.customerPhone) {
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(110);
    doc.text(invoice.customerPhone, left, y);
  }

  y += 28;
  doc.setTextColor(110);
  doc.setFont("helvetica", "bold");
  doc.text("ITEM", left, y);
  doc.text("QTY", right - 170, y, { align: "right" });
  doc.text("PRICE", right - 90, y, { align: "right" });
  doc.text("AMOUNT", right, y, { align: "right" });
  y += 8;
  doc.line(left, y, right, y);

  doc.setFont("helvetica", "normal");
  invoice.items.forEach((item) => {
    y += 20;
    doc.setTextColor(30);
    doc.text(`${item.name} - ${item.size}`, left, y, { maxWidth: 240 });
    doc.text(String(item.quantity), right - 170, y, { align: "right" });
    doc.text(inr(item.price), right - 90, y, { align: "right" });
    doc.text(inr(item.lineTotal), right, y, { align: "right" });
    const details = [item.color, item.category].filter(Boolean).join(" / ");
    if (details) {
      y += 13;
      doc.setTextColor(130);
      doc.setFontSize(9);
      doc.text(details, left, y);
      doc.setFontSize(10);
    }
  });

  y += 16;
  doc.line(left, y, right, y);

  const row = (label: string, value: string, bold = false) => {
    y += 20;
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(bold ? 20 : 110);
    doc.text(label, right - 170, y);
    doc.text(value, right, y, { align: "right" });
  };

  row("Subtotal", inr(invoice.subtotal));
  if (invoice.discountAmount > 0) row("Discount", `- ${inr(invoice.discountAmount)}`);
  if (invoice.gstAmount > 0) row("GST", inr(invoice.gstAmount));
  row("Payment Method", invoice.paymentMode);
  doc.setFontSize(13);
  row("Grand Total", inr(invoice.total), true);

  y += 34;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text(
    business.invoice_footer?.trim() || `Thank you for shopping at ${storeName}.`,
    pageWidth / 2,
    y,
    { align: "center" },
  );

  doc.save(`${invoice.invoiceNo}.pdf`);
}
