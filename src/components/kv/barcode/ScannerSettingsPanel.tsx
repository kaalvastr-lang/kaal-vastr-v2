import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useScannerSettings, type ScannerInputMode } from "@/lib/kv/barcode/settings";
import { useBarcodeScanner } from "@/lib/kv/barcode/useBarcodeScanner";
import type { ScanEvent } from "@/lib/kv/barcode/scanner";
import { ScannerStatus } from "./ScannerStatus";

/** Scanner configuration + a live "Test Scanner" box. Works with any keyboard-wedge scanner. */
export function ScannerSettingsPanel() {
  const [s, update, reset] = useScannerSettings();
  const [tested, setTested] = useState<ScanEvent | null>(null);
  const [ignored, setIgnored] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const { state, lastScan, windowFocused, submitManual } = useBarcodeScanner(
    (e) => {
      setTested(e);
      setIgnored(null);
    },
    { onIgnored: (i) => setIgnored(`Ignored "${i.raw}" — shorter than the minimum length.`) },
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Scanner input mode</Label>
          <Select
            value={s.inputMode}
            onValueChange={(v) => update({ inputMode: v as ScannerInputMode })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto — detect scans anywhere on the page</SelectItem>
              <SelectItem value="dedicated">Dedicated — only inside the scan box</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="kv-min-len">Minimum barcode length</Label>
          <Input
            id="kv-min-len"
            type="number"
            min={3}
            max={40}
            value={s.minLength}
            onChange={(e) => update({ minLength: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="kv-timeout">Scan timeout (ms)</Label>
          <Input
            id="kv-timeout"
            type="number"
            min={20}
            max={500}
            value={s.scanTimeoutMs}
            onChange={(e) => update({ scanTimeoutMs: Number(e.target.value) })}
          />
          <p className="text-xs text-muted-foreground">
            Longest pause between characters that still counts as a scanner. Raise it (e.g. 120–200)
            for slow Bluetooth scanners. Also the silence that ends a scan when the scanner sends no
            Enter/Tab.
          </p>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <Label htmlFor="kv-enter">Scanner sends Enter after the code</Label>
            <Switch
              id="kv-enter"
              checked={s.enterSuffix}
              onCheckedChange={(v) => update({ enterSuffix: v })}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <Label htmlFor="kv-tab">Scanner sends Tab after the code</Label>
            <Switch
              id="kv-tab"
              checked={s.tabSuffix}
              onCheckedChange={(v) => update({ tabSuffix: v })}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <Label htmlFor="kv-beep">Beep on scan</Label>
            <Switch id="kv-beep" checked={s.beep} onCheckedChange={(v) => update({ beep: v })} />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border p-4">
        <p className="mb-2 font-medium">Test Scanner</p>
        <ScannerStatus state={state} windowFocused={windowFocused} lastScan={lastScan} />
        <div className="mt-3 flex gap-2">
          <Input
            data-scan-input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && manual.trim()) {
                e.preventDefault();
                submitManual(manual);
                setManual("");
              }
            }}
            placeholder="Scan a barcode here (or type one and press Enter)"
            autoComplete="off"
            className="font-mono"
          />
        </div>
        {tested ? (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Code</dt>
              <dd className="font-mono">{tested.code}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Source</dt>
              <dd>{tested.source === "scanner" ? "Scanner (fast input)" : "Typed by hand"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Length</dt>
              <dd>{tested.length}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Speed</dt>
              <dd>{tested.source === "scanner" ? `${tested.avgGapMs.toFixed(1)} ms/char` : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Ended by</dt>
              <dd>{tested.terminator}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Scan any barcode to see how your scanner behaves.
          </p>
        )}
        {ignored && <p className="mt-2 text-sm text-amber-400">{ignored}</p>}
        <p className="mt-3 text-xs text-muted-foreground">
          Tip: if "Ended by" says <em>idle</em>, your scanner sends no Enter/Tab — that is fine. If
          the code arrives cut short or with extra characters, increase the scan timeout.
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={reset}>
        Reset scanner settings
      </Button>
    </div>
  );
}
