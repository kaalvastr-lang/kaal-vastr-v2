import { supabase } from "@/integrations/supabase/client";

export type InventoryProduct = {
  id: string;
  name: string;
  category: string;
  variant?: string | null;
  brand: string | null;
  sku: string | null;
  hsn_code: string | null;
  gst_pct: number;
  cost_price: number;
  selling_price: number;
  stock: number;
  min_stock: number;
  sizes: string[];
  colors: string[];
  description: string | null;
  image_url: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  size_type?: string;
  stock_by_size?: Record<string, number> | null;
};

export type InventoryActivity = {
  id: string;
  product_id: string | null;
  product_name: string;
  action: string;
  quantity: number;
  note: string | null;
  user_id: string | null;
  user_email: string | null;
  created_at: string;
};

export async function logInventoryActivity(entry: {
  product_id?: string | null;
  product_name: string;
  action: string;
  quantity?: number;
  note?: string | null;
}) {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from as any)("inventory_activity").insert({
      product_id: entry.product_id ?? null,
      product_name: entry.product_name,
      action: entry.action,
      quantity: entry.quantity ?? 0,
      note: entry.note ?? null,
      user_id: user?.id ?? null,
      user_email: user?.email ?? null,
    });
  } catch {
    /* non-blocking */
  }
}

export function stockStatus(p: { stock: number; min_stock: number }) {
  if (p.stock <= 0) return "out" as const;
  if (p.stock <= p.min_stock) return "low" as const;
  return "ok" as const;
}

export function exportProductsCsv(rows: InventoryProduct[], soldMap: Map<string, number>) {
  const headers = [
    "Name",
    "Category",
    "Brand",
    "SKU",
    "HSN",
    "GST %",
    "Cost",
    "Selling",
    "Profit/Item",
    "Stock",
    "Sold",
    "Min Stock",
    "Sizes",
    "Colors",
    "Status",
  ];
  const lines = rows.map((p) => {
    const sold = soldMap.get(p.id) ?? 0;
    const status = stockStatus(p);
    const cells = [
      p.name,
      p.category,
      p.brand ?? "",
      p.sku ?? "",
      p.hsn_code ?? "",
      String(p.gst_pct ?? 0),
      String(p.cost_price),
      String(p.selling_price),
      String(Number(p.selling_price) - Number(p.cost_price)),
      String(p.stock),
      String(sold),
      String(p.min_stock),
      (p.sizes ?? []).join("|"),
      (p.colors ?? []).join("|"),
      status,
    ];
    return cells
      .map((c) => {
        const s = String(c ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      })
      .join(",");
  });
  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kaal-vastr-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}