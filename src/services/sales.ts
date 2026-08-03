import { supabase } from "@/integrations/supabase/client";
import { stockForSize } from "./products";
import type { CartItem, Invoice, InvoiceLine, PaymentMode, Product, SaleRow } from "@/lib/pos/types";

export interface CheckoutInput {
  customerName: string;
  customerPhone: string;
  discountType: "percent" | "amount";
  discountValue: number;
  paymentMode: PaymentMode;
  items: CartItem[];
}

export function generateInvoiceNumber() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate(),
  ).padStart(2, "0")}`;
  return `KV-${stamp}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function generatePublicToken(len = 10) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(len);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[(bytes[i] ?? 0) % alphabet.length];
  return out;
}

/** Bill-level totals shared by the billing screen and checkout. */
export function computeTotals(
  items: CartItem[],
  discountType: "percent" | "amount",
  discountValue: number,
) {
  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const raw = discountType === "percent" ? (subtotal * discountValue) / 100 : discountValue;
  const discountAmount = Math.max(0, Math.min(subtotal, Math.round(raw)));
  return { subtotal, discountAmount, total: subtotal - discountAmount };
}

/**
 * Creates a bill in the shared database.
 *
 * All line items are inserted in ONE statement, so PostgREST/Postgres commits
 * them atomically — a failure on any row rolls the whole bill back. The
 * `trg_apply_sale_stock` trigger on `sales` decrements `products.stock` and
 * `products.stock_by_size` in the same transaction, so stock can never drift
 * or go negative and the Owner Dashboard sees the change immediately.
 */
export async function createSale(input: CheckoutInput): Promise<Invoice> {
  const name = input.customerName.trim();
  const phone = input.customerPhone.trim();
  if (!name) throw new Error("Customer name is required.");
  if (!phone) throw new Error("Customer mobile number is required.");
  if (!input.items.length) throw new Error("Add at least one product to the bill.");

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) throw new Error("Your session expired. Please sign in again.");

  // Re-read live stock right before writing so we never bill stale quantities.
  const ids = Array.from(new Set(input.items.map((i) => i.product.id)));
  const { data: live, error: liveError } = await supabase
    .from("products")
    .select("id, name, stock, stock_by_size, cost_price, gst_pct")
    .in("id", ids);
  if (liveError) throw new Error(liveError.message);
  const liveMap = new Map((live ?? []).map((p) => [p.id, p as unknown as Product]));

  for (const item of input.items) {
    const p = liveMap.get(item.product.id);
    if (!p) throw new Error(`${item.product.name} is no longer available.`);
    const available = stockForSize(p, item.size);
    if (item.quantity < 1) throw new Error("Quantity must be at least 1.");
    if (available < item.quantity) {
      throw new Error(`Only ${available} left of ${item.product.name} (${item.size}).`);
    }
  }

  const { subtotal, discountAmount } = computeTotals(
    input.items,
    input.discountType,
    input.discountValue,
  );

  const invoice_number = generateInvoiceNumber();
  const public_token = generatePublicToken(10);

  // Spread the bill discount across lines proportionally (remainder on the last line).
  let allocated = 0;
  const rows = input.items.map((item, index) => {
    const lineSubtotal = item.unitPrice * item.quantity;
    const isLast = index === input.items.length - 1;
    const lineDiscount = isLast
      ? discountAmount - allocated
      : subtotal > 0
        ? Math.round((lineSubtotal / subtotal) * discountAmount)
        : 0;
    allocated += lineDiscount;

    const live = liveMap.get(item.product.id)!;
    const costPrice = Number(live.cost_price ?? item.product.cost_price ?? 0);
    const gstPct = Number(live.gst_pct ?? item.product.gst_pct ?? 0);
    const taxable = Math.max(0, lineSubtotal - lineDiscount);
    const gst = Math.round((taxable * gstPct) / 100);

    return {
      invoice_number,
      public_token,
      customer_name: name,
      customer_mobile: phone,
      product_id: item.product.id,
      product_name: item.product.name,
      size: item.size,
      quantity: item.quantity,
      unit_cost: costPrice,
      unit_price: item.unitPrice,
      discount: lineDiscount,
      total_amount: taxable + gst,
      profit: (item.unitPrice - costPrice) * item.quantity - lineDiscount,
      payment_method: input.paymentMode,
      payment_status: "Paid",
      created_by: user.id,
    };
  });

  const { data, error } = await supabase.from("sales").insert(rows).select();
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") throw new Error("Invoice number already exists — please retry.");
    if (code === "42501" || /row-level security|permission denied/i.test(error.message)) {
      throw new Error("Permission denied — your account is not allowed to bill.");
    }
    throw new Error(error.message || "Could not save the bill.");
  }
  const inserted = (data ?? []) as SaleRow[];
  if (!inserted.length) throw new Error("The bill was not saved. Please try again.");

  // Audit trail shared with the Owner Dashboard (non-blocking).
  await logSaleActivity(inserted, invoice_number, user.id, user.email ?? null);

  return toInvoice(inserted, input.items);
}

async function logSaleActivity(
  rows: SaleRow[],
  invoiceNumber: string,
  userId: string,
  userEmail: string | null,
) {
  try {
    await supabase.from("inventory_activity").insert(
      rows.map((r) => ({
        product_id: r.product_id,
        product_name: r.product_name,
        action: "sale",
        quantity: r.quantity,
        note: `Sold via Employee POS · ${invoiceNumber} · size ${r.size}`,
        user_id: userId,
        user_email: userEmail,
      })),
    );
  } catch {
    /* auditing must never block a completed bill */
  }
}

function toInvoice(rows: SaleRow[], cart?: CartItem[]): Invoice {
  const first = rows[0]!;
  const items: InvoiceLine[] = rows.map((r) => {
    const match = cart?.find((c) => c.product.id === r.product_id && c.size === r.size);
    return {
      productId: r.product_id,
      name: r.product_name,
      size: r.size,
      color: match?.product.colors?.[0] ?? null,
      category: match?.product.category ?? null,
      quantity: r.quantity,
      price: Number(r.unit_price),
      discount: Number(r.discount),
      lineTotal: Number(r.total_amount),
    };
  });
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const discountAmount = items.reduce((s, i) => s + i.discount, 0);
  const total = items.reduce((s, i) => s + i.lineTotal, 0);
  return {
    invoiceNo: first.invoice_number,
    publicToken: first.public_token,
    createdAt: first.created_at,
    customerName: first.customer_name,
    customerPhone: first.customer_mobile,
    items,
    subtotal,
    discountAmount,
    gstAmount: Math.max(0, total - (subtotal - discountAmount)),
    total,
    paymentMode: first.payment_method,
  };
}

/** Bills created today, across every device using this database. */
export async function fetchTodaySales(): Promise<Invoice[]> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from("sales")
    .select("*")
    .gte("created_at", start.toISOString())
    .eq("is_returned", false)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return groupByInvoice((data ?? []) as SaleRow[]);
}

export async function fetchRecentSales(limit = 50): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from("sales")
    .select("*")
    .eq("is_returned", false)
    .order("created_at", { ascending: false })
    .limit(limit * 4);
  if (error) throw new Error(error.message);
  return groupByInvoice((data ?? []) as SaleRow[]).slice(0, limit);
}

function groupByInvoice(rows: SaleRow[]): Invoice[] {
  const map = new Map<string, SaleRow[]>();
  for (const r of rows) {
    const list = map.get(r.invoice_number) ?? [];
    list.push(r);
    map.set(r.invoice_number, list);
  }
  return Array.from(map.values())
    .map((group) => toInvoice(group))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Public invoice lookup — runs through the security-definer RPC, no login. */
export async function fetchInvoiceByToken(token: string): Promise<Invoice | null> {
  const { data, error } = await supabase.rpc("get_invoice_by_token", { _token: token });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as SaleRow[];
  if (!rows.length) return null;
  return toInvoice(rows);
}
