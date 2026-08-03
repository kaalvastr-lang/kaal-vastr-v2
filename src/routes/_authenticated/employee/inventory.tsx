import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Eye, Lock, Search as SearchIcon } from "lucide-react";
import { AppShell } from "@/components/employee/AppShell";
import { GlassCard } from "@/components/employee/GlassCard";
import { formatINR } from "@/lib/pos/invoice";
import { useProducts, useRealtimeSync } from "@/hooks/use-pos-data";
import { primaryColor, productSizes, stockStatus } from "@/services/products";
import type { Product } from "@/lib/pos/types";

export const Route = createFileRoute("/_authenticated/employee/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory (View Only) — Kaal Vastr POS" },
      {
        name: "description",
        content:
          "Read-only stock levels for every Kaal Vastr product, with low-stock and out-of-stock flags.",
      },
      { property: "og:title", content: "Inventory (View Only) — Kaal Vastr POS" },
      {
        property: "og:description",
        content: "Check remaining stock at a glance. Editing is reserved for the owner dashboard.",
      },
    ],
  }),
  component: () => (
      <InventoryPage />
  ),
});

function InventoryPage() {
  useRealtimeSync();
  const { data: products = [], isLoading } = useProducts();
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p: Product) =>
      q
        ? [p.name, p.sku ?? "", p.category, ...(p.sizes ?? [])].join(" ").toLowerCase().includes(q)
        : true,
    );
  }, [products, query]);

  const totalUnits = products.reduce((n: number, p: Product) => n + Number(p.stock ?? 0), 0);

  return (
    <AppShell title="Inventory" subtitle={`${totalUnits} units on the floor · view only`}>
      <GlassCard className="mb-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-input bg-secondary/50 px-3">
            <SearchIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter stock"
              className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <span className="flex shrink-0 items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Read only
          </span>
        </div>
      </GlassCard>

      <GlassCard className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-[11px] tracking-widest text-muted-foreground uppercase">
              <th className="pb-3">Product</th>
              <th className="pb-3">Category</th>
              <th className="pb-3">Sizes</th>
              <th className="pb-3 text-right">Price</th>
              <th className="pb-3 text-right">Stock</th>
              <th className="pb-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p: Product) => (
              <tr key={p.id} className="border-t border-border">
                <td className="py-3">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[p.sku, primaryColor(p)].filter(Boolean).join(" · ")}
                  </p>
                </td>
                <td className="py-3 text-muted-foreground">{p.category}</td>
                <td className="py-3 text-muted-foreground">{productSizes(p).join(", ")}</td>
                <td className="py-3 text-right">{formatINR(Number(p.selling_price))}</td>
                <td className="py-3 text-right font-semibold">{p.stock}</td>
                <td className="py-3 text-right">
                  <StockBadge status={stockStatus(p)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing matches.</p>
        ) : null}
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading stock…</p>
        ) : null}
      </GlassCard>

      <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Eye className="h-3.5 w-3.5" /> Adding, editing and deleting stock is disabled for employee
        accounts.
      </p>
    </AppShell>
  );
}

function StockBadge({ status }: { status: "out" | "low" | "ok" }) {
  const tone =
    status === "out"
      ? "border-destructive/40 bg-destructive/15 text-destructive-foreground"
      : status === "low"
        ? "border-primary/40 bg-primary/15 text-primary"
        : "border-success/40 bg-success/15 text-success";
  const label = status === "out" ? "Out of stock" : status === "low" ? "Low stock" : "In stock";
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone}`}>
      {label}
    </span>
  );
}
