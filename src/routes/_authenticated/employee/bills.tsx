import { createFileRoute, Link } from "@tanstack/react-router";
import { IndianRupee, MessageCircle, Package, Printer, Receipt } from "lucide-react";
import { AppShell } from "@/components/employee/AppShell";
import { GlassCard, StatCard } from "@/components/employee/GlassCard";
import { formatDateTime, formatINR } from "@/lib/pos/invoice";
import { useBusinessSettings, useRealtimeSync, useTodaySales } from "@/hooks/use-pos-data";
import { invoicePublicUrl } from "@/lib/kv/invoice";
import { waLinkForInvoice } from "@/lib/pos/share";

export const Route = createFileRoute("/_authenticated/employee/bills")({
  head: () => ({
    meta: [
      { title: "Bills Generated Today — Kaal Vastr POS" },
      {
        name: "description",
        content: "Every invoice generated at the counter today, with print and WhatsApp sharing.",
      },
      { property: "og:title", content: "Bills Generated Today — Kaal Vastr POS" },
      {
        property: "og:description",
        content: "Review, print and WhatsApp today's Kaal Vastr invoices.",
      },
    ],
  }),
  component: BillsPage,
});

function BillsPage() {
  useRealtimeSync();
  const { data: business } = useBusinessSettings();
  const { data: sales = [], isLoading } = useTodaySales();
  const revenue = sales.reduce((sum, s) => sum + s.total, 0);
  const items = sales.reduce((n, s) => n + s.items.reduce((q, i) => q + i.quantity, 0), 0);

  return (
    <AppShell title="Today's Bills" subtitle={business?.business_name ?? "Kaal Vastr"}>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Bills Generated"
          value={isLoading ? "…" : String(sales.length)}
          icon={<Receipt className="h-5 w-5" />}
        />
        <StatCard
          label="Today's Sales"
          value={isLoading ? "…" : formatINR(revenue)}
          icon={<IndianRupee className="h-5 w-5" />}
        />
        <StatCard
          label="Items Sold"
          value={isLoading ? "…" : String(items)}
          icon={<Package className="h-5 w-5" />}
        />
      </div>

      <GlassCard className="mt-4">
        <h2 className="font-display text-lg font-semibold">All bills today</h2>
        {isLoading ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading bills…</p>
        ) : sales.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No bills yet today. Generate a sale to see it here instantly.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {sales.map((sale) => (
              <li
                key={sale.invoiceNo}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <Link
                    to="/invoice/$token"
                    params={{ token: sale.publicToken }}
                    className="truncate font-medium transition-colors hover:text-primary"
                  >
                    {sale.invoiceNo}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {sale.customerName} · {formatDateTime(sale.createdAt)} · {sale.paymentMode}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-display font-semibold">{formatINR(sale.total)}</span>
                  <a
                    href={waLinkForInvoice(sale, "Kaal Vastr")}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Send ${sale.invoiceNo} on WhatsApp`}
                    className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:text-primary"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </a>
                  <a
                    href={invoicePublicUrl(sale.publicToken)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Print ${sale.invoiceNo}`}
                    className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:text-primary"
                  >
                    <Printer className="h-4 w-4" />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </AppShell>
  );
}