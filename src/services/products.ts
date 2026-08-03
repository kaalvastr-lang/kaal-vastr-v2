import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/lib/pos/types";

/** Live catalogue from the shared `products` table. Never cached, never mocked. */
export async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("is_archived", false)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Product[];
}

/** Stock available for a specific size (falls back to the product total). */
export function stockForSize(product: Product, size?: string | null): number {
  const map = (product.stock_by_size ?? null) as Record<string, number> | null;
  if (size && map && typeof map[size] === "number") return Number(map[size]);
  if (size && map && Object.keys(map).length > 0) return 0;
  return Number(product.stock ?? 0);
}

export function productSizes(product: Product): string[] {
  const map = (product.stock_by_size ?? null) as Record<string, number> | null;
  const fromMap = map ? Object.keys(map) : [];
  const sizes = product.sizes?.length ? product.sizes : fromMap;
  return sizes.length ? sizes : ["Free"];
}

export function primaryColor(product: Product): string | null {
  return product.colors?.[0] ?? null;
}

export function stockStatus(product: Product) {
  if (product.stock <= 0) return "out" as const;
  if (product.stock <= (product.min_stock ?? 0)) return "low" as const;
  return "ok" as const;
}
