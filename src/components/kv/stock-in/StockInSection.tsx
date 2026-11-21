import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, PackagePlus, RotateCcw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GlassCard } from "@/components/kv/GlassCard";
import { OwnerOnly } from "@/components/kv/barcode/OwnerOnly";
import { PrinterSettingsPanel } from "@/components/kv/barcode/PrinterSettingsPanel";
import { ScannerSettingsPanel } from "@/components/kv/barcode/ScannerSettingsPanel";
import { formatINR } from "@/lib/pos/invoice";
import { usePrinterSettings } from "@/lib/kv/barcode/settings";
import { usePrinting } from "@/lib/kv/barcode/usePrinting";
import {
  fetchPrintJobs,
  fetchVariants,
  stockIn,
  type StockInResult,
} from "@/services/barcodeInventory";
import { ChipInput } from "./ChipInput";
import { LabelPrintTable, type LabelRow } from "./LabelPrintTable";

const SIZE_PRESETS = ["S", "M", "L", "XL", "XXL", "Free"];
const COLOUR_PRESETS = ["Black", "White", "Navy", "Grey"];

interface ExistingProduct {
  id: string;
  name: string;
  sku: string | null;
  category: string;
  brand: string | null;
  cost_price: number;
  selling_price: number;
  description: string | null;
}

interface FormState {
  name: string;
  category: string;
  brand: string;
  sku: string;
  cost: string;
  sell: string;
  supplier: string;
  description: string;
}
const EMPTY: FormState = {
  name: "",
  category: "",
  brand: "",
  sku: "",
  cost: "",
  sell: "",
  supplier: "",
  description: "",
};

const cellKey = (colour: string, size: string) => `${colour}\u0000${size}`;

function ReceiveStock() {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [sizes, setSizes] = useState<string[]>([]);
  const [colours, setColours] = useState<string[]>([]);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [result, setResult] = useState<StockInResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One key per distinct submission: a double click or a retry after a dropped connection can
  // never add the same stock twice, because the database replays the stored result.
  const keyRef = useRef<{ sig: string; key: string } | null>(null);

  const { data: products = [] } = useQuery({
    queryKey: ["kv-stockin-products"],
    queryFn: async (): Promise<ExistingProduct[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, category, brand, cost_price, selling_price, description")
        .eq("is_archived", false)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((p) => ({
        ...p,
        cost_price: Number(p.cost_price),
        selling_price: Number(p.selling_price),
      }));
    },
  });

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort(),
    [products],
  );
  const matched = useMemo(() => {
    const sku = form.sku.trim().toLowerCase();
    return sku ? (products.find((p) => (p.sku ?? "").trim().toLowerCase() === sku) ?? null) : null;
  }, [form.sku, products]);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const applySaved = (p: ExistingProduct) =>
    setForm((f) => ({
      ...f,
      name: p.name,
      category: p.category,
      brand: p.brand ?? "",
      cost: String(p.cost_price),
      sell: String(p.selling_price),
      description: p.description ?? f.description,
    }));

  const colourRows = colours.length ? colours : [""];
  const lines = useMemo(() => {
    const out: { size: string; colour: string; quantity: number }[] = [];
    for (const colour of colourRows) {
      for (const size of sizes) {
        const n = Math.floor(Number(qty[cellKey(colour, size)] ?? 0));
        if (n > 0) out.push({ size, colour, quantity: n });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizes, colours, qty]);
  const totalPieces = lines.reduce((a, l) => a + l.quantity, 0);

  const validate = (): string | null => {
    if (!form.name.trim()) return "Enter the product name.";
    if (!form.sku.trim()) return "Enter an SKU.";
    if (!form.category.trim()) return "Enter a category.";
    const cost = Number(form.cost);
    const sell = Number(form.sell);
    if (form.cost.trim() === "" || !Number.isFinite(cost) || cost < 0)
      return "Enter a valid purchase price.";
    if (!Number.isFinite(sell) || sell <= 0) return "Enter a selling price greater than 0.";
    if (!lines.length) return "Enter a quantity for at least one size/colour.";
    return null;
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        category: form.category.trim(),
        brand: form.brand.trim(),
        sku: form.sku.trim(),
        cost_price: Number(form.cost),
        selling_price: Number(form.sell),
        description: form.description.trim(),
        supplier: form.supplier.trim(),
      };
      const sig = JSON.stringify({ payload, lines });
      if (!keyRef.current || keyRef.current.sig !== sig)
        keyRef.current = { sig, key: crypto.randomUUID() };
      return stockIn(keyRef.current.key, payload, lines);
    },
    onSuccess: (r) => {
      setResult(r);
      setError(null);
      keyRef.current = null;
      for (const k of [
        "kv-variants",
        "kv-stockin-products",
        "products",
        "inventory-products",
        "inventory-activity",
        "sales",
      ]) {
        void qc.invalidateQueries({ queryKey: [k] });
      }
      toast.success(
        r.replayed
          ? "This stock-in was already recorded — nothing added twice."
          : `Stock recorded: ${r.lines.reduce((a, l) => a + l.quantity_added, 0)} pieces of ${r.product.name}.`,
      );
    },
    onError: (e: Error) => {
      setError(e.message);
      toast.error(e.message);
    },
  });

  const submit = () => {
    const v = validate();
    if (v) {
      setError(v);
      toast.error(v);
      return;
    }
    setError(null);
    mutation.mutate();
  };

  const reset = () => {
    setForm(EMPTY);
    setSizes([]);
    setColours([]);
    setQty({});
    setResult(null);
    setError(null);
    keyRef.current = null;
  };

  const labelRows: LabelRow[] = result
    ? result.lines.map((l) => ({
        variantId: l.variant_id,
        barcode: l.barcode,
        productName: result.product.name,
        size: l.size,
        colour: l.colour,
        quantity: l.quantity_added,
        defaultCopies: l.quantity_added,
      }))
    : [];

  return (
    <div className="space-y-5">
      <GlassCard>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">Product details</h3>
          {result && (
            <Button type="button" variant="outline" size="sm" onClick={reset}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> New stock-in
            </Button>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="si-sku">SKU *</Label>
            <Input
              id="si-sku"
              value={form.sku}
              placeholder="KV-TSH-OVR"
              autoComplete="off"
              disabled={!!result}
              onChange={(e) => {
                const sku = e.target.value;
                const m = products.find(
                  (p) => (p.sku ?? "").trim().toLowerCase() === sku.trim().toLowerCase(),
                );
                if (m && !form.name.trim()) applySaved(m);
                set({ sku });
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="si-name">Product name *</Label>
            <Input
              id="si-name"
              value={form.name}
              placeholder="Oversized T-Shirt"
              disabled={!!result}
              onChange={(e) => set({ name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="si-cat">Category *</Label>
            <Input
              id="si-cat"
              list="si-cats"
              value={form.category}
              placeholder="T-Shirts"
              disabled={!!result}
              onChange={(e) => set({ category: e.target.value })}
            />
            <datalist id="si-cats">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="si-brand">Brand</Label>
            <Input
              id="si-brand"
              value={form.brand}
              disabled={!!result}
              onChange={(e) => set({ brand: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="si-cost">Purchase price (₹) *</Label>
            <Input
              id="si-cost"
              type="number"
              min={0}
              step="0.01"
              value={form.cost}
              placeholder="350"
              disabled={!!result}
              onChange={(e) => set({ cost: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="si-sell">Selling price (₹) *</Label>
            <Input
              id="si-sell"
              type="number"
              min={0}
              step="0.01"
              value={form.sell}
              placeholder="799"
              disabled={!!result}
              onChange={(e) => set({ sell: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="si-sup">Supplier</Label>
            <Input
              id="si-sup"
              value={form.supplier}
              disabled={!!result}
              onChange={(e) => set({ supplier: e.target.value })}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="si-desc">Description</Label>
            <Textarea
              id="si-desc"
              rows={1}
              value={form.description}
              disabled={!!result}
              onChange={(e) => set({ description: e.target.value })}
            />
          </div>
        </div>
        {matched && !result && (
          <div className="mt-4 rounded-lg border border-[#d4af37]/40 bg-[#d4af37]/10 p-3 text-sm">
            <p>
              <strong>{matched.name}</strong> already exists with this SKU. Stock will be added to
              it — no duplicate product is created. Saved prices: cost{" "}
              {formatINR(matched.cost_price)}, selling {formatINR(matched.selling_price)}.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              The product has one purchase and one selling price, so the prices entered above
              replace the saved ones for future sales. Past sales keep the price they were made at.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => applySaved(matched)}
            >
              Use saved details
            </Button>
          </div>
        )}
      </GlassCard>

      <GlassCard>
        <h3 className="mb-4 font-medium">Sizes, colours and quantities</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="si-sizes">Sizes</Label>
            <ChipInput
              id="si-sizes"
              values={sizes}
              onChange={setSizes}
              placeholder="Type a size, press Enter"
              presets={SIZE_PRESETS}
              transform={(s) => s.toUpperCase()}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="si-colours">Colours (optional)</Label>
            <ChipInput
              id="si-colours"
              values={colours}
              onChange={setColours}
              placeholder="Type a colour, press Enter"
              presets={COLOUR_PRESETS}
            />
          </div>
        </div>

        {sizes.length > 0 && (
          <div className="mt-5 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">Colour \ Size</th>
                  {sizes.map((s) => (
                    <th key={s} className="p-2 text-center">
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {colourRows.map((c) => (
                  <tr key={c || "none"} className="border-t border-border">
                    <td className="p-2 font-medium">{c || "—"}</td>
                    {sizes.map((s) => (
                      <td key={s} className="p-1.5 text-center">
                        <Input
                          type="number"
                          min={0}
                          className="mx-auto h-8 w-20 text-center"
                          disabled={!!result}
                          aria-label={`Quantity ${c || "no colour"} ${s}`}
                          value={qty[cellKey(c, s)] ?? ""}
                          onChange={(e) =>
                            setQty((q) => ({ ...q, [cellKey(c, s)]: e.target.value }))
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {sizes.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            Add at least one size to enter quantities.
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={submit} disabled={mutation.isPending || !!result}>
            {mutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PackagePlus className="mr-2 h-4 w-4" />
            )}
            Add stock &amp; generate barcodes
          </Button>
          <span className="text-sm text-muted-foreground">
            {lines.length} variant{lines.length === 1 ? "" : "s"} · {totalPieces} pieces
          </span>
        </div>
        {error && (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
      </GlassCard>

      {result && (
        <GlassCard>
          <h3 className="font-medium">Barcode labels</h3>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            {result.product.created ? "New product created." : "Existing product updated."} One
            permanent barcode per size/colour is saved — identical pieces share it. If printing
            fails, your stock is already safe: just print again.
          </p>
          <LabelPrintTable rows={labelRows} quantityHeader="Received" />
        </GlassCard>
      )}
    </div>
  );
}

function BarcodeLibrary() {
  const [q, setQ] = useState("");
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({ queryKey: ["kv-variants"], queryFn: fetchVariants });
  const rows: LabelRow[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data
      .filter(
        (v) =>
          !term ||
          [v.barcode, v.product.name, v.product.sku ?? "", v.size, v.colour].some((x) =>
            x.toLowerCase().includes(term),
          ),
      )
      .slice(0, 300)
      .map((v) => ({
        variantId: v.id,
        barcode: v.barcode,
        productName: v.product.name,
        size: v.size,
        colour: v.colour,
        quantity: v.stock,
        defaultCopies: 1,
      }));
  }, [data, q]);
  return (
    <GlassCard>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">Barcodes &amp; labels</h3>
          <p className="text-sm text-muted-foreground">
            Every size/colour has one permanent barcode. Reprint any time.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search name, SKU, barcode…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>
      {isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="py-6 text-center text-sm text-red-400">{(error as Error).message}</p>
      ) : (
        <LabelPrintTable key={q} rows={rows} quantityHeader="In stock" />
      )}
    </GlassCard>
  );
}

function PrintHistory() {
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({ queryKey: ["kv-print-jobs"], queryFn: () => fetchPrintJobs(100) });
  const [printer] = usePrinterSettings();
  const { print, busy } = usePrinting();
  return (
    <GlassCard>
      <h3 className="mb-4 font-medium">Print history</h3>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-400">{(error as Error).message}</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No labels printed yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2">When</th>
                <th className="p-2">Product</th>
                <th className="p-2">Barcode</th>
                <th className="p-2 text-right">Labels</th>
                <th className="p-2">Status</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {data.map((j) => (
                <tr key={j.id} className="border-t border-border align-top">
                  <td className="p-2 whitespace-nowrap">
                    {new Date(j.created_at).toLocaleString("en-IN")}
                  </td>
                  <td className="p-2">
                    {j.product_name}
                    {j.size ? ` · ${j.size}` : ""}
                    {j.colour ? ` / ${j.colour}` : ""}
                  </td>
                  <td className="p-2 font-mono">{j.barcode}</td>
                  <td className="p-2 text-right">{j.copies}</td>
                  <td className="p-2">
                    <span
                      className={
                        j.status === "failed"
                          ? "text-red-400"
                          : j.status === "test"
                            ? "text-sky-400"
                            : "text-emerald-400"
                      }
                    >
                      {j.status}
                    </span>
                    {j.error && (
                      <div className="max-w-xs text-xs text-muted-foreground">{j.error}</div>
                    )}
                  </td>
                  <td className="p-2">
                    {j.status === "failed" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void print([
                            {
                              variantId: j.variant_id ?? undefined,
                              copies: j.copies,
                              item: {
                                barcode: j.barcode,
                                productName: j.product_name ?? "",
                                size: j.size ?? "",
                                colour: j.colour ?? "",
                              },
                            },
                          ])
                        }
                      >
                        Retry
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Printer in use: {printer.deviceName ?? "not chosen yet"}.
      </p>
    </GlassCard>
  );
}

export function StockInSection() {
  return (
    <OwnerOnly>
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Stock In</h2>
          <p className="text-sm text-muted-foreground">
            Receive new clothes, update stock and print barcode labels.
          </p>
        </div>
        <Tabs defaultValue="receive">
          <TabsList>
            <TabsTrigger value="receive">Receive stock</TabsTrigger>
            <TabsTrigger value="library">Barcodes &amp; labels</TabsTrigger>
            <TabsTrigger value="history">Print history</TabsTrigger>
            <TabsTrigger value="settings">Printer &amp; scanner</TabsTrigger>
          </TabsList>
          <TabsContent value="receive" className="mt-4">
            <ReceiveStock />
          </TabsContent>
          <TabsContent value="library" className="mt-4">
            <BarcodeLibrary />
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            <PrintHistory />
          </TabsContent>
          <TabsContent value="settings" className="mt-4 space-y-5">
            <GlassCard>
              <PrinterSettingsPanel />
            </GlassCard>
            <GlassCard>
              <h3 className="mb-4 font-medium">Barcode scanner</h3>
              <ScannerSettingsPanel />
            </GlassCard>
          </TabsContent>
        </Tabs>
      </div>
    </OwnerOnly>
  );
}
