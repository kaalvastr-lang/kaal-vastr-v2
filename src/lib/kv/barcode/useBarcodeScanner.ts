import { useCallback, useEffect, useRef, useState } from "react";
import {
  createScannerAdapter,
  makeManualEvent,
  type IgnoredInput,
  type ScanEvent,
  type ScannerState,
} from "./scanner";
import { useScannerSettings } from "./settings";

export interface UseBarcodeScannerOptions {
  /** Turn the listener off (e.g. while a dialog is open). Default true. */
  enabled?: boolean;
  onIgnored?: (info: IgnoredInput) => void;
}

/**
 * React binding for the scanner service. The window listener is created once per mount, and the
 * latest `onScan` / settings are read through refs, so re-renders never lose or duplicate a scan.
 */
export function useBarcodeScanner(
  onScan: (event: ScanEvent) => void,
  options: UseBarcodeScannerOptions = {},
) {
  const { enabled = true, onIgnored } = options;
  const [settings] = useScannerSettings();
  const [state, setState] = useState<ScannerState>("idle");
  const [lastScan, setLastScan] = useState<ScanEvent | null>(null);
  const [windowFocused, setWindowFocused] = useState(true);

  const settingsRef = useRef(settings);
  const onScanRef = useRef(onScan);
  const onIgnoredRef = useRef(onIgnored);
  useEffect(() => {
    settingsRef.current = settings;
    onScanRef.current = onScan;
    onIgnoredRef.current = onIgnored;
  });

  useEffect(() => {
    if (!enabled) return;
    const adapter = createScannerAdapter("keyboard-wedge");
    adapter.start(
      {
        onScan: (e) => {
          setLastScan(e);
          onScanRef.current(e);
        },
        onState: setState,
        onIgnored: (i) => onIgnoredRef.current?.(i),
      },
      () => settingsRef.current,
    );
    return () => adapter.stop();
  }, [enabled]);

  // Keyboard events only reach the page while the window has focus.
  useEffect(() => {
    const on = () => setWindowFocused(true);
    const off = () => setWindowFocused(false);
    setWindowFocused(typeof document === "undefined" ? true : document.hasFocus());
    window.addEventListener("focus", on);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("focus", on);
      window.removeEventListener("blur", off);
    };
  }, []);

  /** Manual barcode entry goes through the exact same pipeline as a scan. */
  const submitManual = useCallback((raw: string) => {
    const e = makeManualEvent(raw);
    if (!e.code) return false;
    setLastScan(e);
    onScanRef.current(e);
    return true;
  }, []);

  return { state, lastScan, windowFocused, submitManual, settings };
}
