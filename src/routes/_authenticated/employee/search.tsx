import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search as SearchIcon } from "lucide-react";
import { AppShell } from "@/components/employee/AppShell";
import { GlassCard } from "@/components/employee/GlassCard";
import { usePos } from "@/lib/pos/pos-context";
import { formatINR } from "@/lib/pos/invoice";
import { useProducts, useRealtimeSync } from "@/hooks/use-pos-data";
import { primaryColor, productSizes, stockForSize } from "@/services/products";
import type { Product } from "@/lib/pos/types";

export const Route = createFileRoute("/_authenticated/employee/search")({
  head: () => ({
    meta: [
      { title: "Product Search — Kaal Vastr POS" },
      {
        name: "description",
        content:
          "Find any Kaal Vastr product by name, SKU, size or colour and add it straight to the bill.",
      },
      { property: "og:title", content: "Product Search — Kaal Vastr POS" },
      {
        property: "og:description",
        content: "Instant catalogue lookup with prices and live stock counts.",
      },
    ],
  }),
  component: () => (
      <SearchPage />
  ),
});

function SearchPage() {
  useRealtimeSync();
  const { data: products = [] } = useProducts();
  const { addToCart } = usePos();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  const categories = useMemo<string[]>(
    () => ["All", ...Array.from(new Set(products.map((p: Product) => p.category)))],
    [products],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p: Product) => {
      const matchesQuery = q
        ? [p.name, p.sku ?? "", p.category, ...(p.colors ?? []), ...(p.sizes ?? [])]
            .join(" ")
            .toLowerCase()
            .includes(q)
        : true;
      return matchesQuery && (category === "All" || p.category === category);
    });
  }, [products, query, category]);

  return (
    <AppShell title="Product Search" subtitle={`${results.length} products`}>
      <GlassCard>
        <div className="flex items-center gap-3 rounded-xl border border-input bg-secondary/50 px-3">
          <SearchIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the catalogue"
            className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-full border border-border px-3 py-1.5 text-xs transition-colors ${
                category === c ? "gold-surface" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </GlassCard>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {results.map((p: Product) => (
          <GlassCard key={p.id} className="hover-lift">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{p.name}</p>
                <p className="truncate text-xs text-muted-foreground">{p.sku ?? "—"}</p>
              </div>
              <span className="gold-text shrink-0 font-display font-semibold">
                {formatINR(Number(p.selling_price))}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Chip>{p.category}</Chip>
              {primaryColor(p) ? <Chip>{primaryColor(p)}</Chip> : null}
              <Chip>{p.stock} in stock</Chip>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {productSizes(p).map((size) => {
                const left = stockForSize(p, size);
                return (
                  <button
                    key={size}
                    onClick={() => addToCart(p, size)}
                    disabled={left <= 0}
                    className="flex items-center gap-1 rounded-xl border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" /> {size} · {left}
                  </button>
                );
              })}
            </div>
          </GlassCard>
        ))}
      </div>
      {results.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">No matching products.</p>
      ) : null}
    </AppShell>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border bg-secondary/50 px-2.5 py-1">
      {children}
    </span>
  );
}
