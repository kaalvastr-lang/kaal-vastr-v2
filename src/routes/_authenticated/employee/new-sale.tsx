import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Loader2, Minus, Plus, Search as SearchIcon, Trash2 } from "lucide-react";
import { AppShell } from "@/components/employee/AppShell";
import { GlassCard } from "@/components/employee/GlassCard";
import { cartKey, usePos } from "@/lib/pos/pos-context";
import { formatINR } from "@/lib/pos/invoice";
import { useCheckout, useProducts, useRealtimeSync } from "@/hooks/use-pos-data";
import { computeTotals } from "@/services/sales";
import { primaryColor, productSizes, stockForSize } from "@/services/products";
import type { PaymentMode, Product } from "@/lib/pos/types";

export const Route = createFileRoute("/_authenticated/employee/new-sale")({
  head: () => ({
    meta: [
      { title: "New Sale & Billing — Kaal Vastr POS" },
      {
        name: "description",
        content:
          "Add products, apply discounts, choose a payment mode and generate a Kaal Vastr invoice in seconds.",
      },
      { property: "og:title", content: "New Sale & Billing — Kaal Vastr POS" },
      {
        property: "og:description",
        content: "Fast counter billing with discounts and instant invoice generation.",
      },
    ],
  }),
  component: () => (
      <BillingPage />
  ),
});

const PAYMENT_MODES: PaymentMode[] = ["Cash", "UPI", "Card"];

function BillingPage() {
  useRealtimeSync();
  const { data: products = [], isLoading } = useProducts();
  const { cart, addToCart, setQuantity, removeFromCart, clearCart } = usePos();
  const checkout = useCheckout();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "amount">("percent");
  const [discountValue, setDiscountValue] = useState(0);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("Cash");
  const [error, setError] = useState<string | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? products.filter((p: Product) =>
          [p.name, p.sku ?? "", p.category, ...(p.colors ?? []), ...(p.sizes ?? [])]
            .join(" ")
            .toLowerCase()
            .includes(q),
        )
      : products;
    return list.slice(0, 12);
  }, [products, query]);

  const totals = computeTotals(cart, discountType, discountValue);

  async function onGenerate() {
    setError(null);
    try {
      const invoice = await checkout.mutateAsync({
        customerName,
        customerPhone,
        discountType,
        discountValue,
        paymentMode,
        items: cart,
      });
      clearCart();
      setCustomerName("");
      setCustomerPhone("");
      setDiscountValue(0);
      router.navigate({ to: "/invoice/$token", params: { token: invoice.publicToken } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete the sale.");
    }
  }

  return (
    <AppShell title="New Sale" subtitle="Build the bill, apply a discount, generate the invoice">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <GlassCard>
          <div className="flex items-center gap-3 rounded-xl border border-input bg-secondary/50 px-3">
            <SearchIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, SKU, size or colour"
              className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading catalogue…</p>
            ) : null}
            {results.map((p: Product) => (
              <div
                key={p.id}
                className="rounded-xl border border-border bg-secondary/40 p-3 text-left"
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[p.sku, p.category, primaryColor(p)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span className="gold-text shrink-0 font-display font-semibold">
                    {formatINR(Number(p.selling_price))}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {productSizes(p).map((size) => {
                    const left = stockForSize(p, size);
                    return (
                      <button
                        key={size}
                        onClick={() => addToCart(p, size)}
                        disabled={left <= 0}
                        className="hover-lift rounded-lg border border-border px-2.5 py-1.5 text-xs transition-colors hover:bg-accent disabled:opacity-40"
                      >
                        {size} · {left}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {!isLoading && results.length === 0 ? (
              <p className="text-sm text-muted-foreground">No products match “{query}”.</p>
            ) : null}
          </div>
        </GlassCard>

        <div className="space-y-4">
          <GlassCard>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <h2 className="truncate font-display text-lg font-semibold">Cart</h2>
              {cart.length > 0 ? (
                <button
                  onClick={clearCart}
                  className="shrink-0 text-xs text-muted-foreground hover:text-destructive"
                >
                  Clear all
                </button>
              ) : null}
            </div>

            {cart.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Tap a size to add the product to the bill.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {cart.map((item) => (
                  <li key={item.key} className="py-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {item.product.name} — {item.size}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatINR(item.unitPrice)}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold">
                        {formatINR(item.unitPrice * item.quantity)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <QtyButton onClick={() => setQuantity(item.key, item.quantity - 1)}>
                        <Minus className="h-3.5 w-3.5" />
                      </QtyButton>
                      <span className="w-8 text-center text-sm">{item.quantity}</span>
                      <QtyButton
                        onClick={() =>
                          setQuantity(cartKey(item.product.id, item.size), item.quantity + 1)
                        }
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </QtyButton>
                      <button
                        onClick={() => removeFromCart(item.key)}
                        className="ml-auto text-muted-foreground transition-colors hover:text-destructive"
                        aria-label={`Remove ${item.product.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>

          <GlassCard>
            <h2 className="font-display text-lg font-semibold">Customer & payment</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <TextInput
                label="Customer name"
                value={customerName}
                onChange={setCustomerName}
                placeholder="Walk-in Customer"
              />
              <TextInput
                label="WhatsApp number"
                value={customerPhone}
                onChange={setCustomerPhone}
                placeholder="98290 44120"
              />
            </div>

            <div className="mt-4">
              <p className="text-xs tracking-widest text-muted-foreground uppercase">Discount</p>
              <div className="mt-2 flex gap-2">
                <div className="flex overflow-hidden rounded-xl border border-input">
                  {(["percent", "amount"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setDiscountType(t)}
                      className={`px-3 py-2 text-sm transition-colors ${
                        discountType === t
                          ? "gold-surface"
                          : "text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {t === "percent" ? "%" : "₹"}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min={0}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(Math.max(0, Number(e.target.value)))}
                  className="min-w-0 flex-1 rounded-xl border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs tracking-widest text-muted-foreground uppercase">
                Payment mode
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {PAYMENT_MODES.map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setPaymentMode(mode)}
                    className={`rounded-xl border border-border py-2 text-sm transition-colors ${
                      paymentMode === mode
                        ? "gold-surface"
                        : "text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
              <SummaryRow label="Subtotal" value={formatINR(totals.subtotal)} />
              <SummaryRow label="Discount" value={`- ${formatINR(totals.discountAmount)}`} />
              <div className="flex items-center justify-between pt-1">
                <span className="font-display font-semibold">Total</span>
                <span className="gold-text font-display text-2xl font-bold">
                  {formatINR(totals.total)}
                </span>
              </div>
            </div>

            {error ? (
              <p className="mt-3 rounded-xl border border-destructive/40 bg-destructive/15 px-3 py-2 text-sm text-foreground">
                {error}
              </p>
            ) : null}

            <button
              onClick={onGenerate}
              disabled={cart.length === 0 || checkout.isPending}
              className="gold-surface hover-lift mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold disabled:opacity-40"
            >
              {checkout.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {checkout.isPending ? "Saving sale…" : "Generate invoice"}
            </button>
          </GlassCard>
        </div>
      </div>
    </AppShell>
  );
}

function QtyButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {children}
    </button>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-xs tracking-widest text-muted-foreground uppercase">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-xl border border-input bg-secondary/50 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
