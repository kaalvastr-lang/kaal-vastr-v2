import { useCallback, useEffect, useState } from "react";

/**
 * Workstation settings (scanner, label, printer).
 *
 * These describe the hardware on THIS counter, so they live in the browser's
 * localStorage rather than the shared database. Every reader is defensive:
 * storage can be blocked or hold stale/invalid JSON.
 */

export type ScannerInputMode = "auto" | "dedicated";

export interface ScannerSettings {
  /** auto: detect scanner bursts anywhere on the page. dedicated: only inside the scan box. */
  inputMode: ScannerInputMode;
  /** Scanner sends Enter after the code — end the scan immediately and consume the key. */
  enterSuffix: boolean;
  /** Scanner sends Tab after the code. */
  tabSuffix: boolean;
  /** Anything shorter than this is ignored as stray typing. */
  minLength: number;
  /**
   * Max gap between characters (ms) for input to count as scanner speed. It is also the
   * silence after which a scan with no suffix is considered finished.
   */
  scanTimeoutMs: number;
  /** Play a short beep on a good / bad scan. */
  beep: boolean;
}

export const DEFAULT_SCANNER_SETTINGS: ScannerSettings = {
  inputMode: "auto",
  enterSuffix: true,
  tabSuffix: false,
  minLength: 4,
  scanTimeoutMs: 80,
  beep: true,
};

export interface LabelSettings {
  widthMm: number;
  heightMm: number;
  dpi: number;
  /** Barcode bar height in dots. */
  barcodeHeight: number;
  /** Width of the narrowest bar in dots (^BY). 2 is a safe minimum at 203 DPI. */
  moduleWidth: number;
  /** Left/right safe margin in dots. */
  marginX: number;
  /** Vertical positions (dots from the top) of each text row and the barcode. */
  brandY: number;
  nameY: number;
  attrY: number;
  barcodeY: number;
  codeTextY: number;
  /** Font heights in dots. */
  brandFont: number;
  nameFont: number;
  attrFont: number;
  codeFont: number;
  showBrand: boolean;
}

export const DEFAULT_LABEL_SETTINGS: LabelSettings = {
  widthMm: 50,
  heightMm: 25,
  dpi: 203,
  barcodeHeight: 62,
  moduleWidth: 2,
  marginX: 12,
  brandY: 8,
  nameY: 36,
  attrY: 66,
  barcodeY: 94,
  codeTextY: 164,
  brandFont: 24,
  nameFont: 26,
  attrFont: 22,
  codeFont: 24,
  showBrand: true,
};

export interface PrinterSettings {
  adapterId: string;
  /** Last selected device id for the Zebra adapter. */
  deviceId: string | null;
  deviceName: string | null;
}

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  adapterId: "zebra-browser-print",
  deviceId: null,
  deviceName: null,
};

const KEYS = {
  scanner: "kv.scanner.settings.v1",
  label: "kv.label.settings.v1",
  printer: "kv.printer.settings.v1",
} as const;

function read<T extends object>(key: string, defaults: T): T {
  try {
    if (typeof window === "undefined") return defaults;
    const raw = window.localStorage.getItem(key);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<T>;
    if (!parsed || typeof parsed !== "object") return defaults;
    const out = { ...defaults } as T;
    for (const k of Object.keys(defaults) as (keyof T)[]) {
      const v = parsed[k];
      if (v !== undefined && typeof v === typeof defaults[k]) out[k] = v as T[keyof T];
    }
    return out;
  } catch {
    return defaults;
  }
}

function write(key: string, value: object) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("kv-settings", { detail: key }));
  } catch {
    /* storage blocked — settings simply do not persist */
  }
}

export const loadScannerSettings = () =>
  sanitizeScanner(read(KEYS.scanner, DEFAULT_SCANNER_SETTINGS));
export const loadLabelSettings = () => sanitizeLabel(read(KEYS.label, DEFAULT_LABEL_SETTINGS));
export const loadPrinterSettings = () => read(KEYS.printer, DEFAULT_PRINTER_SETTINGS);

export function sanitizeScanner(s: ScannerSettings): ScannerSettings {
  return {
    ...s,
    inputMode: s.inputMode === "dedicated" ? "dedicated" : "auto",
    minLength: clampInt(s.minLength, 3, 40, DEFAULT_SCANNER_SETTINGS.minLength),
    scanTimeoutMs: clampInt(s.scanTimeoutMs, 20, 500, DEFAULT_SCANNER_SETTINGS.scanTimeoutMs),
  };
}

export function sanitizeLabel(s: LabelSettings): LabelSettings {
  return {
    ...s,
    widthMm: clampNum(s.widthMm, 20, 110, DEFAULT_LABEL_SETTINGS.widthMm),
    heightMm: clampNum(s.heightMm, 10, 200, DEFAULT_LABEL_SETTINGS.heightMm),
    dpi: [152, 203, 300, 600].includes(s.dpi) ? s.dpi : DEFAULT_LABEL_SETTINGS.dpi,
    barcodeHeight: clampInt(s.barcodeHeight, 20, 400, DEFAULT_LABEL_SETTINGS.barcodeHeight),
    moduleWidth: clampInt(s.moduleWidth, 1, 6, DEFAULT_LABEL_SETTINGS.moduleWidth),
    marginX: clampInt(s.marginX, 0, 100, DEFAULT_LABEL_SETTINGS.marginX),
    brandY: clampInt(s.brandY, 0, 1200, DEFAULT_LABEL_SETTINGS.brandY),
    nameY: clampInt(s.nameY, 0, 1200, DEFAULT_LABEL_SETTINGS.nameY),
    attrY: clampInt(s.attrY, 0, 1200, DEFAULT_LABEL_SETTINGS.attrY),
    barcodeY: clampInt(s.barcodeY, 0, 1200, DEFAULT_LABEL_SETTINGS.barcodeY),
    codeTextY: clampInt(s.codeTextY, 0, 1200, DEFAULT_LABEL_SETTINGS.codeTextY),
    brandFont: clampInt(s.brandFont, 8, 120, DEFAULT_LABEL_SETTINGS.brandFont),
    nameFont: clampInt(s.nameFont, 8, 120, DEFAULT_LABEL_SETTINGS.nameFont),
    attrFont: clampInt(s.attrFont, 8, 120, DEFAULT_LABEL_SETTINGS.attrFont),
    codeFont: clampInt(s.codeFont, 8, 120, DEFAULT_LABEL_SETTINGS.codeFont),
  };
}

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
function clampNum(v: unknown, min: number, max: number, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function useStoredSettings<T extends object>(
  key: string,
  load: () => T,
  sanitize: (v: T) => T,
): [T, (patch: Partial<T>) => void, () => void] {
  const [value, setValue] = useState<T>(load);

  // Keep every component using the same setting in sync (and other tabs too).
  useEffect(() => {
    const refresh = () => setValue(load());
    const onCustom = (e: Event) => {
      if ((e as CustomEvent).detail === key) refresh();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) refresh();
    };
    window.addEventListener("kv-settings", onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("kv-settings", onCustom);
      window.removeEventListener("storage", onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (patch: Partial<T>) => {
      const next = sanitize({ ...load(), ...patch });
      write(key, next);
      setValue(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const reset = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent("kv-settings", { detail: key }));
    setValue(load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [value, update, reset];
}

export const useScannerSettings = () =>
  useStoredSettings(KEYS.scanner, loadScannerSettings, sanitizeScanner);
export const useLabelSettings = () =>
  useStoredSettings(KEYS.label, loadLabelSettings, sanitizeLabel);
export const usePrinterSettings = () =>
  useStoredSettings(KEYS.printer, loadPrinterSettings, (s) => s);

export function savePrinterSettings(patch: Partial<PrinterSettings>) {
  write(KEYS.printer, { ...loadPrinterSettings(), ...patch });
}
