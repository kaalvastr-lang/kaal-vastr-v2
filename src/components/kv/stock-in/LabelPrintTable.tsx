import { useMemo, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useLabelSettings } from "@/lib/kv/barcode/settings";
import { usePrinting } from "@/lib/kv/barcode/usePrinting";
import type { LabelJob } from "@/lib/kv/barcode/printer";
import { LabelPreview } from "@/components/kv/barcode/LabelPreview";

export interface LabelRow {
  variantId: string;
  barcode: string;
  productName: string;
  size: string;
  colour: string;
  /** Pieces received / in stock — shown for context. */
  quantity?: number;
  defaultCopies: number;
}

/**
 * Preview + print/reprint labels for a list of variants. Copies are per row so 20 identical
 * T-shirts print 20 copies of ONE barcode.
 */
export function LabelPrintTable({
  rows,
  quantityHeader = "Qty",
}: {
  rows: LabelRow[];
  quantityHeader?: string;
}) {
  const [label] = useLabelSettings();
  const { print, testPrint, busy } = usePrinting();
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [previewId, setPreviewId] = useState<string | null>(null);

  const copiesOf = (r: LabelRow) => copies[r.variantId] ?? r.defaultCopies;
  const preview = rows.find((r) => r.variantId === (previewId ?? rows[0]?.variantId)) ?? rows[0];
  const selectedRows = useMemo(() => rows.filter((r) => selected[r.variantId]), [rows, selected]);
  const totalAll = rows.reduce((a, r) => a + copiesOf(r), 0);
  const totalSel = selectedRows.reduce((a, r) => a + copiesOf(r), 0);

  const toJob = (r: LabelRow): LabelJob => ({
    variantId: r.variantId,
    copies: copiesOf(r),
    item: { barcode: r.barcode, productName: r.productName, size: r.size, colour: r.colour },
  });

  if (!rows.length)
    return <p className="py-6 text-center text-sm text-muted-foreground">Nothing to print yet.</p>;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="w-9 p-2">
                  <Checkbox
                    aria-label="Select all"
                    checked={rows.length > 0 && selectedRows.length === rows.length}
                    onCheckedChange={(v) =>
                      setSelected(Object.fromEntries(rows.map((r) => [r.variantId, v === true])))
                    }
                  />
                </th>
                <th className="p-2">Product</th>
                <th className="p-2">Size / Colour</th>
                <th className="p-2">Barcode</th>
                <th className="p-2 text-right">{quantityHeader}</th>
                <th className="w-24 p-2">Labels</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.variantId}
                  onClick={() => setPreviewId(r.variantId)}
                  className={
                    "cursor-pointer border-t border-border hover:bg-muted/30 " +
                    (preview?.variantId === r.variantId ? "bg-muted/30" : "")
                  }
                >
                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      aria-label={`Select ${r.barcode}`}
                      checked={!!selected[r.variantId]}
                      onCheckedChange={(v) =>
                        setSelected((s) => ({ ...s, [r.variantId]: v === true }))
                      }
                    />
                  </td>
                  <td className="p-2">{r.productName}</td>
                  <td className="p-2">
                    {r.size}
                    {r.colour ? ` / ${r.colour}` : ""}
                  </td>
                  <td className="p-2 font-mono">{r.barcode}</td>
                  <td className="p-2 text-right">{r.quantity ?? "—"}</td>
                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                    <Input
                      type="number"
                      min={0}
                      max={5000}
                      className="h-8 w-20"
                      value={copiesOf(r)}
                      aria-label={`Labels for ${r.barcode}`}
                      onChange={(e) =>
                        setCopies((c) => ({
                          ...c,
                          [r.variantId]: Math.max(
                            0,
                            Math.min(5000, Math.floor(Number(e.target.value) || 0)),
                          ),
                        }))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void print(rows.map(toJob))}
            disabled={busy || totalAll === 0}
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Printer className="mr-2 h-4 w-4" />
            )}
            Print All Labels ({totalAll})
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void print(selectedRows.map(toJob))}
            disabled={busy || totalSel === 0}
          >
            Print Selected Labels ({totalSel})
          </Button>
          <Button type="button" variant="ghost" onClick={() => void testPrint()} disabled={busy}>
            Test Print
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Printing never changes stock. If a print fails, just press the button again.
        </p>
      </div>
      {preview && (
        <div>
          <p className="mb-2 text-sm font-medium">Label preview</p>
          <LabelPreview
            item={{
              barcode: preview.barcode,
              productName: preview.productName,
              size: preview.size,
              colour: preview.colour,
            }}
            settings={label}
          />
        </div>
      )}
    </div>
  );
}
