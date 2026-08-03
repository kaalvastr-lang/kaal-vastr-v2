/**
 * WhatsApp service module.
 *
 * This module is intentionally UI-agnostic and free of hard-coded business
 * details or credentials. All sender information (business name, country
 * code, footer) is passed in from the caller (typically loaded from the
 * `business_settings` table). API credentials are read from Vite env vars
 * so that after exporting to VS Code the client only needs to set the
 * appropriate variables — no UI/DB changes required.
 *
 * Environment variables (all optional):
 *   VITE_WHATSAPP_API_URL          Full endpoint of the WhatsApp Business API
 *                                  or a backend proxy that forwards the send.
 *   VITE_WHATSAPP_API_TOKEN        Bearer token / access token.
 *   VITE_WHATSAPP_PHONE_NUMBER_ID  Meta Cloud API phone-number ID (optional).
 *   VITE_WHATSAPP_TEMPLATE_NAME    Optional approved template name.
 *   VITE_WHATSAPP_SENDER_NUMBER    Sender's display number (fallback).
 *
 * When the API env vars are absent, `sendWhatsApp` falls back to opening a
 * `wa.me` deep-link so the shop owner can still deliver invoices manually.
 */

export type WhatsAppRequest = {
  customerName: string;
  customerMobile: string;
  invoiceNumber: string;
  invoiceUrl: string;
  pdfUrl?: string | null;
  businessName: string;
  countryCode?: string; // default "91"
  footer?: string | null;
};

export type WhatsAppApiPayload = {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: string;
};

export type WhatsAppSendResult =
  | { ok: true; via: "api"; status: number }
  | { ok: true; via: "wa.me"; url: string }
  | { ok: false; via: "api" | "wa.me"; error: string };

const DEFAULT_COUNTRY_CODE = "91";

function normalizeMobile(mobile: string, countryCode: string): string {
  const digits = (mobile ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `${countryCode}${digits}`;
  return digits;
}

export function buildMessage(req: WhatsAppRequest): string {
  const lines = [
    `Hello ${req.customerName},`,
    ``,
    `Thank you for shopping at *${req.businessName}*.`,
    ``,
    `Invoice No: *${req.invoiceNumber}*`,
    `Your invoice is ready.`,
    ``,
    req.invoiceUrl ? `View Invoice:\n${req.invoiceUrl}` : "",
    req.pdfUrl ? `Download PDF:\n${req.pdfUrl}` : "",
    ``,
    `You can download or print your invoice anytime using the above link.`,
    ``,
    req.footer?.trim() || `Thank you for choosing ${req.businessName}.`,
  ];
  return lines.filter((l) => l !== null && l !== undefined).join("\n");
}

export function toWaMeUrl(req: WhatsAppRequest): string {
  const cc = req.countryCode || DEFAULT_COUNTRY_CODE;
  const mobile = normalizeMobile(req.customerMobile, cc);
  const message = buildMessage(req);
  return `https://wa.me/${mobile}?text=${encodeURIComponent(message)}`;
}

function readEnv(key: string): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (import.meta as any)?.env ?? {};
  const v = env[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/**
 * Build an HTTP payload for the WhatsApp Business API (or a backend proxy).
 * Returns null when API credentials are not configured — the caller should
 * then fall back to `toWaMeUrl`.
 */
export function buildApiPayload(req: WhatsAppRequest): WhatsAppApiPayload | null {
  const url = readEnv("VITE_WHATSAPP_API_URL");
  const token = readEnv("VITE_WHATSAPP_API_TOKEN");
  if (!url || !token) return null;

  const cc = req.countryCode || DEFAULT_COUNTRY_CODE;
  const to = normalizeMobile(req.customerMobile, cc);
  const templateName = readEnv("VITE_WHATSAPP_TEMPLATE_NAME");
  const message = buildMessage(req);

  const body = templateName
    ? JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: "en" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: req.customerName },
                { type: "text", text: req.invoiceNumber },
                { type: "text", text: req.invoiceUrl },
              ],
            },
          ],
        },
      })
    : JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: message, preview_url: true },
      });

  return {
    url,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body,
  };
}

/**
 * Send an invoice via WhatsApp.
 *
 * When API credentials are configured, POSTs to the configured endpoint
 * (typically a backend proxy to keep tokens off the client). Otherwise
 * opens the wa.me deep-link so the shop owner can send it themselves.
 */
export async function sendWhatsApp(req: WhatsAppRequest): Promise<WhatsAppSendResult> {
  const payload = buildApiPayload(req);
  if (payload) {
    try {
      const res = await fetch(payload.url, {
        method: payload.method,
        headers: payload.headers,
        body: payload.body,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { ok: false, via: "api", error: `HTTP ${res.status}: ${text}` };
      }
      return { ok: true, via: "api", status: res.status };
    } catch (err) {
      return {
        ok: false,
        via: "api",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const url = toWaMeUrl(req);
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener");
  }
  return { ok: true, via: "wa.me", url };
}

export function isWhatsAppApiConfigured(): boolean {
  return Boolean(readEnv("VITE_WHATSAPP_API_URL") && readEnv("VITE_WHATSAPP_API_TOKEN"));
}