import { useMemo } from "react";
import { buildLabelModel, labelToSvg, type LabelItem } from "@/lib/kv/barcode/label";
import type { LabelSettings } from "@/lib/kv/barcode/settings";

/** Exact on-screen rendering of the 50 × 25 mm label (same model the printer uses). */
export function LabelPreview({
  item,
  settings,
  className,
}: {
  item: LabelItem;
  settings: LabelSettings;
  className?: string;
}) {
  const { svg, warnings, error } = useMemo(() => {
    try {
      return {
        svg: labelToSvg(item, settings, { border: true }),
        warnings: buildLabelModel(item, settings).warnings,
        error: null,
      };
    } catch (e) {
      return {
        svg: "",
        warnings: [] as string[],
        error: e instanceof Error ? e.message : "Cannot draw label",
      };
    }
  }, [item, settings]);
  return (
    <div className={className}>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <div
          className="w-full max-w-[400px] overflow-hidden rounded border border-border bg-white shadow-sm"
          // SVG is generated locally from escaped text.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        {settings.widthMm} × {settings.heightMm} mm · {settings.dpi} DPI
      </p>
      {warnings.map((w) => (
        <p key={w} className="mt-1 text-xs text-amber-400">
          {w}
        </p>
      ))}
    </div>
  );
}
