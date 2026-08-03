import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Boxes,
  Package,
  Layers,
  Warehouse,
  TrendingUp,
  AlertTriangle,
  XCircle,
  Plus,
  Minus,
  Pencil,
  Trash2,
  Archive,
  ArchiveRestore,
  Download,
  PlusCircle,
  Search,
  Sparkles,
  History,
  BarChart3,
  LayoutGrid,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatCard } from "@/components/kv/StatCard";
import { GlassCard } from "@/components/kv/GlassCard";
import { Money, usePrivacy } from "@/lib/kv/privacy";
import {
  exportProductsCsv,
  logInventoryActivity,
  stockStatus,
  type InventoryActivity,
  type InventoryProduct,
} from "@/lib/kv/inventory";
import { cn } from "@/lib/utils";

type Sale = {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  total_amount: number;
  is_returned: boolean;
  created_at: string;
};

type Tab = "dashboard" | "products" | "activity" | "analytics";

const GOLD = ["#f0d67a", "#d4af37", "#a37e12", "#7a5c0a", "#4e3a05", "#e6c86a"];

export function InventorySection() {
  const [tab, setTab] = useState<Tab>("dashboard");

  const { data: products = [], isLoading: pLoad } = useQuery({
    queryKey: ["inventory-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as unknown as InventoryProduct[];
    },
  });

  const { data: sales = [] } = useQuery({
    queryKey: ["inventory-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id,product_id,product_name,quantity,total_amount,is_returned,created_at")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as Sale[];
    },
  });

  const { data: activity = [] } = useQuery({
    queryKey: ["inventory-activity"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from as any)("inventory_activity")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as InventoryActivity[];
    },
  });

  const soldByProductId = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sales) {
      if (s.is_returned || !s.product_id) continue;
      m.set(s.product_id, (m.get(s.product_id) ?? 0) + s.quantity);
    }
    return m;
  }, [sales]);

  const soldByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sales) {
      if (s.is_returned) continue;
      m.set(s.product_name, (m.get(s.product_name) ?? 0) + s.quantity);
    }
    return m;
  }, [sales]);

  const revenueByCategory = useMemo(() => {
    const productCat = new Map<string, string>();
    for (const p of products) productCat.set(p.id, p.category);
    const m = new Map<string, number>();
    for (const s of sales) {
      if (s.is_returned) continue;
      const cat = (s.product_id && productCat.get(s.product_id)) || "Other";
      m.set(cat, (m.get(cat) ?? 0) + Number(s.total_amount));
    }
    return [...m.entries()].map(([name, value]) => ({ name, value }));
  }, [sales, products]);

  const active = products.filter((p) => !p.is_archived);
  const totalStock = active.reduce((a, p) => a + p.stock, 0);
  const totalSold = [...soldByProductId.values()].reduce((a, n) => a + n, 0);
  const lowItems = active.filter((p) => stockStatus(p) === "low");
  const outItems = active.filter((p) => stockStatus(p) === "out");
  const categories = new Set(active.map((p) => p.category));

  const tabs: { id: Tab; label: string; icon: typeof LayoutGrid }[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
    { id: "products", label: "Products", icon: Boxes },
    { id: "activity", label: "Activity", icon: History },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Warehouse</p>
          <h1 className="font-display mt-2 text-4xl">
            Inventory <span className="gold-text">Control</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track every piece — from arrival to the customer's hands.
          </p>
        </div>
        <div className="glass flex gap-1 rounded-2xl p-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative flex items-center gap-2 rounded-xl px-4 py-2 text-xs uppercase tracking-widest transition",
                  active
                    ? "text-[#1a1408]"
                    : "text-muted-foreground hover:text-white",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="inv-tab"
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#f0d67a] to-[#d4af37]"
                  />
                )}
                <span className="relative flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >
          {tab === "dashboard" && (
            <InventoryDashboard
              products={active}
              soldByName={soldByName}
              soldByProductId={soldByProductId}
              lowItems={lowItems}
              outItems={outItems}
              totalStock={totalStock}
              totalSold={totalSold}
              categoriesCount={categories.size}
              onOpenProducts={() => setTab("products")}
            />
          )}
          {tab === "products" && (
            <InventoryProducts
              products={products}
              soldByProductId={soldByProductId}
              loading={pLoad}
            />
          )}
          {tab === "activity" && <InventoryActivityLog activity={activity} />}
          {tab === "analytics" && (
            <InventoryAnalytics
              products={active}
              soldByName={soldByName}
              revenueByCategory={revenueByCategory}
              sales={sales}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ---------------- DASHBOARD TAB ---------------- */

function InventoryDashboard({
  products,
  soldByName,
  soldByProductId,
  lowItems,
  outItems,
  totalStock,
  totalSold,
  categoriesCount,
  onOpenProducts,
}: {
  products: InventoryProduct[];
  soldByName: Map<string, number>;
  soldByProductId: Map<string, number>;
  lowItems: InventoryProduct[];
  outItems: InventoryProduct[];
  totalStock: number;
  totalSold: number;
  categoriesCount: number;
  onOpenProducts: () => void;
}) {
  const recommendations = useMemo(() => {
    const recs: { tone: "gold" | "green" | "rose" | "amber"; text: string }[] = [];
    for (const p of outItems.slice(0, 2))
      recs.push({ tone: "rose", text: `${p.name} is out of stock — restock now.` });
    for (const p of lowItems.slice(0, 2))
      recs.push({ tone: "amber", text: `${p.name} is running low (${p.stock} left).` });
    const sorted = [...products].sort(
      (a, b) => (soldByProductId.get(b.id) ?? 0) - (soldByProductId.get(a.id) ?? 0),
    );
    const top = sorted[0];
    if (top && (soldByProductId.get(top.id) ?? 0) > 0)
      recs.push({ tone: "gold", text: `${top.name} is selling fast — consider more stock.` });
    const stale = products.find(
      (p) => (soldByProductId.get(p.id) ?? 0) === 0 && p.stock > 0,
    );
    if (stale)
      recs.push({
        tone: "green",
        text: `${stale.name} hasn't sold yet — try a promotion.`,
      });
    return recs.slice(0, 4);
  }, [products, soldByProductId, lowItems, outItems]);

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Total Products" value={String(products.length)} icon={Package} accent="neutral" />
        <StatCard label="Categories" value={String(categoriesCount)} icon={Layers} accent="neutral" delay={0.05} />
        <StatCard label="Stock Units" value={String(totalStock)} icon={Warehouse} delay={0.1} />
        <StatCard label="Total Sold" value={String(totalSold)} icon={TrendingUp} accent="positive" delay={0.15} />
        <StatCard
          label="Low Stock"
          value={String(lowItems.length)}
          icon={AlertTriangle}
          accent={lowItems.length ? "negative" : "neutral"}
          delay={0.2}
        />
        <StatCard
          label="Out of Stock"
          value={String(outItems.length)}
          icon={XCircle}
          accent={outItems.length ? "negative" : "neutral"}
          delay={0.25}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <GlassCard>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-display text-xl">Stock Alerts</h3>
              <p className="text-xs text-muted-foreground">
                Items that need your attention
              </p>
            </div>
            <Button variant="ghost" onClick={onOpenProducts} className="text-[#f0d67a]">
              Manage →
            </Button>
          </div>
          <div className="space-y-2">
            {outItems.length === 0 && lowItems.length === 0 && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-300">
                <span className="mr-2"></span> All items are healthy.
              </div>
            )}
            {outItems.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span></span>
                  <div>
                    <p className="text-rose-200">{p.name}</p>
                    <p className="text-[10px] uppercase tracking-widest text-rose-300/70">
                      Out of stock
                    </p>
                  </div>
                </div>
                <span className="text-xs text-rose-200/70">
                  Sold: {soldByName.get(p.name) ?? 0}
                </span>
              </div>
            ))}
            {lowItems.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span></span>
                  <div>
                    <p className="text-amber-100">
                      {p.name} only {p.stock} left
                    </p>
                    <p className="text-[10px] uppercase tracking-widest text-amber-200/70">
                      Min: {p.min_stock}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-amber-100/70">
                  Sold: {soldByName.get(p.name) ?? 0}
                </span>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard delay={0.05}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-display text-xl">Smart Suggestions</h3>
              <p className="text-xs text-muted-foreground">
                Curated advice based on your sales
              </p>
            </div>
            <Sparkles className="h-5 w-5 text-[#f0d67a]" />
          </div>
          <div className="space-y-2">
            {recommendations.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Add products and record sales to see tailored suggestions.
              </p>
            )}
            {recommendations.map((r, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-xl border px-4 py-3 text-sm",
                  r.tone === "gold" &&
                    "border-[#d4af37]/30 bg-[#d4af37]/10 text-[#f0d67a]",
                  r.tone === "green" &&
                    "border-emerald-500/25 bg-emerald-500/5 text-emerald-200",
                  r.tone === "amber" &&
                    "border-amber-400/30 bg-amber-400/10 text-amber-100",
                  r.tone === "rose" &&
                    "border-rose-500/30 bg-rose-500/10 text-rose-200",
                )}
              >
                {r.text}
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

/* ---------------- PRODUCTS TAB ---------------- */

type SortKey = "name" | "category" | "stock" | "sold" | "selling" | "profit";

function InventoryProducts({
  products,
  soldByProductId,
  loading,
}: {
  products: InventoryProduct[];
  soldByProductId: Map<string, number>;
  loading: boolean;
}) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [size, setSize] = useState<string>("all");
  const [color, setColor] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [productDialog, setProductDialog] = useState<{
    open: boolean;
    initial: InventoryProduct | null;
  }>({ open: false, initial: null });
  const [stockDialog, setStockDialog] = useState<{
    open: boolean;
    product: InventoryProduct | null;
    mode: "add" | "reduce";
  }>({ open: false, product: null, mode: "add" });

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const p of products) s.add(p.category);
    return [...s].sort();
  }, [products]);
  const sizes = useMemo(() => {
    const s = new Set<string>();
    for (const p of products) (p.sizes ?? []).forEach((x) => s.add(x));
    return [...s].sort();
  }, [products]);
  const colors = useMemo(() => {
    const s = new Set<string>();
    for (const p of products) (p.colors ?? []).forEach((x) => s.add(x));
    return [...s].sort();
  }, [products]);

  const filtered = useMemo(() => {
    const t = q.toLowerCase();
    const rows = products.filter((p) => {
      if (!showArchived && p.is_archived) return false;
      if (showArchived && !p.is_archived) return false;
      if (category !== "all" && p.category !== category) return false;
      if (size !== "all" && !(p.sizes ?? []).includes(size)) return false;
      if (color !== "all" && !(p.colors ?? []).includes(color)) return false;
      const st = stockStatus(p);
      if (status !== "all" && status !== st) return false;
      if (!t) return true;
      return (
        p.name.toLowerCase().includes(t) ||
        p.category.toLowerCase().includes(t) ||
        (p.brand ?? "").toLowerCase().includes(t) ||
        (p.sku ?? "").toLowerCase().includes(t)
      );
    });
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const soldA = soldByProductId.get(a.id) ?? 0;
      const soldB = soldByProductId.get(b.id) ?? 0;
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "category":
          return a.category.localeCompare(b.category) * dir;
        case "stock":
          return (a.stock - b.stock) * dir;
        case "sold":
          return (soldA - soldB) * dir;
        case "selling":
          return (Number(a.selling_price) - Number(b.selling_price)) * dir;
        case "profit":
          return (
            (Number(a.selling_price) - Number(a.cost_price) - (Number(b.selling_price) - Number(b.cost_price))) *
            dir
          );
      }
    });
    return rows;
  }, [products, q, category, size, color, status, showArchived, sortKey, sortDir, soldByProductId]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  };

  const del = useMutation({
    mutationFn: async (p: InventoryProduct) => {
      const { error } = await supabase.from("products").delete().eq("id", p.id);
      if (error) throw error;
      await logInventoryActivity({
        product_id: null,
        product_name: p.name,
        action: "deleted",
        note: "Product removed from catalogue",
      });
    },
    onSuccess: () => {
      toast.success("Product deleted");
      qc.invalidateQueries({ queryKey: ["inventory-products"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["inventory-activity"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const archive = useMutation({
    mutationFn: async (p: InventoryProduct) => {
      const next = !p.is_archived;
      const { error } = await supabase
        .from("products")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ is_archived: next } as any)
        .eq("id", p.id);
      if (error) throw error;
      await logInventoryActivity({
        product_id: p.id,
        product_name: p.name,
        action: next ? "archived" : "unarchived",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-products"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["inventory-activity"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="space-y-6">
      <GlassCard>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, category, brand or SKU…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="border-white/10 bg-white/5 pl-9"
            />
          </div>
          <FilterSelect value={category} onChange={setCategory} placeholder="Category" options={categories} />
          <FilterSelect value={size} onChange={setSize} placeholder="Size" options={sizes} />
          <FilterSelect value={color} onChange={setColor} placeholder="Color" options={colors} />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-[140px] border-white/10 bg-white/5">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="ok">Healthy</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="out">Out</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => setShowArchived((v) => !v)}
            className="border-white/10"
          >
            {showArchived ? <ArchiveRestore className="mr-2 h-4 w-4" /> : <Archive className="mr-2 h-4 w-4" />}
            {showArchived ? "Active" : "Archived"}
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setProductDialog({ open: true, initial: null })}
            className="bg-gradient-to-r from-[#f0d67a] to-[#d4af37] text-[#1a1408]"
          >
            <PlusCircle className="mr-2 h-4 w-4" /> Add Product
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              setStockDialog({
                open: true,
                product: filtered[0] ?? products[0] ?? null,
                mode: "add",
              })
            }
            className="border-white/10"
            disabled={!products.length}
          >
            <Plus className="mr-2 h-4 w-4" /> Add Stock
          </Button>
          <Button
            variant="outline"
            onClick={() => exportProductsCsv(filtered, soldByProductId)}
            className="border-white/10"
            disabled={!filtered.length}
          >
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </GlassCard>

      <GlassCard className="overflow-x-auto p-0">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b border-white/5 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
              <th className="p-4">Product</th>
              <SortTh k="category" sk={sortKey} sd={sortDir} onClick={toggleSort}>
                Category
              </SortTh>
              <th>Sizes</th>
              <SortTh k="stock" sk={sortKey} sd={sortDir} onClick={toggleSort} align="right">
                Stock
              </SortTh>
              <SortTh k="sold" sk={sortKey} sd={sortDir} onClick={toggleSort} align="right">
                Sold
              </SortTh>
              <th className="text-right">Remaining</th>
              <th className="text-right">Cost</th>
              <SortTh k="selling" sk={sortKey} sd={sortDir} onClick={toggleSort} align="right">
                Selling
              </SortTh>
              <SortTh k="profit" sk={sortKey} sd={sortDir} onClick={toggleSort} align="right">
                Profit
              </SortTh>
              <th>Status</th>
              <th className="pr-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={11} className="py-8 text-center text-sm text-muted-foreground">
                  Loading inventory…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="py-10 text-center text-sm text-muted-foreground">
                  No products match your filters.
                </td>
              </tr>
            )}
            {filtered.map((p) => {
              const sold = soldByProductId.get(p.id) ?? 0;
              const st = stockStatus(p);
              const profit = Number(p.selling_price) - Number(p.cost_price);
              return (
                <tr
                  key={p.id}
                  className={cn(
                    "border-b border-white/5 align-top transition hover:bg-white/5",
                    st === "low" && "bg-amber-400/5",
                    st === "out" && "bg-rose-500/5",
                  )}
                >
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/60">
                        {p.image_url ? (
                          // eslint-disable-next-line jsx-a11y/alt-text
                          <img src={p.image_url} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[#d4af37]/50">
                            <Package className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{p.name}</p>
                        {p.brand && (
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                            {p.brand}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="text-xs uppercase tracking-wider text-muted-foreground">{p.category}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {(p.sizes ?? []).map((s) => {
                        const qty = (p.stock_by_size?.[s] as number | undefined) ?? 0;
                        return (
                          <span
                            key={s}
                            className={cn(
                              "rounded border px-1.5 py-0.5 text-[10px] font-medium",
                              qty === 0
                                ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                                : qty <= (p.min_stock ?? 5)
                                  ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                                  : "border-border bg-secondary/40 text-foreground",
                            )}
                          >
                            {s}: <span className="font-money">{qty}</span>
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="text-right font-money">{p.stock}</td>
                  <td className="text-right font-money">{sold}</td>
                  <td className="text-right font-money">{Math.max(0, p.stock)}</td>
                  <td className="text-right"><Money value={Number(p.cost_price)} /></td>
                  <td className="text-right">
                    <Money value={Number(p.selling_price)} className="gold-text" />
                  </td>
                  <td
                    className={cn(
                      "text-right",
                      profit >= 0 ? "text-emerald-300" : "text-rose-300",
                    )}
                  >
                    <Money value={profit} className={profit >= 0 ? "text-emerald-300" : "text-rose-300"} />
                  </td>
                  <td>
                    <StatusPill status={st} />
                  </td>
                  <td className="pr-4">
                    <div className="flex justify-end gap-1">
                      <IconBtn
                        title="Add stock"
                        onClick={() => setStockDialog({ open: true, product: p, mode: "add" })}
                      >
                        <Plus className="h-4 w-4" />
                      </IconBtn>
                      <IconBtn
                        title="Reduce stock"
                        onClick={() => setStockDialog({ open: true, product: p, mode: "reduce" })}
                      >
                        <Minus className="h-4 w-4" />
                      </IconBtn>
                      <IconBtn
                        title="Edit"
                        onClick={() => setProductDialog({ open: true, initial: p })}
                      >
                        <Pencil className="h-4 w-4" />
                      </IconBtn>
                      <IconBtn
                        title={p.is_archived ? "Restore" : "Archive"}
                        onClick={() => archive.mutate(p)}
                      >
                        {p.is_archived ? (
                          <ArchiveRestore className="h-4 w-4" />
                        ) : (
                          <Archive className="h-4 w-4" />
                        )}
                      </IconBtn>
                      <IconBtn
                        title="Delete"
                        tone="danger"
                        onClick={() => {
                          if (confirm(`Delete "${p.name}"?`)) del.mutate(p);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconBtn>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </GlassCard>

      <ProductFormDialog
        open={productDialog.open}
        initial={productDialog.initial}
        existingCategories={categories}
        onClose={() => setProductDialog({ open: false, initial: null })}
      />
      <StockDialog
        open={stockDialog.open}
        product={stockDialog.product}
        mode={stockDialog.mode}
        products={products.filter((p) => !p.is_archived)}
        onClose={() => setStockDialog({ open: false, product: null, mode: "add" })}
      />
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: string[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-[140px] border-white/10 bg-white/5">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SortTh({
  k,
  sk,
  sd,
  onClick,
  align = "left",
  children,
}: {
  k: SortKey;
  sk: SortKey;
  sd: "asc" | "desc";
  onClick: (k: SortKey) => void;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  const active = sk === k;
  return (
    <th className={cn(align === "right" && "text-right")}>
      <button
        onClick={() => onClick(k)}
        className={cn(
          "inline-flex items-center gap-1 uppercase tracking-widest transition hover:text-white",
          active && "text-[#f0d67a]",
        )}
      >
        {children}
        {active && <span>{sd === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  tone?: "danger";
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        "rounded-lg p-2 text-muted-foreground transition hover:bg-white/5 hover:text-white",
        tone === "danger" && "hover:bg-rose-500/10 hover:text-rose-300",
      )}
    >
      {children}
    </button>
  );
}

function StatusPill({ status }: { status: "ok" | "low" | "out" }) {
  if (status === "out")
    return (
      <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-xs text-rose-200">
        Out
      </span>
    );
  if (status === "low")
    return (
      <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-xs text-amber-100">
        Low
      </span>
    );
  return (
    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/5 px-2 py-0.5 text-xs text-emerald-300">
      OK
    </span>
  );
}

/* ---------------- PRODUCT FORM DIALOG ---------------- */

function ProductFormDialog({
  open,
  initial,
  existingCategories,
  onClose,
}: {
  open: boolean;
  initial: InventoryProduct | null;
  existingCategories: string[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const emptyForm = {
    name: "",
    category: "General",
    newCategory: "",
    variant: "",
    brand: "",
    sku: "",
    hsn_code: "",
    gst_pct: 0,
    cost_price: 0,
    selling_price: 0,
    stock: 0,
    min_stock: 5,
    size_type: "alpha" as "alpha" | "numeric",
    sizes: "S,M,L,XL",
    colors: "",
    description: "",
    image_url: "",
  };
  const fromInitial = (p: InventoryProduct) => ({
    name: p.name,
    category: p.category,
    newCategory: "",
    variant: p.variant ?? "",
    brand: p.brand ?? "",
    sku: p.sku ?? "",
    hsn_code: p.hsn_code ?? "",
    gst_pct: Number(p.gst_pct ?? 0),
    cost_price: Number(p.cost_price),
    selling_price: Number(p.selling_price),
    stock: p.stock,
    min_stock: p.min_stock ?? 5,
    size_type: ((p.size_type as "alpha" | "numeric" | undefined) ?? "alpha"),
    sizes: (p.sizes ?? []).join(","),
    colors: (p.colors ?? []).join(","),
    description: p.description ?? "",
    image_url: p.image_url ?? "",
  });
  const [form, setForm] = useState(initial ? fromInitial(initial) : emptyForm);

  const save = useMutation({
    mutationFn: async () => {
      const category = form.newCategory.trim() || form.category.trim() || "General";
      const payload = {
        name: form.name.trim(),
        category,
        variant: form.variant.trim() || null,
        brand: form.brand.trim() || null,
        sku: form.sku.trim() || null,
        hsn_code: form.hsn_code.trim() || null,
        gst_pct: Number(form.gst_pct) || 0,
        cost_price: Number(form.cost_price) || 0,
        selling_price: Number(form.selling_price) || 0,
        stock: Number(form.stock) || 0,
        min_stock: Number(form.min_stock) || 0,
        size_type: form.size_type,
        sizes: form.sizes.split(",").map((s) => s.trim()).filter(Boolean),
        colors: form.colors.split(",").map((s) => s.trim()).filter(Boolean),
        description: form.description.trim() || null,
        image_url: form.image_url.trim() || null,
      };
      if (!payload.name) throw new Error("Name required");

      // For new products: initialize per-size stock evenly across sizes so the
      // sale trigger has a map to decrement.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const insertPayload: any = { ...payload };
      if (!initial && payload.sizes.length && payload.stock > 0) {
        const per = Math.floor(payload.stock / payload.sizes.length);
        const remainder = payload.stock - per * payload.sizes.length;
        const map: Record<string, number> = {};
        payload.sizes.forEach((s, i) => {
          map[s] = per + (i < remainder ? 1 : 0);
        });
        insertPayload.stock_by_size = map;
      }

      if (initial) {
        const { error } = await supabase
          .from("products")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update(payload as any)
          .eq("id", initial.id);
        if (error) throw error;
        await logInventoryActivity({
          product_id: initial.id,
          product_name: payload.name,
          action: "edited",
          note: `Updated product details`,
        });
      } else {
        const { data, error } = await supabase
          .from("products")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert(insertPayload as any)
          .select()
          .single();
        if (error) throw error;
        await logInventoryActivity({
          product_id: data?.id ?? null,
          product_name: payload.name,
          action: "created",
          quantity: payload.stock,
          note: `New product · ${category}`,
        });
        if (form.newCategory.trim() && !existingCategories.includes(form.newCategory.trim())) {
          await logInventoryActivity({
            product_name: form.newCategory.trim(),
            action: "category_added",
            note: `New category: ${form.newCategory.trim()}`,
          });
        }
      }
    },
    onSuccess: () => {
      toast.success(initial ? "Product updated" : "Product added");
      qc.invalidateQueries({ queryKey: ["inventory-products"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["inventory-activity"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
        else setForm(initial ? fromInitial(initial) : emptyForm);
      }}
    >
      <DialogContent className="glass max-h-[90vh] overflow-y-auto border-[#d4af37]/30 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {initial ? "Edit Product" : "New Product"}
          </DialogTitle>
        </DialogHeader>
        <form
          className="mt-2 grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <F label="Product Name" className="sm:col-span-2">
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="border-white/10 bg-white/5"
              placeholder="Oversized Tee"
            />
          </F>
          <F label="Category">
            <Select
              value={form.category}
              onValueChange={(v) => setForm({ ...form, category: v })}
            >
              <SelectTrigger className="border-white/10 bg-white/5">
                <SelectValue placeholder="Choose category" />
              </SelectTrigger>
              <SelectContent>
                {existingCategories.length === 0 && (
                  <SelectItem value="General">General</SelectItem>
                )}
                {existingCategories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </F>
          <F label="Or add new category">
            <Input
              value={form.newCategory}
              onChange={(e) => setForm({ ...form, newCategory: e.target.value })}
              placeholder="Jackets"
              className="border-white/10 bg-white/5"
            />
          </F>
          <F label="Type / Category / Color" className="sm:col-span-2">
            <Input
              value={form.variant}
              onChange={(e) => setForm({ ...form, variant: e.target.value })}
              placeholder="e.g. Orange Textured · Linen · Printed"
              className="border-white/10 bg-white/5"
            />
          </F>
          <F label="Brand">
            <Input
              value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
              className="border-white/10 bg-white/5"
              placeholder="Kaal Vastr"
            />
          </F>
          <F label="SKU">
            <Input
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              className="border-white/10 bg-white/5"
              placeholder="KV-OT-001"
            />
          </F>
          <F label="HSN Code (GST)">
            <Input
              value={form.hsn_code}
              onChange={(e) => setForm({ ...form, hsn_code: e.target.value })}
              className="border-white/10 bg-white/5"
              placeholder="6109"
            />
          </F>
          <F label="GST %">
            <Input
              type="number"
              min={0}
              value={form.gst_pct}
              onChange={(e) => setForm({ ...form, gst_pct: Number(e.target.value) })}
              className="border-white/10 bg-white/5"
            />
          </F>
          <F label="Cost Price (₹)">
            <Input
              type="number"
              min={0}
              value={form.cost_price}
              onChange={(e) => setForm({ ...form, cost_price: Number(e.target.value) })}
              className="border-white/10 bg-white/5"
            />
          </F>
          <F label="Selling Price (₹)">
            <Input
              type="number"
              min={0}
              value={form.selling_price}
              onChange={(e) => setForm({ ...form, selling_price: Number(e.target.value) })}
              className="border-white/10 bg-white/5"
            />
          </F>
          <F label="Quantity in Stock">
            <Input
              type="number"
              min={0}
              value={form.stock}
              onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
              className="border-white/10 bg-white/5"
            />
          </F>
          <F label="Minimum Stock Alert">
            <Input
              type="number"
              min={0}
              value={form.min_stock}
              onChange={(e) => setForm({ ...form, min_stock: Number(e.target.value) })}
              className="border-white/10 bg-white/5"
            />
          </F>
          <F label="Size Type">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    size_type: "alpha",
                    sizes: form.sizes && form.size_type === "alpha" ? form.sizes : "XS,S,M,L,XL,XXL",
                  })
                }
                className={cn(
                  "flex-1 rounded-md border px-3 py-2 text-xs font-medium transition",
                  form.size_type === "alpha"
                    ? "border-foreground bg-secondary text-foreground"
                    : "border-border bg-transparent text-muted-foreground hover:bg-secondary/40",
                )}
              >
                Alphabetical
                <span className="ml-1 text-[10px] text-muted-foreground">(XS–XXL)</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    size_type: "numeric",
                    sizes: form.sizes && form.size_type === "numeric" ? form.sizes : "28,30,32,34,36,38,40",
                  })
                }
                className={cn(
                  "flex-1 rounded-md border px-3 py-2 text-xs font-medium transition",
                  form.size_type === "numeric"
                    ? "border-foreground bg-secondary text-foreground"
                    : "border-border bg-transparent text-muted-foreground hover:bg-secondary/40",
                )}
              >
                Numeric
                <span className="ml-1 text-[10px] text-muted-foreground">(28–44)</span>
              </button>
            </div>
          </F>
          <F label="Sizes (comma separated)">
            <Input
              value={form.sizes}
              onChange={(e) => setForm({ ...form, sizes: e.target.value })}
              className="border-white/10 bg-white/5"
              placeholder={form.size_type === "numeric" ? "28,30,32,34" : "S,M,L,XL"}
            />
          </F>
          <F label="Colors (comma separated)">
            <Input
              value={form.colors}
              onChange={(e) => setForm({ ...form, colors: e.target.value })}
              className="border-white/10 bg-white/5"
              placeholder="Black, White, Beige"
            />
          </F>
          <F label="Product Image URL" className="sm:col-span-2">
            <Input
              value={form.image_url}
              onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              className="border-white/10 bg-white/5"
              placeholder="https://…"
            />
          </F>
          <F label="Description" className="sm:col-span-2">
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm"
              placeholder="Premium 240 GSM cotton oversized fit…"
            />
          </F>
          <Button
            type="submit"
            disabled={save.isPending}
            className="sm:col-span-2 h-11 bg-gradient-to-r from-[#f0d67a] to-[#d4af37] text-[#1a1408]"
          >
            {save.isPending ? "Saving…" : initial ? "Update Product" : "Add Product"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function F({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label className="text-xs uppercase tracking-widest text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

/* ---------------- STOCK DIALOG ---------------- */

function StockDialog({
  open,
  product,
  mode,
  products,
  onClose,
}: {
  open: boolean;
  product: InventoryProduct | null;
  mode: "add" | "reduce";
  products: InventoryProduct[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [productId, setProductId] = useState(product?.id ?? "");
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");

  const selected = products.find((p) => p.id === productId) ?? product;
  const sign = mode === "add" ? 1 : -1;

  const mutate = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Choose a product");
      const current = { ...(selected.stock_by_size ?? {}) } as Record<string, number>;
      // ensure all sizes present in map
      for (const s of selected.sizes ?? []) {
        current[s] = Number(current[s] ?? 0);
      }
      let touched = 0;
      for (const [size, delta] of Object.entries(deltas)) {
        const d = Number(delta) || 0;
        if (!d) continue;
        touched += Math.abs(d);
        current[size] = Math.max(0, Number(current[size] ?? 0) + sign * d);
      }
      if (touched === 0) throw new Error("Enter quantity for at least one size");
      const total = Object.values(current).reduce((a, n) => a + Number(n), 0);
      const { error } = await supabase
        .from("products")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ stock_by_size: current, stock: total } as any)
        .eq("id", selected.id);
      if (error) throw error;
      await logInventoryActivity({
        product_id: selected.id,
        product_name: selected.name,
        action: mode === "add" ? "stock_added" : "stock_reduced",
        quantity: sign * touched,
        note:
          (note.trim() ? note.trim() + " · " : "") +
          Object.entries(deltas)
            .filter(([, v]) => Number(v))
            .map(([s, v]) => `${s}: ${sign > 0 ? "+" : "−"}${Math.abs(Number(v))}`)
            .join(", "),
      });
    },
    onSuccess: () => {
      toast.success(mode === "add" ? "Stock added" : "Stock reduced");
      qc.invalidateQueries({ queryKey: ["inventory-products"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["inventory-activity"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
        else {
          setProductId(product?.id ?? "");
          setDeltas({});
          setNote("");
        }
      }}
    >
      <DialogContent className="border-border bg-card">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {mode === "add" ? "Add Stock" : "Reduce Stock"}
          </DialogTitle>
        </DialogHeader>
        <form
          className="mt-2 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutate.mutate();
          }}
        >
          <F label="Product">
            <Select
              value={productId}
              onValueChange={(v) => {
                setProductId(v);
                setDeltas({});
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {p.stock} total
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </F>

          {selected && (
            <div>
              <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Quantity by size
              </Label>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(selected.sizes ?? []).map((s) => {
                  const current = Number(selected.stock_by_size?.[s] ?? 0);
                  const delta = Number(deltas[s] ?? 0);
                  const next = Math.max(0, current + sign * delta);
                  return (
                    <div key={s} className="rounded-md border border-border bg-secondary/30 p-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{s}</span>
                        <span className="text-muted-foreground">
                          {current} → <span className="text-foreground">{next}</span>
                        </span>
                      </div>
                      <Input
                        type="number"
                        min={0}
                        placeholder="0"
                        value={deltas[s] ?? ""}
                        onChange={(e) =>
                          setDeltas({ ...deltas, [s]: Math.max(0, Number(e.target.value)) })
                        }
                        className="mt-1.5 h-8 text-sm"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <F label="Note (optional)">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Received from supplier / damaged / return…"
            />
          </F>

          <Button type="submit" disabled={mutate.isPending || !selected} className="h-9 w-full">
            {mutate.isPending ? "Saving…" : `${mode === "add" ? "Add" : "Reduce"} Stock`}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- ACTIVITY TAB ---------------- */

function InventoryActivityLog({ activity }: { activity: InventoryActivity[] }) {
  return (
    <GlassCard className="overflow-x-auto p-0">
      <table className="w-full min-w-[800px] text-sm">
        <thead>
          <tr className="border-b border-white/5 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
            <th className="p-4">When</th>
            <th>User</th>
            <th>Action</th>
            <th>Product</th>
            <th className="text-right">Qty</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {activity.length === 0 && (
            <tr>
              <td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                No inventory activity yet.
              </td>
            </tr>
          )}
          {activity.map((a) => (
            <tr key={a.id} className="border-b border-white/5">
              <td className="p-4 text-xs">
                <div>{new Date(a.created_at).toLocaleDateString("en-IN")}</div>
                <div className="text-muted-foreground">
                  {new Date(a.created_at).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </td>
              <td className="text-xs text-muted-foreground">{a.user_email ?? "—"}</td>
              <td>
                <span className="rounded-full border border-[#d4af37]/25 px-2 py-0.5 text-[10px] uppercase tracking-widest text-[#f0d67a]">
                  {a.action.replace(/_/g, " ")}
                </span>
              </td>
              <td>{a.product_name}</td>
              <td
                className={cn(
                  "text-right font-money",
                  a.quantity > 0 && "text-emerald-300",
                  a.quantity < 0 && "text-rose-300",
                )}
              >
                {a.quantity > 0 ? `+${a.quantity}` : a.quantity}
              </td>
              <td className="text-xs text-muted-foreground">{a.note ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </GlassCard>
  );
}

/* ---------------- ANALYTICS TAB ---------------- */

function InventoryAnalytics({
  products,
  soldByName,
  revenueByCategory,
  sales,
}: {
  products: InventoryProduct[];
  soldByName: Map<string, number>;
  revenueByCategory: { name: string; value: number }[];
  sales: Sale[];
}) {
  const { hidden } = usePrivacy();
  const best = [...soldByName.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, qty]) => ({ name, qty }));
  const slow = products
    .map((p) => ({ name: p.name, qty: soldByName.get(p.name) ?? 0 }))
    .sort((a, b) => a.qty - b.qty)
    .slice(0, 6);
  const stockDist = products
    .map((p) => ({ name: p.name, value: p.stock }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const monthly = useMemo(() => {
    const now = new Date();
    const buckets: { month: string; units: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString("en-IN", { month: "short" });
      let units = 0;
      for (const s of sales) {
        if (s.is_returned) continue;
        const sd = new Date(s.created_at);
        if (sd.getMonth() === d.getMonth() && sd.getFullYear() === d.getFullYear()) {
          units += s.quantity;
        }
      }
      buckets.push({ month: label, units });
    }
    return buckets;
  }, [sales]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <GlassCard>
        <h3 className="font-display text-xl">Best Sellers</h3>
        <p className="text-xs text-muted-foreground">Top units sold</p>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={best}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" stroke="#7a736a" fontSize={10} />
              <YAxis stroke="#7a736a" fontSize={10} />
              <Tooltip
                contentStyle={{
                  background: "rgba(15,13,10,0.9)",
                  border: "1px solid rgba(212,175,55,0.3)",
                  borderRadius: 12,
                }}
              />
              <Bar dataKey="qty" fill="#f0d67a" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      <GlassCard delay={0.05}>
        <h3 className="font-display text-xl">Slow Movers</h3>
        <p className="text-xs text-muted-foreground">Least sold products</p>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={slow}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" stroke="#7a736a" fontSize={10} />
              <YAxis stroke="#7a736a" fontSize={10} />
              <Tooltip
                contentStyle={{
                  background: "rgba(15,13,10,0.9)",
                  border: "1px solid rgba(212,175,55,0.3)",
                  borderRadius: 12,
                }}
              />
              <Bar dataKey="qty" fill="#a37e12" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      <GlassCard delay={0.1}>
        <h3 className="font-display text-xl">Category-wise Sales</h3>
        <p className="text-xs text-muted-foreground">
          {hidden ? "Revenue hidden" : "Revenue by category"}
        </p>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={revenueByCategory}
                dataKey="value"
                nameKey="name"
                outerRadius={90}
                label={hidden ? false : (e) => e.name}
              >
                {revenueByCategory.map((_, i) => (
                  <Cell key={i} fill={GOLD[i % GOLD.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "rgba(15,13,10,0.9)",
                  border: "1px solid rgba(212,175,55,0.3)",
                  borderRadius: 12,
                }}
                formatter={(v: number) => (hidden ? "•••••••" : `₹${v.toLocaleString("en-IN")}`)}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      <GlassCard delay={0.15}>
        <h3 className="font-display text-xl">Stock Distribution</h3>
        <p className="text-xs text-muted-foreground">Units in warehouse</p>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={stockDist}
                dataKey="value"
                nameKey="name"
                outerRadius={90}
                label={(e) => e.name}
              >
                {stockDist.map((_, i) => (
                  <Cell key={i} fill={GOLD[i % GOLD.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "rgba(15,13,10,0.9)",
                  border: "1px solid rgba(212,175,55,0.3)",
                  borderRadius: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      <GlassCard className="lg:col-span-2" delay={0.2}>
        <h3 className="font-display text-xl">Monthly Stock Movement</h3>
        <p className="text-xs text-muted-foreground">Units sold per month</p>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" stroke="#7a736a" fontSize={11} />
              <YAxis stroke="#7a736a" fontSize={11} />
              <Tooltip
                contentStyle={{
                  background: "rgba(15,13,10,0.9)",
                  border: "1px solid rgba(212,175,55,0.3)",
                  borderRadius: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="units"
                stroke="#f0d67a"
                strokeWidth={2}
                dot={{ fill: "#d4af37" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>
    </div>
  );
}