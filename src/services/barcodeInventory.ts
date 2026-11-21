import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { invoicePublicUrl, type InvoiceData, type InvoiceLine } from "@/lib/kv/invoice";

/**
 * Data layer for barcode Stock In and Scan Billing.
 *
 * Every write goes through a SECURITY DEFINER RPC (kv_stock_in / kv_complete_sale) that checks the
 * owner role again inside the database and runs as ONE transaction. Prices are never sent from
 * the browser for a sale — the database reads the current selling price itself.
 */

export interface VariantProduct {
  id: string;
  name: string;
  sku: string | null;
  category: string;
  selling_price: number;
  gst_pct: number;
  stock_by_size: Record<string, number> | null;
  is_archived: boolean;
}

export interface VariantRecord {
  id: string;
  barcode: string;
  size: string;
  colour: string;
  stock: number;
  is_active: boolean;
  product_id: string;
  product: VariantProduct;
}

const VARIANT_SELECT =
  "id, barcode, size, colour, stock, is_active, product_id, " +
  "products!inner(id, name, sku, category, selling_price, gst_pct, stock_by_size, is_archived)";

type RawVariant = Omit<VariantRecord, "product"> & { products: VariantProduct | VariantProduct[] };

function normaliseVariant(row: RawVariant): VariantRecord {
  const p = Array.isArray(row.products) ? row.products[0]! : row.products;
  const { products: _unused, ...rest } = row;
  void _unused;
  return {
    ...rest,
    stock: Number(rest.stock),
    product: {
      ...p,
      selling_price: Number(p.selling_price),
      gst_pct: Number(p.gst_pct ?? 0),
    },
  };
}

/** Units that can actually be sold: the lower of the variant stock and the product's per-size stock. */
export function availableStock(v: VariantRecord): number {
  const agg = Number(v.product.stock_by_size?.[v.size] ?? 0);
  return Math.max(0, Math.min(v.stock, agg));
}

export function variantLabel(v: { size: string; colour: string }) {
  return v.colour ? `${v.colour} / ${v.size}` : v.size;
}

function toError(error: { message?: string; code?: string } | null, fallback: string): Error {
  if (!error) return new Error(fallback);
  if (error.code === "42501" || /permission denied|row-level security/i.test(error.message ?? "")) {
    return new Error("Only the owner account can do this.");
  }
  return new Error(error.message || fallback);
}

/* ----------------------------- Lookups ----------------------------- */

export async function fetchVariants(): Promise<VariantRecord[]> {
  const { data, error } = await supabase
    .from("product_variants")
    .select(VARIANT_SELECT)
    .eq("products.is_archived", false)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw toError(error, "Could not load barcodes.");
  return ((data ?? []) as unknown as RawVariant[]).map(normaliseVariant);
}

/** Exact barcode lookup. Returns null when no variant has that barcode. */
export async function lookupVariantByBarcode(barcode: string): Promise<VariantRecord | null> {
  const code = barcode.trim().toUpperCase();
  if (!code) return null;
  const { data, error } = await supabase
    .from("product_variants")
    .select(VARIANT_SELECT)
    .eq("barcode", code)
    .maybeSingle();
  if (error) throw toError(error, "Could not look up that barcode.");
  return data ? normaliseVariant(data as unknown as RawVariant) : null;
}

/* ----------------------------- Stock In ----------------------------- */

export interface StockInProductInput {
  name: string;
  category: string;
  brand: string;
  sku: string;
  cost_price: number;
  selling_price: number;
  description: string;
  supplier: string;
}

export interface StockInLineInput {
  size: string;
  colour: string;
  quantity: number;
}

export interface StockInResultLine {
  variant_id: string;
  barcode: string;
  size: string;
  colour: string;
  quantity_added: number;
  new_stock: number;
  created: boolean;
}

export interface StockInResult {
  product: {
    id: string;
    name: string;
    category: string;
    sku: string;
    created: boolean;
    cost_price: number;
    selling_price: number;
  };
  lines: StockInResultLine[];
  replayed: boolean;
}

export async function stockIn(
  requestKey: string,
  product: StockInProductInput,
  lines: StockInLineInput[],
): Promise<StockInResult> {
  const { data, error } = await supabase.rpc("kv_stock_in", {
    p_request_key: requestKey,
    p_product: product as unknown as Json,
    p_variants: lines as unknown as Json,
  });
  if (error) throw toError(error, "Stock-in failed. Nothing was saved.");
  return data as unknown as StockInResult;
}

/* ----------------------------- Scan billing ----------------------------- */

export interface ScanSaleInput {
  requestKey: string;
  customerName: string;
  customerMobile: string;
  paymentMethod: "Cash" | "UPI" | "Card";
  discountType: "percent" | "amount";
  discountValue: number;
  items: { variantId: string; quantity: number }[];
}

interface ScanSaleResultRaw {
  invoice_number: string;
  public_token: string;
  created_at: string;
  customer_name: string;
  customer_mobile: string;
  payment_method: string;
  subtotal: number;
  discount: number;
  gst: number;
  total: number;
  replayed: boolean;
  lines: {
    sale_id: string;
    product_id: string;
    variant_id: string;
    product_name: string;
    variant: string | null;
    size: string;
    barcode: string;
    quantity: number;
    unit_price: number;
    discount: number;
    line_total: number;
  }[];
}

export async function completeScanSale(
  input: ScanSaleInput,
): Promise<{ invoice: InvoiceData; replayed: boolean }> {
  const { data, error } = await supabase.rpc("kv_complete_sale", {
    p_request_key: input.requestKey,
    p_customer_name: input.customerName,
    p_customer_mobile: input.customerMobile,
    p_payment_method: input.paymentMethod,
    p_discount_type: input.discountType,
    p_discount_value: input.discountValue,
    p_items: input.items.map((i) => ({
      variant_id: i.variantId,
      quantity: i.quantity,
    })) as unknown as Json,
  });
  if (error) throw toError(error, "Could not complete the sale. Nothing was saved.");
  const r = data as unknown as ScanSaleResultRaw;
  const items: InvoiceLine[] = r.lines.map((l) => ({
    productName: l.product_name,
    variant: l.variant,
    size: l.size,
    quantity: Number(l.quantity),
    unitPrice: Number(l.unit_price),
    discount: Number(l.discount),
    lineTotal: Number(l.line_total),
  }));
  const first = items[0]!;
  const invoice: InvoiceData = {
    invoiceNumber: r.invoice_number,
    createdAt: r.created_at,
    customerName: r.customer_name,
    customerMobile: r.customer_mobile,
    items,
    productName: first.productName,
    size: first.size,
    quantity: first.quantity,
    unitPrice: first.unitPrice,
    discount: Number(r.discount),
    subtotal: Number(r.subtotal),
    gstAmount: Number(r.gst),
    total: Number(r.total),
    paymentMethod: r.payment_method,
    publicToken: r.public_token,
    publicUrl: invoicePublicUrl(r.public_token),
  };
  return { invoice, replayed: !!r.replayed };
}

/* ----------------------------- Print history ----------------------------- */

export interface PrintJobRecord {
  id: string;
  variant_id: string | null;
  barcode: string;
  product_name: string | null;
  size: string | null;
  colour: string | null;
  copies: number;
  status: string;
  printer_name: string | null;
  error: string | null;
  created_at: string;
}

export interface PrintJobInput {
  variant_id?: string | null;
  barcode: string;
  product_name?: string | null;
  size?: string | null;
  colour?: string | null;
  copies: number;
  status: "success" | "failed" | "test";
  printer_name?: string | null;
  error?: string | null;
}

/** History is best-effort: a logging failure must never turn a good print into an error. */
export async function logPrintJobs(rows: PrintJobInput[]): Promise<void> {
  if (!rows.length) return;
  try {
    await supabase.from("barcode_print_jobs").insert(
      rows.map((r) => ({
        variant_id: r.variant_id ?? null,
        barcode: r.barcode,
        product_name: r.product_name ?? null,
        size: r.size ?? null,
        colour: r.colour ?? null,
        copies: Math.max(1, Math.min(5000, Math.floor(r.copies))),
        status: r.status,
        printer_name: r.printer_name ?? null,
        error: r.error ?? null,
      })),
    );
  } catch {
    /* ignore */
  }
}

export async function fetchPrintJobs(limit = 100): Promise<PrintJobRecord[]> {
  const { data, error } = await supabase
    .from("barcode_print_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw toError(error, "Could not load print history.");
  return (data ?? []) as PrintJobRecord[];
}
