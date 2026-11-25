import { code128BBars, code128BWidthModules, isCode128B } from "./code128";
import type { LabelSettings } from "./settings";

/**
 * Label model shared by every output path (ZPL for the Zebra, SVG preview, browser-print
 * fallback), so what you preview is what prints. All positions are in printer dots.
 *
 * Label contents (never prices or any business-sensitive data):
 *   KAAL VASTR
 *   Product name
 *   Size: M | Colour: Black
 *   [Code 128 barcode]
 *   KV000001
 */

export interface LabelItem {
  barcode: string;
  productName: string;
  size: string;
  colour: string;
}

export interface LabelTextEl {
  type: "text";
  x: number;
  y: number;
  /** Width of the box the text is centred in. */
  w: number;
  fontHeight: number;
  text: string;
  bold?: boolean;
}
export interface LabelBarcodeEl {
  type: "barcode";
  x: number;
  y: number;
  height: number;
  moduleWidth: number;
  data: string;
}
export type LabelEl = LabelTextEl | LabelBarcodeEl;

export interface LabelModel {
  widthDots: number;
  heightDots: number;
  elements: LabelEl[];
  warnings: string[];
}

export const mmToDots = (mm: number, dpi: number) => Math.round((mm / 25.4) * dpi);

/** Rough proportional-font width factor (ZPL font 0 / Helvetica-like). */
const CHAR_W = 0.56;

export function fitText(text: string, fontHeight: number, maxWidthDots: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const maxChars = Math.max(1, Math.floor(maxWidthDots / (fontHeight * CHAR_W)));
  if (clean.length <= maxChars) return clean;
  return clean.slice(0, Math.max(1, maxChars - 1)).trimEnd() + ".";
}

export function attributeLine(item: Pick<LabelItem, "size" | "colour">): string {
  const parts = [`Size: ${item.size}`];
  if (item.colour.trim()) parts.push(`Colour: ${item.colour.trim()}`);
  return parts.join(" | ");
}

export function buildLabelModel(item: LabelItem, s: LabelSettings): LabelModel {
  const widthDots = mmToDots(s.widthMm, s.dpi);
  const heightDots = mmToDots(s.heightMm, s.dpi);
  const inner = Math.max(40, widthDots - s.marginX * 2);
  const warnings: string[] = [];
  const elements: LabelEl[] = [];

  if (!isCode128B(item.barcode)) {
    throw new Error(`Barcode "${item.barcode}" cannot be encoded as Code 128.`);
  }

  if (s.showBrand) {
    elements.push({
      type: "text",
      x: s.marginX,
      y: s.brandY,
      w: inner,
      fontHeight: s.brandFont,
      text: "KAAL VASTR",
      bold: true,
    });
  }
  elements.push({
    type: "text",
    x: s.marginX,
    y: s.nameY,
    w: inner,
    fontHeight: s.nameFont,
    text: fitText(item.productName, s.nameFont, inner),
  });
  elements.push({
    type: "text",
    x: s.marginX,
    y: s.attrY,
    w: inner,
    fontHeight: s.attrFont,
    text: fitText(attributeLine(item), s.attrFont, inner),
  });

  const barcodeWidth = code128BWidthModules(item.barcode) * s.moduleWidth;
  if (barcodeWidth > widthDots - s.marginX * 2) {
    warnings.push(
      `Barcode is ${barcodeWidth} dots wide but only ${widthDots - s.marginX * 2} fit between the margins. ` +
        "Lower the bar width or shorten the barcode.",
    );
  }
  // Centre the symbol; never start left of the margin.
  const barcodeX = Math.max(s.marginX, Math.round((widthDots - barcodeWidth) / 2));
  elements.push({
    type: "barcode",
    x: barcodeX,
    y: s.barcodeY,
    height: s.barcodeHeight,
    moduleWidth: s.moduleWidth,
    data: item.barcode,
  });
  elements.push({
    type: "text",
    x: s.marginX,
    y: s.codeTextY,
    w: inner,
    fontHeight: s.codeFont,
    text: item.barcode,
  });

  const bottom = Math.max(s.codeTextY + s.codeFont, s.barcodeY + s.barcodeHeight);
  if (bottom > heightDots) {
    warnings.push(`Content reaches ${bottom} dots but the label is only ${heightDots} dots tall.`);
  }
  return { widthDots, heightDots, elements, warnings };
}

/** Escape ZPL field data. We turn on ^FH with `_` as the hex indicator. */
export function zplEscape(text: string): string {
  return text.replace(
    /[_^~\\]/g,
    (c) => "_" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"),
  );
}

/** ZPL II for ONE label design printed `copies` times (^PQ). */
export function buildZpl(item: LabelItem, s: LabelSettings, copies = 1): string {
  const model = buildLabelModel(item, s);
  const qty = Math.max(1, Math.min(9999, Math.floor(copies)));
  const lines: string[] = [
    "^XA",
    "^CI28", // UTF-8
    `^PW${model.widthDots}`,
    `^LL${model.heightDots}`,
    "^LH0,0",
    "^LT0",
    "^PON",
  ];
  for (const el of model.elements) {
    if (el.type === "text") {
      lines.push(
        `^FO${el.x},${el.y}`,
        `^FB${el.w},1,0,C,0`,
        `^A0N,${el.fontHeight},${el.fontHeight}`,
        `^FH_^FD${zplEscape(el.text)}^FS`,
      );
    } else {
      lines.push(
        `^BY${el.moduleWidth},3,${el.height}`,
        `^FO${el.x},${el.y}`,
        // Code 128, no human-readable line (we print our own centred), subset B (matches the preview).
        `^BCN,${el.height},N,N,N,N`,
        `^FH_^FD${zplEscape(el.data)}^FS`,
      );
    }
  }
  lines.push(`^PQ${qty},0,1,N`, "^XZ");
  return lines.join("\n");
}

/** Convenience: several different labels as one raw payload. */
export function buildZplBatch(
  jobs: { item: LabelItem; copies: number }[],
  s: LabelSettings,
): string {
  return jobs.map((j) => buildZpl(j.item, s, j.copies)).join("\n");
}

export const TEST_LABEL_ITEM: LabelItem = {
  barcode: "KV-TEST-0001",
  productName: "Test Print - Oversized T-Shirt",
  size: "M",
  colour: "Black",
};

/** Standalone SVG of one label (preview and browser-print fallback). Size is in dots. */
export function labelToSvg(
  item: LabelItem,
  s: LabelSettings,
  opts?: { border?: boolean; mmSized?: boolean },
): string {
  const m = buildLabelModel(item, s);
  const esc = (t: string) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const parts: string[] = [];
  for (const el of m.elements) {
    if (el.type === "text") {
      parts.push(
        `<text x="${el.x + el.w / 2}" y="${el.y + el.fontHeight * 0.82}" font-size="${el.fontHeight}" ` +
          `text-anchor="middle" font-family="Helvetica, Arial, sans-serif" ` +
          `${el.bold ? 'font-weight="700"' : ""} fill="#000">${esc(el.text)}</text>`,
      );
    } else {
      for (const bar of code128BBars(el.data)) {
        parts.push(
          `<rect x="${el.x + bar.x * el.moduleWidth}" y="${el.y}" width="${bar.w * el.moduleWidth}" height="${el.height}" fill="#000"/>`,
        );
      }
    }
  }
  const size = opts?.mmSized ? ` width="${s.widthMm}mm" height="${s.heightMm}mm"` : "";
  const border = opts?.border
    ? `<rect x="0.5" y="0.5" width="${m.widthDots - 1}" height="${m.heightDots - 1}" fill="none" stroke="#999" stroke-dasharray="4 3"/>`
    : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.widthDots} ${m.heightDots}"${size}>` +
    `<rect width="${m.widthDots}" height="${m.heightDots}" fill="#fff"/>${border}${parts.join("")}</svg>`
  );
}
