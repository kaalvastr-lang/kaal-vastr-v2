import type { ScannerSettings } from "./settings";

/**
 * Universal barcode-scanner input service (no brand-specific code, no drivers).
 *
 * Almost every USB / wireless-dongle / Bluetooth-HID scanner (Zebra, Honeywell, TVS, Symbol,
 * generic) behaves like a keyboard: it "types" the barcode very fast and usually ends with
 * Enter (sometimes Tab, sometimes nothing). KeyboardWedgeScanner recognises that pattern:
 *
 *  - It listens on `window` (capture phase) once, OUTSIDE React's render cycle, so component
 *    re-renders can neither drop a scan nor deliver it twice.
 *  - Characters arriving faster than `scanTimeoutMs` apart form a burst. Normal human typing is
 *    far slower than that, so ordinary typing is never captured.
 *  - A burst ends on Enter / Tab (if enabled) or, when the scanner sends no suffix, after
 *    `scanTimeoutMs` of silence. In ordinary text fields (e.g. customer name) only a suffix
 *    ends a scan, so quickly typing a phone number is never mistaken for a barcode.
 *  - Characters a scanner typed into a text field are removed again once the burst is
 *    recognised as a scan, and the terminating Enter/Tab is swallowed so forms do not submit.
 *
 * Other transports (Web Serial, WebHID, camera) can be added by implementing ScannerAdapter —
 * the rest of the app only ever sees ScanEvents.
 */

export type ScanTerminator = "enter" | "tab" | "idle" | "manual";

export interface ScanEvent {
  /** Unique, increasing id — consumers can use it to ignore replays. */
  id: number;
  /** Normalised code (trimmed, upper-case) used for lookups. */
  code: string;
  /** Exactly the characters that arrived. */
  raw: string;
  source: "scanner" | "manual";
  terminator: ScanTerminator;
  length: number;
  /** Average milliseconds between characters (0 for manual entry). */
  avgGapMs: number;
  durationMs: number;
  at: number;
}

export type ScannerState = "idle" | "receiving";

export interface IgnoredInput {
  raw: string;
  reason: "too-short";
}

export interface ScannerHandlers {
  onScan: (event: ScanEvent) => void;
  onState?: (state: ScannerState) => void;
  /** Diagnostics only (Test Scanner). */
  onIgnored?: (info: IgnoredInput) => void;
}

export interface ScannerAdapter {
  readonly id: string;
  readonly label: string;
  start(handlers: ScannerHandlers, getSettings: () => ScannerSettings): void;
  stop(): void;
}

let seq = 0;

export function normalizeBarcode(raw: string): string {
  return (
    raw
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .toUpperCase()
  );
}

export function makeManualEvent(raw: string, now = Date.now()): ScanEvent {
  const code = normalizeBarcode(raw);
  return {
    id: ++seq,
    code,
    raw,
    source: "manual",
    terminator: "manual",
    length: code.length,
    avgGapMs: 0,
    durationMs: 0,
    at: now,
  };
}

const MODIFIER_KEYS = new Set([
  "Shift",
  "CapsLock",
  "Control",
  "Alt",
  "AltGraph",
  "Meta",
  "Process",
]);

function isEditable(el: Element | null): boolean {
  if (!el) return false;
  const tag = (el as HTMLElement).tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") {
    const type = ((el as HTMLInputElement).type || "text").toLowerCase();
    return ![
      "button",
      "checkbox",
      "radio",
      "range",
      "color",
      "file",
      "submit",
      "reset",
      "image",
    ].includes(type);
  }
  return (el as HTMLElement).isContentEditable === true;
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  // React listens for the real `input` event to update controlled inputs.
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export interface KeyboardWedgeOptions {
  /** Where to listen. Defaults to `window`; tests pass a jsdom window. */
  target?: EventTarget;
  clock?: () => number;
}

export class KeyboardWedgeScanner implements ScannerAdapter {
  readonly id = "keyboard-wedge";
  readonly label = "USB / Bluetooth keyboard-wedge scanner";

  private handlers: ScannerHandlers | null = null;
  private getSettings: (() => ScannerSettings) | null = null;
  private buf = "";
  private startAt = 0;
  private lastAt = 0;
  private startEl: Element | null = null;
  private startValue: string | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private state: ScannerState = "idle";
  private readonly target: EventTarget;
  private readonly clock: () => number;

  constructor(opts: KeyboardWedgeOptions = {}) {
    this.target = opts.target ?? (typeof window !== "undefined" ? window : (undefined as never));
    this.clock =
      opts.clock ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
  }

  start(handlers: ScannerHandlers, getSettings: () => ScannerSettings) {
    this.stop();
    this.handlers = handlers;
    this.getSettings = getSettings;
    this.target.addEventListener("keydown", this.onKeyDown as EventListener, true);
  }

  stop() {
    this.target?.removeEventListener("keydown", this.onKeyDown as EventListener, true);
    this.clearIdle();
    this.reset();
    this.handlers = null;
    this.getSettings = null;
  }

  private setState(next: ScannerState) {
    if (this.state === next) return;
    this.state = next;
    this.handlers?.onState?.(next);
  }

  private clearIdle() {
    if (this.idleTimer !== undefined) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }

  private reset() {
    this.clearIdle();
    this.buf = "";
    this.startEl = null;
    this.startValue = null;
    this.setState("idle");
  }

  private qualifies(s: ScannerSettings, now: number) {
    return this.buf.length >= s.minLength && now - this.lastAt <= s.scanTimeoutMs;
  }

  private onKeyDown = (ev: KeyboardEvent) => {
    const s = this.getSettings?.();
    if (!s || !this.handlers) return;
    if (ev.isComposing || ev.ctrlKey || ev.metaKey || ev.altKey) {
      this.reset();
      return;
    }
    const el = (ev.target as Element | null) ?? null;
    const inScanBox = !!(el as HTMLElement | null)?.hasAttribute?.("data-scan-input");
    const editable = isEditable(el);
    if (s.inputMode === "dedicated" && !inScanBox) {
      this.reset();
      return;
    }
    const now = this.clock();
    const key = ev.key;

    if (MODIFIER_KEYS.has(key)) return; // scanners may send Shift for capitals

    if (key.length === 1) {
      // Too slow to be a scanner → this is a person typing; start over from this character.
      if (this.buf && now - this.lastAt > s.scanTimeoutMs) this.reset();
      if (!this.buf) {
        this.startAt = now;
        this.startEl = el;
        this.startValue = editable ? ((el as HTMLInputElement).value ?? "") : null;
      } else if (!editable && key !== " ") {
        // Fast follow-up character with nothing to type into: keep it from firing page hotkeys.
        ev.preventDefault();
      }
      this.buf += key;
      this.lastAt = now;
      if (this.buf.length >= 3) this.setState("receiving");
      this.armIdle(s, editable, inScanBox);
      return;
    }

    if (key === "Enter" || key === "Tab") {
      if (this.buf) {
        const enabled = key === "Enter" ? s.enterSuffix : s.tabSuffix;
        // Tolerant by design: if the scanner sends a suffix we were not told about, a qualifying
        // burst in the scan box / on a non-field still ends right here instead of leaking the key.
        const tolerated = !editable || inScanBox;
        if ((enabled || tolerated) && this.qualifies(s, now)) {
          ev.preventDefault();
          ev.stopPropagation();
          this.finish(key === "Enter" ? "enter" : "tab", s, now);
          return;
        }
      }
      this.reset();
      return;
    }

    // Any other key (Backspace, arrows, Escape…) means a person is editing.
    this.reset();
  };

  private armIdle(s: ScannerSettings, editable: boolean, inScanBox: boolean) {
    this.clearIdle();
    // Plain text fields need a real suffix; the scan box and non-fields may finish on silence.
    if (editable && !inScanBox) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined;
      this.finish("idle", s, this.clock());
    }, s.scanTimeoutMs + 10);
  }

  private finish(terminator: ScanTerminator, s: ScannerSettings, now: number) {
    this.clearIdle();
    const raw = this.buf;
    const startEl = this.startEl;
    const startValue = this.startValue;
    const durationMs = Math.max(0, this.lastAt - this.startAt);
    const handlers = this.handlers;
    this.buf = "";
    this.startEl = null;
    this.startValue = null;
    this.setState("idle");
    if (!handlers) return;

    if (raw.length < s.minLength) {
      handlers.onIgnored?.({ raw, reason: "too-short" });
      return;
    }
    // Take back what the scanner typed into a text field.
    if (
      startEl &&
      startValue !== null &&
      isEditable(startEl) &&
      !(startEl as HTMLElement).isContentEditable
    ) {
      const input = startEl as HTMLInputElement;
      if (input.value !== startValue) setNativeValue(input, startValue);
    }
    handlers.onScan({
      id: ++seq,
      code: normalizeBarcode(raw),
      raw,
      source: "scanner",
      terminator,
      length: raw.length,
      avgGapMs: raw.length > 1 ? durationMs / (raw.length - 1) : 0,
      durationMs,
      at: Date.now(),
    });
    void now;
  }
}

/** Registry so new transports can be dropped in without touching the pages. */
export const scannerAdapterFactories: Record<string, () => ScannerAdapter> = {
  "keyboard-wedge": () => new KeyboardWedgeScanner(),
};

export function createScannerAdapter(id = "keyboard-wedge"): ScannerAdapter {
  const factory = scannerAdapterFactories[id] ?? scannerAdapterFactories["keyboard-wedge"]!;
  return factory();
}

/** Short audible feedback. Silent if the browser has not allowed audio yet. */
export function playBeep(kind: "ok" | "error") {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = kind === "ok" ? 1400 : 280;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (kind === "ok" ? 0.07 : 0.28));
    osc.onended = () => void ctx.close();
  } catch {
    /* audio is a nicety, never an error */
  }
}
