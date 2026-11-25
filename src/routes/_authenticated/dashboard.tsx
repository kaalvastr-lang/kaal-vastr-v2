import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  LayoutDashboard,
  PlusCircle,
  Package,
  Receipt,
  LogOut,
  IndianRupee,
  ShoppingBag,
  TrendingUp,
  TrendingDown,
  CalendarRange,
  Wallet,
  Search,
  Trash2,
  Pencil,
  Sparkles,
  Eye,
  EyeOff,
  Boxes,
  BarChart3,
  Send,
  Link as LinkIcon,
  Plus,
  Settings as SettingsIcon,
  PackagePlus,
  ScanBarcode,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Area,
  AreaChart,
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
import { InvoiceModal } from "@/components/kv/InvoiceModal";
import { StockInSection } from "@/components/kv/stock-in/StockInSection";
import { ScanBillingSection } from "@/components/kv/scan-billing/ScanBillingSection";
import { BillingModeSwitch } from "@/components/kv/barcode/BillingModeSwitch";
import {
  generateInvoiceNumber,
  generatePublicToken,
  invoicePublicUrl,
  whatsappLink,
  smsHref,
  type InvoiceLine,
  type InvoiceData,
} from "@/lib/kv/invoice";
import { cn } from "@/lib/utils";
import { PrivacyProvider, Money, usePrivacy } from "@/lib/kv/privacy";
import { InventorySection } from "@/components/kv/inventory/InventorySection";
import { AnalyticsSection } from "@/components/kv/AnalyticsSection";
import { logInventoryActivity } from "@/lib/kv/inventory";
import {
  useBusinessSettings,
  DEFAULT_BUSINESS,
  BUSINESS_QUERY_KEY,
  type BusinessSettings,
} from "@/lib/kv/businessSettings";
import { isWhatsAppApiConfigured } from "@/lib/kv/whatsapp";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Kaal Vastr" },
      { name: "description", content: "Live POS, inventory and analytics for Kaal Vastr." },
    ],
  }),
  component: DashboardPage,
});

type Product = {
  id: string;
  name: string;
  category: string;
  variant?: string | null;
  cost_price: number;
  selling_price: number;
  stock: number;
  sizes: string[];
  gst_pct?: number;
  stock_by_size?: Record<string, number> | null;
  size_type?: string;
};

type Sale = {
  id: string;
  invoice_number: string;
  public_token: string;
  pdf_url?: string | null;
  customer_name: string;
  customer_mobile: string;
  product_id: string | null;
  product_name: string;
  variant?: string | null;
  size: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  discount: number;
  total_amount: number;
  profit: number;
  payment_method: string;
  payment_status: string;
  is_returned: boolean;
  created_at: string;
};

const rupee = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

type Section =
  | "overview"
  | "new-sale"
  | "analytics"
  | "inventory"
  | "products"
  | "stock-in"
  | "scan-billing"
  | "sales"
  | "settings";

function DashboardPage() {
  return (
    <PrivacyProvider>
      <DashboardInner />
    </PrivacyProvider>
  );
}

function DashboardInner() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [section, setSection] = useState<Section>("overview");
  const [activeInvoice, setActiveInvoice] = useState<InvoiceData | null>(null);
  const [productDialogOpen, setProductDialogOpen] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data as Product[];
    },
  });

  const { data: sales = [] } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as Sale[];
    },
  });

  const metrics = useMemo(() => computeMetrics(sales), [sales]);

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const navItems: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "new-sale", label: "New Sale", icon: PlusCircle },
    { id: "analytics", label: "Sales Analytics", icon: BarChart3 },
    { id: "inventory", label: "Inventory", icon: Boxes },
    { id: "products", label: "Products", icon: Package },
    { id: "stock-in", label: "Stock In", icon: PackagePlus },
    { id: "scan-billing", label: "Scan Billing", icon: ScanBarcode },
    { id: "sales", label: "Sales", icon: Receipt },
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ];

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="glass sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between rounded-none border-r border-[#d4af37]/15 p-6 lg:flex">
        <div>
          <div className="mb-10 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#d4af37]/40 bg-black/50">
              <span className="gold-text font-display text-lg tracking-widest">KV</span>
            </div>
            <div>
              <p className="font-display text-lg">Kaal Vastr</p>
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                Command Centre
              </p>
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  className={cn(
                    "group relative flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition-all",
                    active
                      ? "bg-gradient-to-r from-[#d4af37]/15 to-transparent text-[#f0d67a]"
                      : "text-muted-foreground hover:bg-white/5 hover:text-white",
                  )}
                >
                  {active && (
                    <motion.div
                      layoutId="nav-active"
                      className="absolute left-0 top-1/2 h-6 w-[2px] -translate-y-1/2 rounded-full bg-gradient-to-b from-[#f0d67a] to-[#a37e12]"
                    />
                  )}
                  <Icon className="h-4 w-4" />
                  <span className="tracking-wide">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-1">
          <PrivacyToggleButton />
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-muted-foreground transition hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="glass fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-[#d4af37]/15 p-4 lg:hidden">
        <div className="flex items-center gap-2">
          <span className="gold-text font-display text-lg tracking-widest">KV</span>
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            {navItems.find((n) => n.id === section)?.label}
          </span>
        </div>
        <select
          value={section}
          onChange={(e) => setSection(e.target.value as Section)}
          className="rounded-lg border border-white/10 bg-black/40 px-3 py-1 text-sm"
        >
          {navItems.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </select>
      </div>

      {/* Main */}
      <main className="flex-1 px-4 pb-16 pt-24 sm:px-8 lg:pt-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
          >
            {section === "overview" && (
              <Overview
                metrics={metrics}
                sales={sales}
                products={products}
                onOpenProducts={() => setSection("products")}
                onOpenSales={() => setSection("sales")}
                onViewInvoice={(sale) => setActiveInvoice(saleToInvoice(sale, sales))}
                onAddProduct={() => setProductDialogOpen(true)}
                onInvoiceCreated={(inv) => setActiveInvoice(inv)}
              />
            )}
            {section === "new-sale" && (
              <>
                <BillingModeSwitch value="new-sale" onChange={(m) => setSection(m)} />
                <NewSale
                  products={products}
                  onCreated={(inv) => {
                    setActiveInvoice(inv);
                    setSection("overview");
                  }}
                />
              </>
            )}
            {section === "scan-billing" && (
              <ScanBillingSection
                onCreated={(inv) => setActiveInvoice(inv)}
                onModeChange={(m) => setSection(m)}
              />
            )}
            {section === "stock-in" && <StockInSection />}
            {section === "inventory" && <InventorySection />}
            {section === "analytics" && <AnalyticsSection />}
            {section === "products" && <ProductsSection products={products} />}
            {section === "sales" && (
              <SalesSection
                sales={sales}
                onViewInvoice={(sale) => setActiveInvoice(saleToInvoice(sale, sales))}
              />
            )}
            {section === "settings" && <SettingsSection />}
          </motion.div>
        </AnimatePresence>
      </main>

      <InvoiceModal invoice={activeInvoice} onClose={() => setActiveInvoice(null)} />
      <ProductDialog open={productDialogOpen} onClose={() => setProductDialogOpen(false)} initial={null} />
    </div>
  );
}

function saleToInvoice(sale: Sale, allSales?: Sale[]): InvoiceData {
  // Group by invoice_number so a multi-item invoice shows every line.
  const group = (allSales ?? [sale]).filter(
    (s) => s.invoice_number === sale.invoice_number,
  );
  const rows = group.length ? group : [sale];
  const items: InvoiceLine[] = rows.map((r) => ({
    productName: r.product_name,
    variant: r.variant ?? null,
    size: r.size,
    quantity: r.quantity,
    unitPrice: Number(r.unit_price),
    discount: Number(r.discount),
    lineTotal: Number(r.total_amount),
  }));
  const subtotal = items.reduce((a, i) => a + i.unitPrice * i.quantity, 0);
  const discount = items.reduce((a, i) => a + i.discount, 0);
  const total = items.reduce((a, i) => a + i.lineTotal, 0);
  const first = rows[0];
  return {
    invoiceNumber: first.invoice_number,
    createdAt: first.created_at,
    customerName: first.customer_name,
    customerMobile: first.customer_mobile,
    items,
    productName: first.product_name,
    size: first.size,
    quantity: first.quantity,
    unitPrice: Number(first.unit_price),
    discount,
    subtotal,
    total,
    paymentMethod: first.payment_method,
    publicToken: first.public_token,
    publicUrl: first.public_token ? invoicePublicUrl(first.public_token) : undefined,
  };
}

function computeMetrics(sales: Sale[]) {
  const now = new Date();
  const today = now.toDateString();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - 6);

  const todaySales = sales.filter((s) => new Date(s.created_at).toDateString() === today);
  const monthSales = sales.filter((s) => new Date(s.created_at) >= startOfMonth);
  const weekSales = sales.filter((s) => new Date(s.created_at) >= startOfWeek);

  const sum = (arr: Sale[], k: (s: Sale) => number) => arr.reduce((a, s) => a + k(s), 0);

  const todayTotal = sum(todaySales.filter((s) => !s.is_returned), (s) => Number(s.total_amount));
  const todayProfit = sum(todaySales.filter((s) => !s.is_returned), (s) => Number(s.profit));
  const todayLoss = sum(todaySales.filter((s) => s.is_returned), (s) => Number(s.total_amount));
  const todayItems = sum(todaySales.filter((s) => !s.is_returned), (s) => s.quantity);
  const billsToday = new Set(
    todaySales.filter((s) => !s.is_returned).map((s) => s.invoice_number),
  ).size;

  const monthTotal = sum(monthSales.filter((s) => !s.is_returned), (s) => Number(s.total_amount));
  const monthProfit = sum(monthSales.filter((s) => !s.is_returned), (s) => Number(s.profit));

  const weeklyTotal = sum(weekSales.filter((s) => !s.is_returned), (s) => Number(s.total_amount));
  const totalProfit = sum(sales.filter((s) => !s.is_returned), (s) => Number(s.profit));
  const totalLoss = sum(sales.filter((s) => s.is_returned), (s) => Number(s.total_amount));

  const paidSales = sales.filter((s) => !s.is_returned);
  const avgOrder = paidSales.length ? sum(paidSales, (s) => Number(s.total_amount)) / paidSales.length : 0;

  // Best selling product
  const byProduct = new Map<string, number>();
  for (const s of paidSales) {
    byProduct.set(s.product_name, (byProduct.get(s.product_name) || 0) + s.quantity);
  }
  const bestProducts = [...byProduct.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, qty]) => ({ name, qty }));
  const bestSelling = bestProducts[0]?.name ?? "—";

  // Uniq customers
  const customers = new Set(sales.map((s) => s.customer_mobile)).size;

  // Trend for last 14 days
  const trend: { date: string; total: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    const key = d.toDateString();
    const dayTotal = sum(
      sales.filter((s) => !s.is_returned && new Date(s.created_at).toDateString() === key),
      (s) => Number(s.total_amount),
    );
    trend.push({
      date: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      total: dayTotal,
    });
  }

  return {
    todayTotal,
    todayProfit,
    todayLoss,
    todayItems,
    billsToday,
    monthTotal,
    monthProfit,
    weeklyTotal,
    totalProfit,
    totalLoss,
    avgOrder,
    bestProducts,
    bestSelling,
    customers,
    trend,
  };
}

/* ---------------- OVERVIEW ---------------- */

function Overview({
  metrics,
  sales,
  products,
  onOpenProducts,
  onOpenSales,
  onViewInvoice,
  onAddProduct,
  onInvoiceCreated,
}: {
  metrics: ReturnType<typeof computeMetrics>;
  sales: Sale[];
  products: Product[];
  onOpenProducts: () => void;
  onOpenSales: () => void;
  onViewInvoice: (s: Sale) => void;
  onAddProduct: () => void;
  onInvoiceCreated: (inv: InvoiceData) => void;
}) {
  const recent = sales.slice(0, 6);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <PrivacyControlsCard />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Overview</p>
          <h1 className="font-display mt-2 text-4xl">
            Good {greeting()}, <span className="gold-text">Owner</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here is how Kaal Vastr is performing today.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={onAddProduct}
            className="bg-gradient-to-r from-[#f0d67a] to-[#d4af37] text-[#1a1408] hover:opacity-90"
          >
            <PlusCircle className="mr-2 h-4 w-4" /> Add Collection
          </Button>
          <Button variant="outline" onClick={onOpenProducts} className="border-white/10">
            <Package className="mr-2 h-4 w-4" /> Products
          </Button>
          <Button variant="outline" onClick={onOpenSales} className="border-white/10">
            <Receipt className="mr-2 h-4 w-4" /> Sales
          </Button>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        <PrivacyStatCard label="Today's Sales" value={metrics.todayTotal} icon={IndianRupee} delay={0} />
        <StatCard label="Bills Today" value={String(metrics.billsToday)} icon={Receipt} accent="neutral" delay={0.02} />
        <StatCard label="Clothes Sold Today" value={String(metrics.todayItems)} icon={ShoppingBag} accent="neutral" delay={0.05} />
        <PrivacyStatCard label="Today's Profit" value={metrics.todayProfit} icon={TrendingUp} accent="positive" delay={0.1} />
        <PrivacyStatCard label="Returns / Loss" value={metrics.todayLoss} icon={TrendingDown} accent="negative" delay={0.15} />
        <PrivacyStatCard label="Monthly Revenue" value={metrics.monthTotal} icon={CalendarRange} delay={0.2} />
        <PrivacyStatCard label="Monthly Profit" value={metrics.monthProfit} icon={Wallet} accent="positive" delay={0.25} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2" delay={0.1}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-display text-xl">Sales Trend</h3>
              <p className="text-xs text-muted-foreground">Last 14 days</p>
            </div>
            <span className="font-money text-xs uppercase tracking-widest text-[#f0d67a]">
              <Money value={metrics.weeklyTotal} /> this week
            </span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics.trend}>
                <defs>
                  <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f0d67a" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#d4af37" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" stroke="#7a736a" fontSize={11} />
                <YAxis stroke="#7a736a" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: "rgba(15,13,10,0.9)",
                    border: "1px solid rgba(212,175,55,0.3)",
                    borderRadius: 12,
                    color: "#f0d67a",
                  }}
                />
                <Area type="monotone" dataKey="total" stroke="#f0d67a" strokeWidth={2} fill="url(#gold)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard delay={0.15}>
          <h3 className="font-display text-xl">Best Sellers</h3>
          <p className="text-xs text-muted-foreground">By quantity sold</p>
          <div className="mt-4 space-y-3">
            {metrics.bestProducts.length === 0 && (
              <p className="text-sm text-muted-foreground">No sales yet.</p>
            )}
            {metrics.bestProducts.map((p, i) => (
              <div key={p.name} className="flex items-center gap-3">
                <span className="gold-text font-money text-lg">{i + 1}</span>
                <div className="flex-1">
                  <p className="text-sm">{p.name}</p>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full bg-gradient-to-r from-[#f0d67a] to-[#a37e12]"
                      style={{
                        width: `${(p.qty / (metrics.bestProducts[0]?.qty || 1)) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">{p.qty}×</span>
              </div>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-white/5 pt-4 text-xs">
            <div>
              <p className="uppercase tracking-widest text-muted-foreground">Avg Order</p>
              <Money value={metrics.avgOrder} className="gold-text mt-1 block text-xl" />
            </div>
            <div>
              <p className="uppercase tracking-widest text-muted-foreground">Customers</p>
              <p className="gold-text font-money mt-1 text-xl">{metrics.customers}</p>
            </div>
          </div>
        </GlassCard>
          </div>

      <GlassCard delay={0.2}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-display text-xl">Recent Sales</h3>
            <p className="text-xs text-muted-foreground">Latest transactions across your boutique</p>
          </div>
          <Button variant="ghost" onClick={onOpenSales} className="text-[#f0d67a]">
            View all →
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="py-3">Invoice</th>
                <th>Customer</th>
                <th>Product</th>
                <th className="text-center">Qty</th>
                <th className="text-right">Amount</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    <Sparkles className="mx-auto mb-2 h-6 w-6 text-[#d4af37]/60" />
                    No sales yet — create your first invoice.
                  </td>
                </tr>
              )}
              {recent.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => onViewInvoice(s)}
                  className="cursor-pointer border-b border-white/5 transition hover:bg-white/5"
                >
                  <td className="py-3 font-mono text-xs text-[#f0d67a]">{s.invoice_number}</td>
                  <td>{s.customer_name}</td>
                  <td>{s.product_name} <span className="text-xs text-muted-foreground">({s.size})</span></td>
                  <td className="text-center">{s.quantity}</td>
                  <td className="text-right">
                    <Money value={Number(s.total_amount)} />
                  </td>
                  <td>
                    <span className="rounded-full border border-[#d4af37]/25 px-2 py-0.5 text-xs">
                      {s.payment_method}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
        </div>

        <div className="xl:sticky xl:top-6 xl:self-start">
          <NewSale products={products} onCreated={onInvoiceCreated} compact />
        </div>
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

function PrivacyToggleButton() {
  const { hidden, toggle } = usePrivacy();
  return (
    <button
      onClick={toggle}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition",
        hidden
          ? "bg-[#d4af37]/10 text-[#f0d67a] hover:bg-[#d4af37]/15"
          : "text-muted-foreground hover:bg-white/5 hover:text-white",
      )}
      title={hidden ? "Show financial data" : "Hide financial data"}
    >
      {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      <span className="tracking-wide">{hidden ? "Show Financials" : "Hide Financials"}</span>
    </button>
  );
}

function PrivacyControlsCard() {
  const { hidden, toggle } = usePrivacy();
  return (
    <GlassCard className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-[#d4af37]/25 bg-black/40 p-2.5">
          {hidden ? (
            <EyeOff className="h-5 w-5 text-[#f0d67a]" />
          ) : (
            <Eye className="h-5 w-5 text-[#f0d67a]" />
          )}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.35em] text-muted-foreground">
            Privacy Controls
          </p>
          <p className="mt-1 text-sm">
            {hidden
              ? "Financial figures are hidden from customer view."
              : "Financial figures are visible on screen."}
          </p>
        </div>
      </div>
      <Button
        onClick={toggle}
        variant="outline"
        className={cn(
          "border-white/10",
          hidden && "border-[#d4af37]/40 text-[#f0d67a] hover:bg-[#d4af37]/10",
        )}
      >
        {hidden ? (
          <>
            <Eye className="mr-2 h-4 w-4" /> Show Financial Data
          </>
        ) : (
          <>
            <EyeOff className="mr-2 h-4 w-4" /> Hide Financial Data
          </>
        )}
      </Button>
    </GlassCard>
  );
}

function PrivacyStatCard({
  label,
  value,
  icon,
  accent,
  delay,
}: {
  label: string;
  value: number;
  icon: typeof LayoutDashboard;
  accent?: "positive" | "negative" | "neutral";
  delay?: number;
}) {
  const { hidden } = usePrivacy();
  const display = hidden ? "•••••••" : rupee(value);
  return <StatCard label={label} value={display} icon={icon} accent={accent} delay={delay} />;
}

/* ---------------- NEW SALE ---------------- */

type CartLine = {
  key: string;
  product_id: string;
  size: string;
  variant: string;
  quantity: number;
  unit_price: number;
  discount_value: number;
  discount_mode: "pct" | "fixed";
};

function makeCartLine(): CartLine {
  return {
    key: Math.random().toString(36).slice(2, 9),
    product_id: "",
    size: "",
    variant: "",
    quantity: 1,
    unit_price: 0,
    discount_value: 0,
    discount_mode: "pct",
  };
}

function NewSale({
  products,
  onCreated,
  compact = false,
}: {
  products: Product[];
  onCreated: (invoice: InvoiceData) => void;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const { data: business = DEFAULT_BUSINESS } = useBusinessSettings();
  const [customer, setCustomer] = useState({ name: "", mobile: "" });
  const [lines, setLines] = useState<CartLine[]>([makeCartLine()]);

  const productMap = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  const addLine = () => setLines((l) => [...l, makeCartLine()]);
  const removeLine = (key: string) =>
    setLines((l) => (l.length === 1 ? l : l.filter((x) => x.key !== key)));
  const updateLine = (key: string, patch: Partial<CartLine>) =>
    setLines((l) => l.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const computed = lines.map((line) => {
    const product = line.product_id ? productMap.get(line.product_id) : undefined;
    const subtotal = line.unit_price * line.quantity;
    const val = Math.max(0, Number(line.discount_value) || 0);
    const discount =
      line.discount_mode === "fixed"
        ? Math.min(subtotal, Math.round(val))
        : Math.round((subtotal * Math.min(100, val)) / 100);
    const gstPct = Number(product?.gst_pct ?? 0);
    const taxable = Math.max(0, subtotal - discount);
    const gst = Math.round((taxable * gstPct) / 100);
    const total = taxable + gst;
    const profit = product ? (line.unit_price - product.cost_price) * line.quantity - discount : 0;
    return { line, product, subtotal, discount, gst, gstPct, total, profit };
  });

  const grand = computed.reduce(
    (a, c) => ({
      subtotal: a.subtotal + c.subtotal,
      discount: a.discount + c.discount,
      gst: a.gst + c.gst,
      total: a.total + c.total,
      profit: a.profit + c.profit,
    }),
    { subtotal: 0, discount: 0, gst: 0, total: 0, profit: 0 },
  );

  // One method, or a split such as Cash + UPI (stored as text in sales.payment_method).
  const pay = usePaymentSplit(grand.total);

  const createSale = useMutation({
    mutationFn: async () => {
      if (!customer.name.trim() || !customer.mobile.trim())
        throw new Error("Customer name and mobile are required");
      if (!computed.length) throw new Error("Add at least one product");
      if (pay.error) throw new Error(pay.error);

      const invoice_number = generateInvoiceNumber();
      const public_token = generatePublicToken(10);
      const rows: Array<Record<string, unknown>> = [];

      for (const c of computed) {
        if (!c.product || !c.line.product_id) throw new Error("Choose a product for every row");
        if (!c.line.size) throw new Error(`Choose a size for ${c.product.name}`);
        if (c.line.quantity < 1) throw new Error("Quantity must be at least 1");
        const availableForSize =
          (c.product.stock_by_size?.[c.line.size] as number | undefined) ?? c.product.stock;
        if (availableForSize < c.line.quantity)
          throw new Error(`Not enough stock for ${c.product.name} (${c.line.size})`);

        rows.push({
          invoice_number,
          public_token,
          customer_name: customer.name.trim(),
          customer_mobile: customer.mobile.trim(),
          product_id: c.product.id,
          product_name: c.product.name,
          variant: (c.line.variant?.trim() || c.product.variant || null),
          size: c.line.size,
          quantity: c.line.quantity,
          unit_cost: c.product.cost_price,
          unit_price: c.line.unit_price,
          discount: c.discount,
          total_amount: c.total,
          profit: c.profit,
          payment_method: pay.encoded,
          payment_status: "Paid",
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.from("sales").insert(rows as any).select();
      if (error) {
        console.error("[NewSale] Failed to insert sales rows", { error, rows });
        const code = (error as { code?: string }).code;
        const details = (error as { details?: string }).details;
        const hint = (error as { hint?: string }).hint;
        let friendly = error.message || "Failed to insert invoice";
        if (code === "23505") friendly = "Invoice number already exists — please retry.";
        else if (code === "23502") friendly = `Missing required field: ${details ?? error.message}`;
        else if (code === "23503") friendly = `Invalid product reference: ${details ?? error.message}`;
        else if (code === "42501" || /permission denied|row-level security/i.test(error.message))
          friendly = "Permission denied — please sign in again.";
        throw new Error(`${friendly}${hint ? ` (${hint})` : ""}`);
      }
      if (!data || !data.length) throw new Error("Invoice was not saved (no rows returned).");
      return { sales: data as Sale[], invoice_number, public_token };
    },
    onSuccess: ({ sales: inserted, invoice_number, public_token }) => {
      const items: InvoiceLine[] = inserted.map((r) => ({
        productName: r.product_name,
        variant: r.variant ?? null,
        size: r.size,
        quantity: r.quantity,
        unitPrice: Number(r.unit_price),
        discount: Number(r.discount),
        lineTotal: Number(r.total_amount),
      }));
      const first = inserted[0];
      const invoice: InvoiceData = {
        invoiceNumber: invoice_number,
        createdAt: first.created_at,
        customerName: first.customer_name,
        customerMobile: first.customer_mobile,
        items,
        productName: first.product_name,
        size: first.size,
        quantity: first.quantity,
        unitPrice: Number(first.unit_price),
        discount: items.reduce((a, i) => a + i.discount, 0),
        subtotal: items.reduce((a, i) => a + i.unitPrice * i.quantity, 0),
        gstAmount: grand.gst,
        total: items.reduce((a, i) => a + i.lineTotal, 0),
        paymentMethod: first.payment_method,
        publicToken: public_token,
        publicUrl: invoicePublicUrl(public_token),
      };

      toast.success("Sale recorded", { description: invoice_number });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["inventory-products"] });
      qc.invalidateQueries({ queryKey: ["inventory-sales"] });
      qc.invalidateQueries({ queryKey: ["inventory-activity"] });

      for (const r of inserted) {
        logInventoryActivity({
          product_id: r.product_id,
          product_name: r.product_name,
          action: "sold",
          quantity: -r.quantity,
          note: `Invoice ${invoice_number}`,
        });
      }

      try {
        window.open(whatsappLink(invoice, business), "_blank");
      } catch {
        /* popup blocked */
      }
      const a = document.createElement("a");
      a.href = smsHref(invoice, business);
      a.rel = "noopener";
      a.click();

      onCreated(invoice);
      setLines([makeCartLine()]);
      setCustomer({ name: "", mobile: "" });
    },
    onError: (e) => {
      console.error("[NewSale] createSale error", e);
      const msg = e instanceof Error ? e.message : "Failed to save invoice";
      toast.error("Failed to generate bill", { description: msg });
    },
  });

  return (
    <div className={cn(compact ? "space-y-4" : "mx-auto max-w-5xl space-y-4")}>
      <GlassCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">New Sale</h2>
            <p className="text-xs text-muted-foreground">Add products, generate bill</p>
          </div>
          <div className="rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p>
            <p className="font-money text-lg leading-tight">{rupee(grand.total)}</p>
          </div>
        </div>

        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            createSale.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Customer Name">
              <Input
                required
                value={customer.name}
                onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
              />
            </Field>
            <Field label="Mobile Number">
              <Input
                required
                type="tel"
                value={customer.mobile}
                onChange={(e) => setCustomer({ ...customer, mobile: e.target.value })}
              />
            </Field>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Products
              </Label>
              <Button type="button" variant="outline" size="sm" onClick={addLine} className="h-8">
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Product
              </Button>
            </div>
            <div className="space-y-2">
              {computed.map((c, idx) => (
                <CartLineRow
                  key={c.line.key}
                  index={idx}
                  line={c.line}
                  product={c.product}
                  products={products}
                  discount={c.discount}
                  total={c.total}
                  onChange={(patch) => updateLine(c.line.key, patch)}
                  onRemove={() => removeLine(c.line.key)}
                  canRemove={lines.length > 1}
                />
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_240px]">
            <Field label="Payment Method">
              <PaymentSplitEditor pay={pay} total={grand.total} idPrefix="ns" />
            </Field>
            <div className="rounded-md border border-border bg-secondary/30 p-3 text-sm">
              <Row label="Subtotal"><span className="font-money">{rupee(grand.subtotal)}</span></Row>
              <Row label="Discount"><span className="font-money">− {rupee(grand.discount)}</span></Row>
              <Row label="GST"><span className="font-money">+ {rupee(grand.gst)}</span></Row>
              <div className="mt-2 border-t border-border pt-2">
                <Row label="Grand Total">
                  <span className="font-money text-lg font-semibold">{rupee(grand.total)}</span>
                </Row>
              </div>
            </div>
          </div>

          <Button
            type="submit"
            disabled={createSale.isPending || !products.length}
            className="h-10 w-full font-medium"
          >
            {createSale.isPending ? "Generating…" : "Generate Bill"}
          </Button>
        </form>
      </GlassCard>
    </div>
  );
}

function CartLineRow({
  index,
  line,
  product,
  products,
  discount,
  total,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number;
  line: CartLine;
  product: Product | undefined;
  products: Product[];
  discount: number;
  total: number;
  onChange: (patch: Partial<CartLine>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const sizeStock = (s: string) =>
    (product?.stock_by_size?.[s] as number | undefined) ?? product?.stock ?? 0;
  return (
    <div className="rounded-md border border-border bg-secondary/20 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Item {index + 1}
        </span>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="rounded p-1 text-muted-foreground transition hover:bg-secondary hover:text-rose-400 disabled:opacity-30"
          title="Remove"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-1 min-w-0">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Product</Label>
        <Select
          value={line.product_id}
          onValueChange={(v) => {
            const p = products.find((x) => x.id === v);
            onChange({
              product_id: v,
              size: p?.sizes[0] ?? "",
              variant: p?.variant ?? "",
              unit_price: p ? Number(p.selling_price) : 0,
            });
          }}
        >
          <SelectTrigger className="h-9 w-full">
            <SelectValue placeholder="Product" />
          </SelectTrigger>
          <SelectContent>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
                {p.variant ? ` · ${p.variant}` : ""} · {rupee(Number(p.selling_price))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        </div>
        <div className="space-y-1 min-w-0">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Size</Label>
        <Select
          value={line.size}
          onValueChange={(v) => onChange({ size: v })}
          disabled={!product}
        >
          <SelectTrigger className="h-9 w-full">
            <SelectValue placeholder="Size" />
          </SelectTrigger>
          <SelectContent>
            {(product?.sizes ?? []).map((s) => (
              <SelectItem key={s} value={s}>
                {s} ({sizeStock(s)})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        </div>
        <div className="space-y-1 min-w-0 sm:col-span-2 lg:col-span-5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Type / Category / Color
          </Label>
          <Input
            className="h-9 w-full"
            placeholder="e.g. Orange Textured, Linen, Printed"
            value={line.variant}
            onChange={(e) => onChange({ variant: e.target.value })}
          />
        </div>
        <div className="space-y-1 min-w-0">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Quantity</Label>
        <Input
          type="number"
          min={1}
          className="h-9 w-full"
          placeholder="Qty"
          value={line.quantity}
          onChange={(e) => onChange({ quantity: Math.max(1, Number(e.target.value)) })}
        />
        </div>
        <div className="space-y-1 min-w-0">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Selling Price</Label>
        <Input
          type="number"
          min={0}
          className="h-9 w-full"
          placeholder="Price"
          value={line.unit_price}
          onChange={(e) => onChange({ unit_price: Number(e.target.value) })}
        />
        </div>
        <div className="space-y-1 min-w-0">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Discount ({line.discount_mode === "pct" ? "%" : "₹"})
          </Label>
          <div className="flex gap-1">
            <Input
              type="number"
              min={0}
              max={line.discount_mode === "pct" ? 100 : undefined}
              className="h-9 w-full"
              placeholder="Disc"
              value={line.discount_value}
              onChange={(e) =>
                onChange({ discount_value: Math.max(0, Number(e.target.value)) })
              }
            />
            <button
              type="button"
              onClick={() =>
                onChange({ discount_mode: line.discount_mode === "pct" ? "fixed" : "pct" })
              }
              className="h-9 shrink-0 rounded-md border border-border bg-secondary/40 px-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              title="Toggle % / ₹"
            >
              {line.discount_mode === "pct" ? "%" : "₹"}
            </button>
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>Line discount: <span className="font-money">− {rupee(discount)}</span></span>
        <span>Line total: <span className="font-money text-foreground">{rupee(total)}</span></span>
      </div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label className="text-xs uppercase tracking-widest text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}

/* ---------------- PRODUCTS ---------------- */

function ProductsSection({ products }: { products: Product[] }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Product removed");
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Catalogue</p>
          <h1 className="font-display mt-2 text-4xl">Product Management</h1>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
          className="bg-gradient-to-r from-[#f0d67a] to-[#d4af37] text-[#1a1408] hover:opacity-90"
        >
          <PlusCircle className="mr-2 h-4 w-4" /> Add Product
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.length === 0 && (
          <GlassCard className="sm:col-span-2 lg:col-span-3 text-center">
            <p className="text-sm text-muted-foreground">
              No products yet — add your first one to start selling.
            </p>
          </GlassCard>
        )}
        {products.map((p, i) => (
          <GlassCard key={p.id} delay={i * 0.03}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-[#f0d67a]">{p.category}</p>
                <h3 className="font-display mt-1 text-xl">{p.name}</h3>
                {p.variant && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{p.variant}</p>
                )}
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    setEditing(p);
                    setOpen(true);
                  }}
                  className="rounded-lg p-2 text-muted-foreground transition hover:bg-white/5 hover:text-white"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete "${p.name}"?`)) del.mutate(p.id);
                  }}
                  className="rounded-lg p-2 text-muted-foreground transition hover:bg-red-500/10 hover:text-rose-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="uppercase tracking-widest text-muted-foreground">Cost</p>
                <p className="mt-1 font-money">{rupee(Number(p.cost_price))}</p>
              </div>
              <div>
                <p className="uppercase tracking-widest text-muted-foreground">Price</p>
                <p className="gold-text mt-1 font-money text-lg">{rupee(Number(p.selling_price))}</p>
              </div>
              <div>
                <p className="uppercase tracking-widest text-muted-foreground">Stock</p>
                <p className={cn("mt-1 font-medium", p.stock < 5 && "text-rose-300")}>{p.stock}</p>
              </div>
              <div>
                <p className="uppercase tracking-widest text-muted-foreground">Sizes</p>
                <p className="mt-1">{p.sizes.join(" · ")}</p>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      <ProductDialog open={open} onClose={() => setOpen(false)} initial={editing} />
    </div>
  );
}

function ProductDialog({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial: Product | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => ({
    name: initial?.name ?? "",
    category: initial?.category ?? "General",
    variant: initial?.variant ?? "",
    cost_price: initial ? Number(initial.cost_price) : 0,
    selling_price: initial ? Number(initial.selling_price) : 0,
    stock: initial?.stock ?? 0,
    sizes: (initial?.sizes ?? ["S", "M", "L", "XL"]).join(","),
  }));

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        category: form.category.trim() || "General",
        variant: form.variant.trim() || null,
        cost_price: form.cost_price,
        selling_price: form.selling_price,
        stock: form.stock,
        sizes: form.sizes.split(",").map((s) => s.trim()).filter(Boolean),
      };
      if (!payload.name) throw new Error("Name required");
      if (initial) {
        const { error } = await supabase.from("products").update(payload).eq("id", initial.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(initial ? "Product updated" : "Product added");
      qc.invalidateQueries({ queryKey: ["products"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
        else if (initial)
          setForm({
            name: initial.name,
            category: initial.category,
            variant: initial.variant ?? "",
            cost_price: Number(initial.cost_price),
            selling_price: Number(initial.selling_price),
            stock: initial.stock,
            sizes: initial.sizes.join(","),
          });
        else
          setForm({
            name: "",
            category: "General",
            variant: "",
            cost_price: 0,
            selling_price: 0,
            stock: 0,
            sizes: "S,M,L,XL",
          });
      }}
    >
      <DialogContent className="glass border-[#d4af37]/30">
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
          <Field label="Name" className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border-white/10 bg-white/5" required />
          </Field>
          <Field label="Category">
            <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="border-white/10 bg-white/5" />
          </Field>
          <Field label="Type / Category / Color">
            <Input value={form.variant} onChange={(e) => setForm({ ...form, variant: e.target.value })} className="border-white/10 bg-white/5" placeholder="Orange Textured · Linen · Printed" />
          </Field>
          <Field label="Stock">
            <Input type="number" min={0} value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} className="border-white/10 bg-white/5" />
          </Field>
          <Field label="Cost Price (₹)">
            <Input type="number" min={0} value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: Number(e.target.value) })} className="border-white/10 bg-white/5" />
          </Field>
          <Field label="Selling Price (₹)">
            <Input type="number" min={0} value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: Number(e.target.value) })} className="border-white/10 bg-white/5" />
          </Field>
          <Field label="Sizes (comma separated)" className="sm:col-span-2">
            <Input value={form.sizes} onChange={(e) => setForm({ ...form, sizes: e.target.value })} className="border-white/10 bg-white/5" />
          </Field>
          <Button
            type="submit"
            disabled={save.isPending}
            className="sm:col-span-2 bg-gradient-to-r from-[#f0d67a] to-[#d4af37] text-[#1a1408]"
          >
            {save.isPending ? "Saving…" : initial ? "Update" : "Add product"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- SALES ---------------- */

function SalesSection({
  sales,
  onViewInvoice,
}: {
  sales: Sale[];
  onViewInvoice: (s: Sale) => void;
}) {
  const { data: business = DEFAULT_BUSINESS } = useBusinessSettings();
  const [q, setQ] = useState("");
  const filtered = sales.filter((s) => {
    const t = q.toLowerCase();
    return (
      !t ||
      s.invoice_number.toLowerCase().includes(t) ||
      s.customer_name.toLowerCase().includes(t) ||
      s.customer_mobile.includes(t) ||
      s.product_name.toLowerCase().includes(t)
    );
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Ledger</p>
          <h1 className="font-display mt-2 text-4xl">Recent Sales</h1>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search invoice, name, product…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="border-white/10 bg-white/5 pl-9"
          />
        </div>
      </div>

      <GlassCard className="overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-white/5 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
              <th className="p-4">Invoice</th>
              <th>Customer</th>
              <th>Product</th>
              <th className="text-center">Qty</th>
              <th className="text-right">Amount</th>
              <th className="text-right">Profit</th>
              <th>Payment</th>
              <th>Date</th>
              <th className="text-right pr-4">Resend</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                  No sales match your search.
                </td>
              </tr>
            )}
            {filtered.map((s) => (
              <tr
                key={s.id}
                onClick={() => onViewInvoice(s)}
                className="cursor-pointer border-b border-white/5 transition hover:bg-white/5"
              >
                <td className="p-4 font-mono text-xs text-[#f0d67a]">{s.invoice_number}</td>
                <td>
                  <div>{s.customer_name}</div>
                  <div className="text-xs text-muted-foreground">{s.customer_mobile}</div>
                </td>
                <td>
                  {s.product_name}{" "}
                  <span className="text-xs text-muted-foreground">({s.size})</span>
                </td>
                <td className="text-center">{s.quantity}</td>
                <td className="text-right">
                  <Money value={Number(s.total_amount)} />
                </td>
                <td
                  className={cn(
                    "text-right font-money",
                    Number(s.profit) >= 0 ? "text-emerald-300" : "text-rose-300",
                  )}
                >
                  <Money
                    value={Number(s.profit)}
                    className={Number(s.profit) >= 0 ? "text-emerald-300" : "text-rose-300"}
                  />
                </td>
                <td>
                  <span className="rounded-full border border-[#d4af37]/25 px-2 py-0.5 text-xs">
                    {s.payment_method}
                  </span>
                </td>
                <td className="text-xs text-muted-foreground">
                  {new Date(s.created_at).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                  })}
                </td>
                <td className="pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="inline-flex gap-1">
                    <button
                      title="Copy invoice link"
                      onClick={() => {
                        const url = invoicePublicUrl(s.public_token);
                        navigator.clipboard?.writeText(url);
                        toast.success("Invoice link copied", { description: url });
                      }}
                      className="rounded-lg p-2 text-muted-foreground transition hover:bg-white/5 hover:text-white"
                    >
                      <LinkIcon className="h-4 w-4" />
                    </button>
                    <button
                      title="Resend on WhatsApp"
                      onClick={() =>
                        window.open(whatsappLink(saleToInvoice(s), business), "_blank")
                      }
                      className="rounded-lg p-2 text-emerald-300 transition hover:bg-emerald-500/10"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>
    </div>
  );
}

/* ---------------- SETTINGS ---------------- */

function SettingsSection() {
  const qc = useQueryClient();
  const { data: business = DEFAULT_BUSINESS, isLoading } = useBusinessSettings();
  const [form, setForm] = useState<BusinessSettings>(business);
  const [initialized, setInitialized] = useState(false);

  // Sync once when data arrives.
  if (!initialized && business.id) {
    setForm(business);
    setInitialized(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        business_name: form.business_name?.trim() || "Kaal Vastr",
        business_logo_url: form.business_logo_url?.trim() || null,
        whatsapp_number: form.whatsapp_number?.trim() || null,
        business_mobile: form.business_mobile?.trim() || null,
        gst_number: form.gst_number?.trim() || null,
        address: form.address?.trim() || null,
        upi_id: form.upi_id?.trim() || null,
        invoice_footer: form.invoice_footer?.trim() || null,
        default_country_code: form.default_country_code?.trim() || "91",
      };
      if (form.id) {
        const { error } = await supabase
          .from("business_settings")
          .update(payload)
          .eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("business_settings").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Business settings saved");
      qc.invalidateQueries({ queryKey: BUSINESS_QUERY_KEY });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Failed to save settings";
      toast.error("Save failed", { description: msg });
    },
  });

  const update = <K extends keyof BusinessSettings>(k: K, v: BusinessSettings[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Configuration</p>
        <h1 className="font-display mt-2 text-4xl">Business Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          These details appear on every invoice, WhatsApp message and SMS. Changes apply immediately across the app.
        </p>
      </div>

      <GlassCard className="space-y-5 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business Name">
            <Input
              value={form.business_name ?? ""}
              onChange={(e) => update("business_name", e.target.value)}
              placeholder="e.g. Kaal Vastr"
            />
          </Field>
          <Field label="Business Logo URL">
            <Input
              value={form.business_logo_url ?? ""}
              onChange={(e) => update("business_logo_url", e.target.value)}
              placeholder="https://…/logo.png"
            />
          </Field>
          <Field label="WhatsApp Business Number">
            <Input
              value={form.whatsapp_number ?? ""}
              onChange={(e) => update("whatsapp_number", e.target.value)}
              placeholder="+91 98765 43210"
            />
          </Field>
          <Field label="Business Mobile Number">
            <Input
              value={form.business_mobile ?? ""}
              onChange={(e) => update("business_mobile", e.target.value)}
              placeholder="+91 98765 43210"
            />
          </Field>
          <Field label="GST Number">
            <Input
              value={form.gst_number ?? ""}
              onChange={(e) => update("gst_number", e.target.value)}
              placeholder="29ABCDE1234F1Z5"
            />
          </Field>
          <Field label="UPI ID">
            <Input
              value={form.upi_id ?? ""}
              onChange={(e) => update("upi_id", e.target.value)}
              placeholder="business@upi"
            />
          </Field>
          <Field label="Default Country Code" className="sm:col-span-1">
            <Input
              value={form.default_country_code ?? ""}
              onChange={(e) => update("default_country_code", e.target.value)}
              placeholder="91"
            />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Textarea
              value={form.address ?? ""}
              onChange={(e) => update("address", e.target.value)}
              placeholder="Shop address"
              rows={2}
            />
          </Field>
          <Field label="Invoice Footer" className="sm:col-span-2">
            <Textarea
              value={form.invoice_footer ?? ""}
              onChange={(e) => update("invoice_footer", e.target.value)}
              placeholder="Thank you for shopping with us."
              rows={2}
            />
          </Field>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            WhatsApp API:{" "}
            <span className={isWhatsAppApiConfigured() ? "text-emerald-400" : "text-amber-400"}>
              {isWhatsAppApiConfigured() ? "Configured" : "Not configured (using wa.me fallback)"}
            </span>
            . Set{" "}
            <code className="rounded bg-secondary/60 px-1">VITE_WHATSAPP_API_URL</code> and{" "}
            <code className="rounded bg-secondary/60 px-1">VITE_WHATSAPP_API_TOKEN</code> in{" "}
            <code className="rounded bg-secondary/60 px-1">.env</code> to enable automatic sending.
          </p>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || isLoading}
            className="shrink-0"
          >
            {save.isPending ? "Saving…" : "Save Settings"}
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}