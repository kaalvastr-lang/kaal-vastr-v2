/**
 * Split payments (e.g. half Cash, half UPI).
 *
 * The method(s) are stored in the existing `sales.payment_method` text column, so invoices, the
 * public invoice page, the PDF and every report keep working without a schema change:
 *
 *   one method   -> "Cash" | "UPI" | "Card"               (exactly as before)
 *   split        -> "Cash 500 + UPI 300"                   (method, space, rupee amount)
 *
 * The Scan Billing database function builds the same string and checks that the parts add up to the
 * bill total it computed itself.
 */

export const PAY_METHODS = ["Cash", "UPI", "Card"] as const;
export type PayMethod = (typeof PAY_METHODS)[number];

export interface PaymentPart {
  method: PayMethod;
  amount: number;
}

export const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

const canonical = (s: string): PayMethod | null => {
  const m = PAY_METHODS.find((x) => x.toLowerCase() === s.trim().toLowerCase());
  return m ?? null;
};

/** "Cash" for one method, "Cash 500 + UPI 300" for a split. */
export function encodePayments(parts: PaymentPart[]): string {
  if (parts.length === 0) return "Cash";
  if (parts.length === 1) return parts[0]!.method;
  return parts.map((p) => `${p.method} ${round2(p.amount)}`).join(" + ");
}

/**
 * Reads a stored payment_method back into parts. A plain method ("Cash") becomes one part that
 * covers `total`. Unknown text (old free-form values) returns [] so callers can ignore it.
 */
export function decodePayments(text: string, total: number): PaymentPart[] {
  const raw = (text ?? "").trim();
  if (!raw) return [];
  const single = canonical(raw);
  if (single) return [{ method: single, amount: total }];

  const parts: PaymentPart[] = [];
  for (const chunk of raw.split("+")) {
    const m = chunk.trim().match(/^([A-Za-z]+)\s+(\d+(?:\.\d+)?)$/);
    if (!m) return [];
    const method = canonical(m[1]!);
    if (!method) return [];
    parts.push({ method, amount: Number(m[2]) });
  }
  return parts;
}

/** Returns an error message, or null when the parts are a valid way to pay `total`. */
export function validateSplit(parts: PaymentPart[], total: number): string | null {
  if (parts.length < 2) return null;
  const methods = new Set(parts.map((p) => p.method));
  if (methods.size !== parts.length) return "Choose two different payment methods.";
  if (parts.some((p) => !(p.amount > 0))) return "Each payment amount must be more than 0.";
  const sum = round2(parts.reduce((a, p) => a + p.amount, 0));
  if (Math.abs(sum - round2(total)) > 0.005) {
    return `Payments (${sum}) must add up to the bill total (${round2(total)}).`;
  }
  return null;
}
