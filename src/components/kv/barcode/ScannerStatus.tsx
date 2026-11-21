import { cn } from "@/lib/utils";
import type { ScanEvent, ScannerState } from "@/lib/kv/barcode/scanner";

export function ScannerStatus({
  state,
  windowFocused,
  lastScan,
}: {
  state: ScannerState;
  windowFocused: boolean;
  lastScan: ScanEvent | null;
}) {
  const [dot, text] = !windowFocused
    ? ["bg-amber-400", "Click anywhere on this page to activate the scanner"]
    : state === "receiving"
      ? ["bg-sky-400 animate-pulse", "Receiving scan…"]
      : ["bg-emerald-400", "Scanner ready — scan a barcode"];
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
      role="status"
      aria-live="polite"
    >
      <span className="inline-flex items-center gap-2">
        <span className={cn("h-2.5 w-2.5 rounded-full", dot)} />
        {text}
      </span>
      {lastScan && (
        <span className="text-xs text-muted-foreground">
          Last: <span className="font-mono">{lastScan.code}</span>
          {lastScan.source === "scanner"
            ? ` · ${lastScan.avgGapMs.toFixed(0)} ms/char`
            : " · typed"}
        </span>
      )}
    </div>
  );
}
