import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Printer, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getPrinterAdapter,
  isZD230,
  printerAdapters,
  zebraAdapter,
  type PrinterDevice,
  type PrinterStatus,
} from "@/lib/kv/barcode/printer";
import {
  DEFAULT_LABEL_SETTINGS,
  useLabelSettings,
  usePrinterSettings,
  type LabelSettings,
} from "@/lib/kv/barcode/settings";
import { usePrinting } from "@/lib/kv/barcode/usePrinting";
import { TEST_LABEL_ITEM } from "@/lib/kv/barcode/label";
import { LabelPreview } from "./LabelPreview";

function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/** Printer connection + label layout. Separate from the scanner module. */
export function PrinterSettingsPanel() {
  const [printer, updatePrinter] = usePrinterSettings();
  const [label, updateLabel, resetLabel] = useLabelSettings();
  const { testPrint, busy } = usePrinting();
  const adapter = getPrinterAdapter(printer.adapterId);

  const [status, setStatus] = useState<PrinterStatus | null>(null);
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [checking, setChecking] = useState(false);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const st = await adapter.detect();
      setStatus(st);
      if (st.available) {
        const list = await adapter.listPrinters();
        setDevices(list);
        // Auto-select a ZD230 when nothing is chosen yet.
        if (!printer.deviceId && adapter.id === "zebra-browser-print") {
          const zd = list.find((d) => isZD230(d.name)) ?? (list.length === 1 ? list[0] : undefined);
          if (zd) updatePrinter({ deviceId: zd.id, deviceName: zd.name });
        }
      } else {
        setDevices([]);
      }
    } catch (e) {
      setStatus({
        available: false,
        error: e instanceof Error ? e.message : "Could not check the printer.",
      });
      setDevices([]);
    } finally {
      setChecking(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, printer.deviceId]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printer.adapterId]);

  const set = (patch: Partial<LabelSettings>) => updateLabel(patch);
  const selected = devices.find((d) => d.id === printer.deviceId);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 font-medium">
          <Printer className="h-4 w-4" /> Printer
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Print method</Label>
            <Select
              value={printer.adapterId}
              onValueChange={(v) =>
                updatePrinter({ adapterId: v, deviceId: null, deviceName: null })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {printerAdapters.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Printer</Label>
            <Select
              value={printer.deviceId ?? ""}
              onValueChange={(v) => {
                const d = devices.find((x) => x.id === v);
                updatePrinter({ deviceId: v, deviceName: d?.name ?? null });
              }}
              disabled={!devices.length}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={devices.length ? "Choose a printer" : "No printers found"}
                />
              </SelectTrigger>
              <SelectContent>
                {devices.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                    {isZD230(d.name) ? " ✓ ZD230" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3 text-sm">
          {checking ? (
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking…
            </span>
          ) : status?.available ? (
            <span className="inline-flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="h-4 w-4" /> {status.detail ?? "Ready"}
            </span>
          ) : (
            <span className="inline-flex items-start gap-2 text-red-400">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> {status?.error ?? "Not checked yet."}
            </span>
          )}
          {selected && !isZD230(selected.name) && adapter.id === "zebra-browser-print" && (
            <span className="text-xs text-amber-400">
              This is not a ZD230 — label layout is tuned for 50 × 25 mm at 203 DPI.
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => void refresh()}
            disabled={checking}
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Re-detect
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void testPrint()} disabled={busy}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Printer className="mr-2 h-4 w-4" />
            )}{" "}
            Test Print
          </Button>
          {adapter.id === "zebra-browser-print" && (
            <Button
              type="button"
              variant="outline"
              disabled={busy || !status?.available}
              onClick={async () => {
                try {
                  await zebraAdapter.calibrate(selected ?? null);
                  toast.success("Calibration command sent. The printer will feed a few labels.");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Calibration failed.");
                }
              }}
            >
              Calibrate media
            </Button>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-medium">Label layout</h3>
        <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <NumberField
                id="lw"
                label="Width (mm)"
                value={label.widthMm}
                min={20}
                max={110}
                step={0.5}
                onChange={(n) => set({ widthMm: n })}
              />
              <NumberField
                id="lh"
                label="Height (mm)"
                value={label.heightMm}
                min={10}
                max={200}
                step={0.5}
                onChange={(n) => set({ heightMm: n })}
              />
              <div className="space-y-1.5">
                <Label>Printer DPI</Label>
                <Select value={String(label.dpi)} onValueChange={(v) => set({ dpi: Number(v) })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[152, 203, 300, 600].map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d} DPI
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <NumberField
                id="lbh"
                label="Barcode height (dots)"
                value={label.barcodeHeight}
                min={20}
                max={400}
                onChange={(n) => set({ barcodeHeight: n })}
              />
              <NumberField
                id="lmw"
                label="Bar width (dots)"
                value={label.moduleWidth}
                min={1}
                max={6}
                onChange={(n) => set({ moduleWidth: n })}
              />
              <NumberField
                id="lmx"
                label="Side margin (dots)"
                value={label.marginX}
                min={0}
                max={100}
                onChange={(n) => set({ marginX: n })}
              />
            </div>
            <details className="rounded-lg border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Text positions (dots from the top)
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <NumberField
                  id="ly1"
                  label="Brand"
                  value={label.brandY}
                  onChange={(n) => set({ brandY: n })}
                />
                <NumberField
                  id="ly2"
                  label="Product name"
                  value={label.nameY}
                  onChange={(n) => set({ nameY: n })}
                />
                <NumberField
                  id="ly3"
                  label="Size / colour"
                  value={label.attrY}
                  onChange={(n) => set({ attrY: n })}
                />
                <NumberField
                  id="ly4"
                  label="Barcode"
                  value={label.barcodeY}
                  onChange={(n) => set({ barcodeY: n })}
                />
                <NumberField
                  id="ly5"
                  label="Barcode number"
                  value={label.codeTextY}
                  onChange={(n) => set({ codeTextY: n })}
                />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Switch
                  id="lsb"
                  checked={label.showBrand}
                  onCheckedChange={(v) => set({ showBrand: v })}
                />
                <Label htmlFor="lsb">Print “KAAL VASTR” heading</Label>
              </div>
            </details>
            <p className="text-xs text-muted-foreground">
              Labels never include selling price, purchase price or profit. Number of copies is
              chosen when you print.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                resetLabel();
                toast.success(
                  `Label layout reset to ${DEFAULT_LABEL_SETTINGS.widthMm} × ${DEFAULT_LABEL_SETTINGS.heightMm} mm.`,
                );
              }}
            >
              Reset label layout
            </Button>
          </div>
          <LabelPreview
            item={{ ...TEST_LABEL_ITEM, barcode: "KV000001", productName: "Oversized T-Shirt" }}
            settings={label}
          />
        </div>
      </section>
    </div>
  );
}
