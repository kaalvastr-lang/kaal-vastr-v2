import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Banknote,
  CreditCard,
  IndianRupee,
  Package,
  Receipt,
  Smartphone,
  TrendingUp,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/kv/GlassCard";
import { StatCard } from "@/components/kv/StatCard";
import { cn } from "@/lib/utils";
import {
  PERIOD_LABELS,
  computeMetrics,
  dailySeries,
  resolveRange,
  type PeriodKey,
  type SaleRow,
} from "@/lib/kv/analytics";

const rupee = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

const PERIODS: PeriodKey[] = ["today", "yesterday", "week", "month", "lastMonth", "custom", "monthly"];

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Owner-only Sales Analytics. Reads directly from the shared `sales` table so
 * employee-generated bills appear here the moment they are saved.
 */
export function AnalyticsSection() {
  const today = new Date();
  const [period, setPeriod] = useState<PeriodKey>("today");
  const [customFrom, setCustomFrom] = useState(isoDay(today));
  const [customTo, setCustomTo] = useState(isoDay(today));
  const [month, setMonth] = useState(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`,
  );

  const range = useMemo(
    () => resolveRange(period, { customFrom, customTo, month }),
    [period, customFrom, customTo, month],
  );

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["analytics-sales", range.from.toISOString(), range.to.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("invoice_number,total_amount,profit,quantity,payment_method,is_returned,created_at")
        .gte("created_at", range.from.toISOString())
        .lte("created_at", range.to.toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SaleRow[];
    },
  });

  const metrics = useMemo(() => computeMetrics(rows), [rows]);
  const series = useMemo(() => dailySeries(rows), [rows]);
  const peak = Math.max(1, ...series.map((s) => s.sales));

  const rangeLabel = `${range.from.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} — ${range.to.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl">Sales Analytics</h2>
        <p className="mt-1 text-xs uppercase tracking-[0.25em] text-muted-foreground">{rangeLabel}</p>
      </div>

      {/* Period filter */}
      <GlassCard className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs uppercase tracking-wider transition",
                period === p
                  ? "border-[#d4af37]/50 bg-gradient-to-r from-[#d4af37]/20 to-transparent text-[#f0d67a]"
                  : "border-border text-muted-foreground hover:border-[#4a4a4a] hover:text-foreground",
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {period === "custom" && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              From
              <input
                type="date"
                value={customFrom}
                max={customTo}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="mt-1 block rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              To
              <input
                type="date"
                value={customTo}
                min={customFrom}
                onChange={(e) => setCustomTo(e.target.value)}
                className="mt-1 block rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-sm text-foreground"
              />
            </label>
          </div>
        )}

        {period === "monthly" && (
          <label className="block text-[11px] uppercase tracking-wider text-muted-foreground">
            Month
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="mt-1 block rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-sm text-foreground"
            />
          </label>
        )}
      </GlassCard>

      {/* Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Sales" value={rupee(metrics.totalSales)} icon={IndianRupee} accent="gold" />
        <StatCard
          label="Total Profit"
          value={rupee(metrics.totalProfit)}
          icon={TrendingUp}
          accent={metrics.totalProfit >= 0 ? "positive" : "negative"}
        />
        <StatCard label="Bills Generated" value={String(metrics.billsGenerated)} icon={Receipt} />
        <StatCard label="Avg Bill Value" value={rupee(metrics.averageBillValue)} icon={BarChart3} />
        <StatCard label="Cash Sales" value={rupee(metrics.cashSales)} icon={Banknote} />
        <StatCard label="UPI Sales" value={rupee(metrics.upiSales)} icon={Smartphone} />
        <StatCard label="Card Sales" value={rupee(metrics.cardSales)} icon={CreditCard} />
        <StatCard label="Items Sold" value={String(metrics.totalItemsSold)} icon={Package} />
      </div>

      {/* Daily trend */}
      <GlassCard>
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Daily Revenue
        </p>
        {isLoading ? (
          <p className="mt-6 text-sm text-muted-foreground">Loading analytics…</p>
        ) : series.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">No sales recorded for this period.</p>
        ) : (
          <div className="mt-6 flex h-44 items-end gap-1.5 overflow-x-auto">
            {series.map((s) => (
              <div key={s.day} className="flex min-w-[26px] flex-1 flex-col items-center gap-2">
                <div
                  title={`${s.day}: ${rupee(s.sales)}`}
                  style={{ height: `${Math.max(4, (s.sales / peak) * 100)}%` }}
                  className="w-full rounded-t bg-gradient-to-t from-[#a37e12] to-[#f0d67a] transition-all"
                />
                <span className="text-[9px] text-muted-foreground">{s.day.slice(8)}</span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}