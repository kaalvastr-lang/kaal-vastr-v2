import { supabase } from "@/integrations/supabase/client";
import type { BusinessSettings } from "@/lib/pos/types";

/** Branding fallback used only until `business_settings` is read. */
export const DEFAULT_BUSINESS = {
  business_name: "Kaal Vastr",
  address: null,
  gst_number: null,
  invoice_footer: null,
  default_country_code: "91",
  whatsapp_number: null,
  business_mobile: null,
  upi_id: null,
  business_logo_url: null,
} as Pick<
  BusinessSettings,
  | "business_name"
  | "address"
  | "gst_number"
  | "invoice_footer"
  | "default_country_code"
  | "whatsapp_number"
  | "business_mobile"
  | "upi_id"
  | "business_logo_url"
>;

export type Business = typeof DEFAULT_BUSINESS;

export async function fetchBusinessSettings(): Promise<Business> {
  const { data, error } = await supabase
    .from("business_settings")
    .select("*")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? ({ ...DEFAULT_BUSINESS, ...data } as Business) : DEFAULT_BUSINESS;
}
