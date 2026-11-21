/**
 * Minimal Code 128 (subset B) encoder.
 *
 * Used for the on-screen label preview and for the browser-print fallback.
 * The Zebra ZPL path lets the printer encode the barcode itself (^BC, subset B),
 * so both paths produce the same symbol for our alphanumeric barcodes.
 */

// Bar/space widths (b s b s b s) for symbol values 0..105, then START A/B/C are 103/104/105, STOP is 106.
const PATTERNS = [
  "212222",
  "222122",
  "222221",
  "121223",
  "121322",
  "131222",
  "122213",
  "122312",
  "132212",
  "221213",
  "221312",
  "231212",
  "112232",
  "122132",
  "122231",
  "113222",
  "123122",
  "123221",
  "223211",
  "221132",
  "221231",
  "213212",
  "223112",
  "312131",
  "311222",
  "321122",
  "321221",
  "312212",
  "322112",
  "322211",
  "212123",
  "212321",
  "232121",
  "111323",
  "131123",
  "131321",
  "112313",
  "132113",
  "132311",
  "211313",
  "231113",
  "231311",
  "112133",
  "112331",
  "132131",
  "113123",
  "113321",
  "133121",
  "313121",
  "211331",
  "231131",
  "213113",
  "213311",
  "213131",
  "311123",
  "311321",
  "331121",
  "312113",
  "312311",
  "332111",
  "314111",
  "221411",
  "431111",
  "111224",
  "111422",
  "121124",
  "121421",
  "141122",
  "141221",
  "112214",
  "112412",
  "122114",
  "122411",
  "142112",
  "142211",
  "241211",
  "221114",
  "413111",
  "241112",
  "134111",
  "111242",
  "121142",
  "121241",
  "114212",
  "124112",
  "124211",
  "411212",
  "421112",
  "421211",
  "212141",
  "214121",
  "412121",
  "111143",
  "111341",
  "131141",
  "114113",
  "114311",
  "411113",
  "411311",
  "113141",
  "114131",
  "311141",
  "411131",
  "211412",
  "211214",
  "211232",
  "2331112",
] as const;

const START_B = 104;
const STOP = 106;

export const CODE128_PATTERNS = PATTERNS;

/** Printable ASCII 32..126 is what subset B can carry. */
export function isCode128B(data: string): boolean {
  if (!data) return false;
  for (let i = 0; i < data.length; i++) {
    const c = data.charCodeAt(i);
    if (c < 32 || c > 126) return false;
  }
  return true;
}

/** Symbol values (start, data…, checksum, stop). */
export function code128BValues(data: string): number[] {
  if (!isCode128B(data)) throw new Error("Barcode contains characters Code 128-B cannot encode.");
  const values: number[] = [START_B];
  let checksum = START_B;
  for (let i = 0; i < data.length; i++) {
    const v = data.charCodeAt(i) - 32;
    values.push(v);
    checksum += v * (i + 1);
  }
  values.push(checksum % 103);
  values.push(STOP);
  return values;
}

/** Module widths alternating bar, space, bar… (starting with a bar). */
export function code128BModules(data: string): number[] {
  const widths: number[] = [];
  for (const v of code128BValues(data)) {
    for (const ch of PATTERNS[v]!) widths.push(Number(ch));
  }
  return widths;
}

/** Total width in modules, including the stop bar (no quiet zone). */
export function code128BWidthModules(data: string): number {
  return code128BModules(data).reduce((a, b) => a + b, 0);
}

/** Bars as {x, w} in modules, ready to draw as rectangles. */
export function code128BBars(data: string): { x: number; w: number }[] {
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  code128BModules(data).forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x, w });
    x += w;
  });
  return bars;
}
