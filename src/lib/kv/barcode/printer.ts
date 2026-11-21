import { buildZpl, labelToSvg, TEST_LABEL_ITEM, type LabelItem } from "./label";
import type { LabelSettings } from "./settings";

/**
 * Label-printer layer. Completely separate from the scanner layer.
 *
 * A website cannot talk to a raw USB printer. The Zebra adapter therefore goes through the
 * "Zebra Browser Print" service that runs on the shop PC (http://localhost:9100). A second
 * adapter prints through the normal browser print dialog (any installed printer/driver) so
 * labels can still be produced if Browser Print is unavailable. More printers can be added
 * by implementing PrinterAdapter and registering it in `printerAdapters`.
 */

export interface PrinterDevice {
  id: string;
  name: string;
  connection?: string;
  manufacturer?: string;
  /** Opaque adapter data (for Zebra: the device object Browser Print expects back). */
  raw?: unknown;
}

export interface LabelJob {
  item: LabelItem;
  copies: number;
  /** Optional variant id so history rows can link back. */
  variantId?: string;
}

export interface PrinterStatus {
  available: boolean;
  /** Human readable explanation when unavailable. */
  error?: string;
  detail?: string;
}

export class PrintError extends Error {
  /** How many jobs (label designs) were fully sent before the failure. */
  readonly jobsPrinted: number;
  constructor(message: string, jobsPrinted = 0) {
    super(message);
    this.name = "PrintError";
    this.jobsPrinted = jobsPrinted;
  }
}

export interface PrinterAdapter {
  readonly id: string;
  readonly label: string;
  detect(): Promise<PrinterStatus>;
  listPrinters(): Promise<PrinterDevice[]>;
  printLabels(
    device: PrinterDevice | null,
    jobs: LabelJob[],
    settings: LabelSettings,
    onProgress?: (jobsDone: number, jobsTotal: number) => void,
  ): Promise<void>;
  testPrint(device: PrinterDevice | null, settings: LabelSettings): Promise<void>;
  /** Raw printer command (ZPL). Only adapters that speak a printer language provide it. */
  sendRaw?(device: PrinterDevice | null, data: string): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Zebra Browser Print                                                  */
/* ------------------------------------------------------------------ */

const ZEBRA_BASES = ["http://localhost:9100", "https://localhost:9101"];
/** Label designs per request; keeps payloads small and failures recoverable. */
const ZEBRA_CHUNK = 25;

interface ZebraDevice {
  deviceType?: string;
  uid: string;
  provider?: string;
  name: string;
  connection?: string;
  version?: number;
  manufacturer?: string;
}

async function timedFetch(url: string, init: RequestInit = {}, ms = 4000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function friendlyNetworkError(e: unknown): string {
  if (e instanceof DOMException && e.name === "AbortError") {
    return "Zebra Browser Print did not respond in time. Check that it is running.";
  }
  return (
    "Cannot reach Zebra Browser Print on this computer. Install it, make sure its tray icon is running, " +
    "and allow this site to connect to local devices if the browser asks."
  );
}

export class ZebraBrowserPrintAdapter implements PrinterAdapter {
  readonly id = "zebra-browser-print";
  readonly label = "Zebra Browser Print (ZPL)";
  private base: string | null = null;

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const bases = this.base ? [this.base] : ZEBRA_BASES;
    let lastError: unknown = null;
    for (const base of bases) {
      try {
        const res = await timedFetch(base + path, init);
        this.base = base;
        return res;
      } catch (e) {
        lastError = e;
      }
    }
    this.base = null;
    throw new PrintError(friendlyNetworkError(lastError));
  }

  async detect(): Promise<PrinterStatus> {
    try {
      const res = await this.request("/available");
      if (!res.ok) return { available: false, error: `Browser Print answered ${res.status}.` };
      return { available: true, detail: `Connected to ${this.base}` };
    } catch (e) {
      return { available: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async listPrinters(): Promise<PrinterDevice[]> {
    const res = await this.request("/available");
    if (!res.ok)
      throw new PrintError(`Browser Print answered ${res.status} when listing printers.`);
    const json = (await res.json().catch(() => ({}))) as { printer?: ZebraDevice[] };
    const devices = json.printer ?? [];
    return devices.map((d) => ({
      id: d.uid,
      name: d.name,
      connection: d.connection,
      manufacturer: d.manufacturer,
      raw: d,
    }));
  }

  /** Browser Print's own default printer, if it has one. */
  async defaultPrinter(): Promise<PrinterDevice | null> {
    try {
      const res = await this.request("/default?type=printer");
      if (!res.ok) return null;
      const text = await res.text();
      if (!text.trim()) return null;
      const d = JSON.parse(text) as ZebraDevice;
      return d?.uid
        ? {
            id: d.uid,
            name: d.name,
            connection: d.connection,
            manufacturer: d.manufacturer,
            raw: d,
          }
        : null;
    } catch {
      return null;
    }
  }

  async sendRaw(device: PrinterDevice | null, data: string): Promise<void> {
    const target = device ?? (await this.defaultPrinter());
    if (!target)
      throw new PrintError("No printer selected. Choose your Zebra printer in Printer settings.");
    // text/plain keeps this a "simple" cross-origin request (no CORS preflight).
    const res = await this.request("/write", {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ device: target.raw ?? { uid: target.id, name: target.name }, data }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new PrintError(`The printer rejected the job (${res.status}). ${body}`.trim());
    }
  }

  async printLabels(
    device: PrinterDevice | null,
    jobs: LabelJob[],
    settings: LabelSettings,
    onProgress?: (done: number, total: number) => void,
  ): Promise<void> {
    if (!jobs.length) return;
    // Build everything first so a bad barcode fails before anything is sent.
    const payloads = jobs.map((j) => buildZpl(j.item, settings, j.copies));
    let done = 0;
    for (let i = 0; i < payloads.length; i += ZEBRA_CHUNK) {
      const slice = payloads.slice(i, i + ZEBRA_CHUNK);
      try {
        await this.sendRaw(device, slice.join("\n"));
      } catch (e) {
        throw new PrintError(e instanceof Error ? e.message : String(e), done);
      }
      done += slice.length;
      onProgress?.(done, payloads.length);
    }
  }

  async testPrint(device: PrinterDevice | null, settings: LabelSettings): Promise<void> {
    await this.printLabels(device, [{ item: TEST_LABEL_ITEM, copies: 1 }], settings);
  }

  /** Ask the printer to measure the label gap (~JC). Feeds a few labels. */
  async calibrate(device: PrinterDevice | null): Promise<void> {
    await this.sendRaw(device, "~JC");
  }
}

/* ------------------------------------------------------------------ */
/* Browser print dialog fallback                                        */
/* ------------------------------------------------------------------ */

const MAX_SYSTEM_PAGES = 500;

export class SystemPrintAdapter implements PrinterAdapter {
  readonly id = "system-dialog";
  readonly label = "Browser print dialog (any installed printer)";

  async detect(): Promise<PrinterStatus> {
    return typeof window !== "undefined"
      ? {
          available: true,
          detail: "Uses the standard print dialog. Pick your label printer there.",
        }
      : { available: false, error: "Printing is only available in the browser." };
  }

  async listPrinters(): Promise<PrinterDevice[]> {
    return [{ id: "system", name: "System print dialog" }];
  }

  async printLabels(
    _device: PrinterDevice | null,
    jobs: LabelJob[],
    settings: LabelSettings,
  ): Promise<void> {
    const total = jobs.reduce((a, j) => a + j.copies, 0);
    if (total > MAX_SYSTEM_PAGES) {
      throw new PrintError(
        `The print dialog can handle at most ${MAX_SYSTEM_PAGES} labels at once. Print in smaller batches.`,
      );
    }
    const pages: string[] = [];
    for (const j of jobs) {
      const svg = labelToSvg(j.item, settings, { mmSized: true });
      for (let i = 0; i < j.copies; i++) pages.push(`<div class="label">${svg}</div>`);
    }
    const html =
      `<!doctype html><html><head><meta charset="utf-8"><title>Labels</title><style>` +
      `@page{size:${settings.widthMm}mm ${settings.heightMm}mm;margin:0}` +
      `html,body{margin:0;padding:0;background:#fff}` +
      `.label{width:${settings.widthMm}mm;height:${settings.heightMm}mm;overflow:hidden;page-break-after:always;break-after:page}` +
      `.label svg{display:block}` +
      `</style></head><body>${pages.join("")}</body></html>`;
    await printHtmlInIframe(html);
  }

  async testPrint(device: PrinterDevice | null, settings: LabelSettings): Promise<void> {
    await this.printLabels(device, [{ item: TEST_LABEL_ITEM, copies: 1 }], settings);
  }
}

function printHtmlInIframe(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new PrintError("Printing is only available in the browser."));
      return;
    }
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    Object.assign(frame.style, {
      position: "fixed",
      right: "0",
      bottom: "0",
      width: "0",
      height: "0",
      border: "0",
    });
    frame.onload = () => {
      try {
        const win = frame.contentWindow;
        if (!win) throw new Error("no print window");
        win.focus();
        win.print();
        resolve();
      } catch (e) {
        reject(new PrintError(e instanceof Error ? e.message : "Could not open the print dialog."));
      } finally {
        setTimeout(() => frame.remove(), 60_000);
      }
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}

/* ------------------------------------------------------------------ */
/* Registry                                                             */
/* ------------------------------------------------------------------ */

const zebra = new ZebraBrowserPrintAdapter();
const system = new SystemPrintAdapter();

export const printerAdapters: PrinterAdapter[] = [zebra, system];

export function getPrinterAdapter(id: string): PrinterAdapter {
  return printerAdapters.find((a) => a.id === id) ?? zebra;
}

export const zebraAdapter = zebra;

/** True for Zebra ZD230 family names such as "ZDesigner ZD230-203dpi ZPL". */
export const isZD230 = (name: string) => /ZD\s?230/i.test(name);
