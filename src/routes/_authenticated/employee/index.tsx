import { createFileRoute, Link } from "@tanstack/react-router";
import { IndianRupee, Receipt, ShoppingCart } from "lucide-react";
import { AppShell } from "@/components/employee/AppShell";
import { GlassCard, StatCard } from "@/components/employee/GlassCard";
import { useAuth } from "@/lib/auth";
import { formatDateTime, formatINR } from "@/lib/pos/invoice";
import { useBusinessSettings, useRealtimeSync, useTodaySales } from "@/hooks/use-pos-data";

export const Route = createFileRoute("/_authenticated/employee/")({
  head: () => ({
    meta: [
      { title: "Today at the Counter — Kaal Vastr POS" },
      {
        name: "description",
        content: "Live view of today's sales value and bills generated at your Kaal Vastr counter.",
      },
      { property: "og:title", content: "Today at the Counter — Kaal Vastr POS" },
      {
        property: "og:description",
        content: "Track today's takings and bills from the Kaal Vastr employee POS.",
      },
    ],
  }),
  component: () => (
      <DashboardPage />
  ),
});

function DashboardPage() {
  useRealtimeSync();
  const { employee } = useAuth();
  const { data: business } = useBusinessSettings();
  const { data: todaySales = [], isLoading } = useTodaySales();
  const revenue = todaySales.reduce((sum, s) => sum + s.total, 0);

  return (
    <AppShell
      title={`Welcome, ${employee?.name ?? "there"}`}
      subtitle={business?.business_name ?? "Kaal Vastr"}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Today's Sales"
          value={isLoading ? "…" : formatINR(revenue)}
          hint="Net of discounts, shared with the Owner Dashboard"
          icon={<IndianRupee className="h-5 w-5" />}
        />
        <StatCard
          label="Bills Generated Today"
          value={isLoading ? "…" : String(todaySales.length)}
          hint="Invoices issued today"
          icon={<Receipt className="h-5 w-5" />}
        />
      </div>

      <Link
        to="/employee/new-sale"
        className="gold-surface hover-lift mt-4 flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-semibold"
      >
        <ShoppingCart className="h-4 w-4" /> Start a new sale
      </Link>

      <GlassCard className="mt-4">
        <h2 className="font-display text-lg font-semibold">Recent bills</h2>
        {todaySales.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No bills yet today. Your invoices will appear here as you sell.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {todaySales.slice(0, 8).map((sale) => (
              <li key={sale.invoiceNo}>
                <Link
                  to="/invoice/$token"
                  params={{ token: sale.publicToken }}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3 transition-colors hover:text-primary"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{sale.invoiceNo}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {sale.customerName} · {formatDateTime(sale.createdAt)}
                    </p>
                  </div>
                  <span className="shrink-0 font-display font-semibold">
                    {formatINR(sale.total)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </AppShell>
  );
}
