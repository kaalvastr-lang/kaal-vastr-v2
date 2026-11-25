import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Loader2,
  Minus,
  Plus,
  ScanBarcode,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
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
import { GlassCard } from "@/components/kv/GlassCard";
import { PaymentSplitEditor } from "@/components/kv/PaymentSplitEditor";
import { usePaymentSplit } from "@/hooks/use-payment-split";
import { OwnerOnly } from "@/components/kv/barcode/OwnerOnly";
import { ScannerSettingsPanel } from "@/components/kv/barcode/ScannerSettingsPanel";
import { ScannerStatus } from "@/components/kv/barcode/ScannerStatus";
import { BillingModeSwitch, type BillingMode } from "@/components/kv/barcode/BillingModeSwitch";
import { formatINR } from "@/lib/pos/invoice";
import type { InvoiceData } from "@/lib/kv/invoice";
import { previewTotals } from "@/lib/kv/barcode/billing";
import { playBeep, type ScanEvent } from "@/lib/kv/barcode/scanner";
import { useBarcodeScanner } from "@/lib/kv/barcode/useBarcodeScanner";
import {
  availableStock,
  completeScanSale,
  fetchVariants,
  lookupVariantByBarcode,
  variantLabel,
  type VariantRecord,
} from "@/services/barcodeInventory";

const NOT_FOUND = "Product not found. Please check the barcode or search manually.";

interface CartItem {
  variantId: string;
  barcode: string;
  productName: string;
  sku: string | null;
  size: string;
  colour: string;
  price: number;
  gstPct: number;
  /** Sellable units when last checked. The database re-checks at checkout. */
  available: number;
  qty: number;
}

interface Feedback {
  kind: "ok" | "error";
  message: string;
  item?: CartItem;
}

const toCartItem = (v: VariantRecord, qty: number): CartItem => ({
  variantId: v.id,
  barcode: v.barcode,
  productName: v.product.name,
  sku: v.product.sku,
  size: v.size,
  colour: v.colour,
  price: v.product.selling_price,
  gstPct: v.product.gst_pct,
  available: availableStock(v),
  qty,
});

export function ScanBillingSection({
  onCreated,
  onModeChange,
}: {
  onCreated: (invoice: InvoiceData) => void;
  onModeChange: (m: BillingMode) => void;
}) {
  return (
    <OwnerOnly>
      <ScanBillingInner onCreated={onCreated} onModeChange={onModeChange} />
    </OwnerOnly>
  );
}

function ScanBillingInner({
  onCreated,
  onModeChange,
}: {
  onCreated: (invoice: InvoiceData) => void;
  onModeChange: (m: BillingMode) => void;
}) {
  const qc = useQueryClient();
  const [cart, setCart] = useState<CartItem[]>([]);
  const cartRef = useRef<CartItem[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pending, setPending] = useState(0);
  const [manualCode, setManualCode] = useState("");
  const [search, setSearch] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [customer, setCustomer] = useState({ name: "", mobile: "" });
  const [discountType, setDiscountType] = useState<"percent" | "amount">("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const scanBoxRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef<{ sig: string; key: string } | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const beepRef = useRef(true);

  const commit = useCallback((next: CartItem[]) => {
    cartRef.current = next;
    setCart(next);
  }, []);

  const focusScanBox = useCallback(() => {
    const a = document.activeElement;
    const typing =
      a instanceof HTMLElement &&
      a !== scanBoxRef.current &&
      (a.tagName === "INPUT" || a.tagName === "TEXTAREA");
    if (!typing) scanBoxRef.current?.focus();
  }, []);

  const report = useCallback((fb: Feedback) => {
    setFeedback(fb);
    if (beepRef.current) playBeep(fb.kind);
  }, []);

  /** Adds one unit of a variant, or explains why it cannot be added. */
  const addVariant = useCallback(
    (v: VariantRecord) => {
      if (!v.is_active || v.product.is_archived) {
        report({ kind: "error", message: `${v.product.name} is no longer available for sale.` });
        return;
      }
      const available = availableStock(v);
      const current = cartRef.current;
      const idx = current.findIndex((c) => c.variantId === v.id);
      const inCart = idx >= 0 ? current[idx]!.qty : 0;
      if (available <= 0) {
        report({
          kind: "error",
          message: `${v.product.name} (${variantLabel(v)}) is out of stock.`,
        });
        return;
      }
      if (inCart + 1 > available) {
        report({
          kind: "error",
          message: `Only ${available} in stock for ${v.product.name} (${variantLabel(v)}) — already ${inCart} in the bill.`,
        });
        return;
      }
      const item = toCartItem(v, inCart + 1);
      commit(idx >= 0 ? current.map((c, i) => (i === idx ? item : c)) : [...current, item]);
      report({ kind: "ok", message: "Added to bill", item });
    },
    [commit, report],
  );

  const handleScan = useCallback(
    (e: ScanEvent) => {
      setPending((n) => n + 1);
      // Scans are looked up strictly one after another so two quick scans can never race.
      queueRef.current = queueRef.current
        .then(async () => {
          try {
            const v = await lookupVariantByBarcode(e.code);
            if (!v) report({ kind: "error", message: NOT_FOUND });
            else addVariant(v);
          } catch (err) {
            report({
              kind: "error",
              message: err instanceof Error ? err.message : "Could not look up that barcode.",
            });
          }
        })
        .finally(() => {
          setPending((n) => Math.max(0, n - 1));
          focusScanBox();
        });
    },
    [addVariant, focusScanBox, report],
  );

  const { state, lastScan, windowFocused, submitManual, settings } = useBarcodeScanner(handleScan);
  useEffect(() => {
    beepRef.current = settings.beep;
  }, [settings.beep]);
  useEffect(() => {
    scanBoxRef.current?.focus();
  }, []);

  /* ----------------------------- search fallback ----------------------------- */
  const { data: allVariants = [] } = useQuery({
    queryKey: ["kv-variants"],
    queryFn: fetchVariants,
  });
  const results = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (t.length < 2) return [];
    return allVariants
      .filter((v) =>
        [v.product.name, v.product.sku ?? "", v.barcode, v.colour, v.size].some((x) =>
          x.toLowerCase().includes(t),
        ),
      )
      .slice(0, 8);
  }, [allVariants, search]);

  /* ----------------------------- cart ops ----------------------------- */
  const changeQty = (variantId: string, delta: number) => {
    const cur = cartRef.current;
    const item = cur.find((c) => c.variantId === variantId);
    if (!item) return;
    const next = item.qty + delta;
    if (next < 1) return;
    if (next > item.available) {
      report({
        kind: "error",
        message: `Only ${item.available} in stock for ${item.productName} (${variantLabel(item)}).`,
      });
      return;
    }
    commit(cur.map((c) => (c.variantId === variantId ? { ...c, qty: next } : c)));
  };
  const removeItem = (variantId: string) =>
    commit(cartRef.current.filter((c) => c.variantId !== variantId));

  /** Re-reads current stock/prices for everything in the bill (used after a failed checkout). */
  const refreshCart = async () => {
    const cur = cartRef.current;
    const fresh = await Promise.all(
      cur.map((c) => lookupVariantByBarcode(c.barcode).catch(() => null)),
    );
    commit(
      cur.map((c, i) => {
        const v = fresh[i];
        return v ? toCartItem(v, Math.min(c.qty, Math.max(1, availableStock(v)))) : c;
      }),
    );
  };

  /* ----------------------------- totals + checkout ----------------------------- */
  const dv = Number(discountValue) || 0;
  const totals = useMemo(
    () =>
      previewTotals(
        cart.map((c) => ({ price: c.price, qty: c.qty, gstPct: c.gstPct })),
        discountType,
        dv,
      ),
    [cart, discountType, dv],
  );
  const pieces = cart.reduce((a, c) => a + c.qty, 0);
  // One method, or a split such as Cash + UPI (the database verifies it adds up to the total).
  const pay = usePaymentSplit(totals.total);

  const checkout = useMutation({
    mutationFn: async () => {
      const items = cartRef.current.map((c) => ({ variantId: c.variantId, quantity: c.qty }));
      const input = {
        customerName: customer.name.trim(),
        customerMobile: customer.mobile.trim(),
        paymentMethod: pay.parts[0]!.method,
        payments: pay.split ? pay.parts : undefined,
        discountType,
        discountValue: dv,
        items,
      };
      // Same bill → same key (safe retry); any change → new key.
      const sig = JSON.stringify(input);
      if (!keyRef.current || keyRef.current.sig !== sig)
        keyRef.current = { sig, key: crypto.randomUUID() };
      return completeScanSale({ requestKey: keyRef.current.key, ...input });
    },
    onSuccess: ({ invoice, replayed }) => {
      keyRef.current = null;
      commit([]);
      setCustomer({ name: "", mobile: "" });
      setDiscountValue("");
      setFeedback(null);
      setFormError(null);
      for (const k of [
        "sales",
        "products",
        "inventory-products",
        "inventory-sales",
        "inventory-activity",
        "kv-variants",
        "kv-stockin-products",
      ]) {
        void qc.invalidateQueries({ queryKey: [k] });
      }
      toast.success(
        replayed
          ? `Bill ${invoice.invoiceNumber} was already saved.`
          : `Sale complete · ${invoice.invoiceNumber}`,
      );
      onCreated(invoice);
      setTimeout(() => scanBoxRef.current?.focus(), 50);
    },
    onError: (err: Error) => {
      setFormError(err.message);
      toast.error(err.message);
      void refreshCart();
    },
  });

  const submit = () => {
    if (!cart.length) return setFormError("Scan or add at least one product.");
    if (!customer.name.trim()) return setFormError("Enter the customer name.");
    if (!customer.mobile.trim()) return setFormError("Enter the customer mobile number.");
    if (discountType === "percent" && dv > 100) return setFormError("Discount cannot exceed 100%.");
    if (pay.error) return setFormError(pay.error);
    setFormError(null);
    checkout.mutate();
  };

  const submitManualCode = () => {
    if (submitManual(manualCode)) setManualCode("");
  };

  const last = feedback?.item;
  const lastInCart = last ? cart.find((c) => c.variantId === last.variantId) : undefined;

  return (
    <div>
      <BillingModeSwitch value="scan-billing" onChange={onModeChange} />
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <GlassCard>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-medium">
                <ScanBarcode className="h-4 w-4" /> Scan Billing
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings((s) => !s)}
              >
                <Settings2 className="mr-1 h-4 w-4" /> Scanner settings
              </Button>
            </div>
            <ScannerStatus state={state} windowFocused={windowFocused} lastScan={lastScan} />
            <div className="mt-3 flex gap-2">
              <Input
                ref={scanBoxRef}
                data-scan-input
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitManualCode();
                  }
                }}
                placeholder="Scan barcode here — or type it and press Enter"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="font-mono text-base"
                aria-label="Barcode scan input"
              />
              <Button
                type="button"
                variant="outline"
                onClick={submitManualCode}
                disabled={!manualCode.trim()}
              >
                Add
              </Button>
            </div>
            {pending > 0 && (
              <p className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Looking up {pending} scan
                {pending > 1 ? "s" : ""}…
              </p>
            )}
            {showSettings && (
              <div className="mt-4 border-t border-border pt-4">
                <ScannerSettingsPanel />
              </div>
            )}
          </GlassCard>

          {feedback && (
            <GlassCard
              className={feedback.kind === "error" ? "border-red-500/50" : "border-emerald-500/40"}
            >
              {feedback.kind === "error" || !last ? (
                <p className="flex items-start gap-2 text-sm text-red-400" role="alert">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {feedback.message}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                  <div className="col-span-2 sm:col-span-3 text-base font-medium">
                    {last.productName}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">SKU</div>
                    {last.sku ?? "—"}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Size</div>
                    {last.size}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Colour</div>
                    {last.colour || "—"}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Selling price</div>
                    {formatINR(last.price)}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Available stock</div>
                    {last.available}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">In this bill</div>
                    {lastInCart?.qty ?? 0}
                  </div>
                </div>
              )}
            </GlassCard>
          )}

          <GlassCard>
            <Label htmlFor="sb-search" className="mb-1.5 block">
              Manual product search
            </Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="sb-search"
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, SKU, colour, size or barcode"
                autoComplete="off"
              />
            </div>
            {results.length > 0 && (
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                {results.map((v) => {
                  const av = availableStock(v);
                  return (
                    <li key={v.id} className="flex items-center justify-between gap-3 p-2 text-sm">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{v.product.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {variantLabel(v)} · <span className="font-mono">{v.barcode}</span> ·{" "}
                          {formatINR(v.product.selling_price)} · {av} in stock
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={av <= 0}
                        onClick={() => {
                          addVariant(v);
                          focusScanBox();
                        }}
                      >
                        {av <= 0 ? "Out of stock" : "Add"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            {search.trim().length >= 2 && results.length === 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                No barcoded products match. Products without a barcode are billed in Normal Billing.
              </p>
            )}
          </GlassCard>

          <GlassCard>
            <h3 className="mb-3 font-medium">
              Cart{" "}
              {pieces > 0 && (
                <span className="text-sm font-normal text-muted-foreground">
                  · {pieces} piece{pieces > 1 ? "s" : ""}
                </span>
              )}
            </h3>
            {cart.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Scan a garment to start the bill.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="p-2">Product</th>
                      <th className="p-2">Size / Colour</th>
                      <th className="p-2 text-right">Price</th>
                      <th className="p-2 text-center">Qty</th>
                      <th className="p-2 text-right">Total</th>
                      <th className="w-9 p-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((c) => (
                      <tr key={c.variantId} className="border-t border-border">
                        <td className="p-2">
                          <div className="font-medium">{c.productName}</div>
                          <div className="text-xs text-muted-foreground">
                            {c.sku ?? ""} <span className="font-mono">{c.barcode}</span>
                          </div>
                        </td>
                        <td className="p-2">{variantLabel(c)}</td>
                        <td className="p-2 text-right">{formatINR(c.price)}</td>
                        <td className="p-2">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="h-7 w-7"
                              aria-label="Decrease quantity"
                              onClick={() => changeQty(c.variantId, -1)}
                              disabled={c.qty <= 1}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-8 text-center tabular-nums">{c.qty}</span>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="h-7 w-7"
                              aria-label="Increase quantity"
                              onClick={() => changeQty(c.variantId, 1)}
                              disabled={c.qty >= c.available}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="text-center text-[10px] text-muted-foreground">
                            {c.available} avail.
                          </div>
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {formatINR(c.price * c.qty)}
                        </td>
                        <td className="p-2">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            aria-label={`Remove ${c.productName}`}
                            onClick={() => removeItem(c.variantId)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </div>

        <div className="space-y-5">
          <GlassCard>
            <h3 className="mb-3 font-medium">Customer</h3>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="sb-name">Name *</Label>
                <Input
                  id="sb-name"
                  value={customer.name}
                  autoComplete="off"
                  onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sb-mobile">Mobile *</Label>
                <Input
                  id="sb-mobile"
                  inputMode="tel"
                  value={customer.mobile}
                  autoComplete="off"
                  onChange={(e) => setCustomer((c) => ({ ...c, mobile: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Payment</Label>
                <PaymentSplitEditor pay={pay} total={totals.total} idPrefix="sb" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sb-disc">Discount</Label>
                <div className="flex gap-2">
                  <Select
                    value={discountType}
                    onValueChange={(v) => setDiscountType(v as typeof discountType)}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">%</SelectItem>
                      <SelectItem value="amount">₹ flat</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    id="sb-disc"
                    type="number"
                    min={0}
                    value={discountValue}
                    placeholder="0"
                    onChange={(e) => setDiscountValue(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </GlassCard>

          <GlassCard>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums">{formatINR(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Discount</dt>
                <dd className="tabular-nums">− {formatINR(totals.discount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">GST</dt>
                <dd className="tabular-nums">{formatINR(totals.gst)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-lg font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatINR(totals.total)}</dd>
              </div>
            </dl>
            {formError && (
              <p className="mt-3 text-sm text-red-400" role="alert">
                {formError}
              </p>
            )}
            <Button
              type="button"
              className="mt-4 w-full"
              size="lg"
              onClick={submit}
              disabled={checkout.isPending || cart.length === 0}
            >
              {checkout.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Complete sale
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Prices and stock are verified by the database when you complete the sale. After it
              saves, share the invoice on WhatsApp from the invoice window.
            </p>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
