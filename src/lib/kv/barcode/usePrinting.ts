import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { logPrintJobs, type PrintJobInput } from "@/services/barcodeInventory";
import { TEST_LABEL_ITEM } from "./label";
import { getPrinterAdapter, PrintError, type LabelJob, type PrinterDevice } from "./printer";
import { useLabelSettings, usePrinterSettings } from "./settings";

export interface PrintOutcome {
  ok: boolean;
  printed: number;
  error?: string;
}

/**
 * Prints label jobs with the configured printer and records every attempt in print history.
 * Printing is completely independent of stock: a failure here never touches inventory, and
 * the same jobs can be retried any number of times.
 */
export function usePrinting() {
  const [printer] = usePrinterSettings();
  const [label] = useLabelSettings();
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  const resolveDevice = useCallback(async (): Promise<PrinterDevice | null> => {
    const adapter = getPrinterAdapter(printer.adapterId);
    if (!printer.deviceId) return null;
    const devices = await adapter.listPrinters();
    return devices.find((d) => d.id === printer.deviceId) ?? null;
  }, [printer.adapterId, printer.deviceId]);

  const print = useCallback(
    async (jobs: LabelJob[]): Promise<PrintOutcome> => {
      const clean = jobs.filter((j) => j.copies > 0);
      if (!clean.length) return { ok: false, printed: 0, error: "Nothing selected to print." };
      const adapter = getPrinterAdapter(printer.adapterId);
      setBusy(true);
      let printed = 0;
      let error: string | undefined;
      try {
        const device = await resolveDevice();
        await adapter.printLabels(device, clean, label);
        printed = clean.length;
      } catch (e) {
        error = e instanceof Error ? e.message : "Printing failed.";
        printed = e instanceof PrintError ? e.jobsPrinted : 0;
      } finally {
        setBusy(false);
      }
      const rows: PrintJobInput[] = clean.map((j, i) => ({
        variant_id: j.variantId ?? null,
        barcode: j.item.barcode,
        product_name: j.item.productName,
        size: j.item.size,
        colour: j.item.colour,
        copies: j.copies,
        status: i < printed ? "success" : "failed",
        printer_name: printer.deviceName ?? adapter.label,
        error: i < printed ? null : (error ?? null),
      }));
      void logPrintJobs(rows).then(() => qc.invalidateQueries({ queryKey: ["kv-print-jobs"] }));
      if (error)
        toast.error(error, {
          description: printed
            ? `${printed} of ${clean.length} label designs were sent. Retry to print the rest.`
            : "Stock was not affected — you can retry printing.",
        });
      else
        toast.success(`Sent ${clean.reduce((a, j) => a + j.copies, 0)} label(s) to the printer.`);
      return { ok: !error, printed, error };
    },
    [label, printer.adapterId, printer.deviceName, qc, resolveDevice],
  );

  const testPrint = useCallback(async () => {
    const adapter = getPrinterAdapter(printer.adapterId);
    setBusy(true);
    let error: string | undefined;
    try {
      await adapter.testPrint(await resolveDevice(), label);
      toast.success("Test label sent to the printer.");
    } catch (e) {
      error = e instanceof Error ? e.message : "Test print failed.";
      toast.error(error);
    } finally {
      setBusy(false);
    }
    void logPrintJobs([
      {
        barcode: TEST_LABEL_ITEM.barcode,
        product_name: TEST_LABEL_ITEM.productName,
        size: TEST_LABEL_ITEM.size,
        colour: TEST_LABEL_ITEM.colour,
        copies: 1,
        status: error ? "failed" : "test",
        printer_name: printer.deviceName ?? adapter.label,
        error: error ?? null,
      },
    ]).then(() => qc.invalidateQueries({ queryKey: ["kv-print-jobs"] }));
    return !error;
  }, [label, printer.adapterId, printer.deviceName, qc, resolveDevice]);

  return { print, testPrint, busy };
}
