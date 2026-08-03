import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BusinessSettings = {
  id: string;
  business_name: string;
  business_logo_url: string | null;
  whatsapp_number: string | null;
  business_mobile: string | null;
  gst_number: string | null;
  address: string | null;
  upi_id: string | null;
  invoice_footer: string | null;
  default_country_code: string;
};

export const DEFAULT_BUSINESS: BusinessSettings = {
  id: "",
  business_name: "My Business",
  business_logo_url: null,
  whatsapp_number: null,
  business_mobile: null,
  gst_number: null,
  address: null,
  upi_id: null,
  invoice_footer: null,
  default_country_code: "91",
};

export const BUSINESS_QUERY_KEY = ["business-settings"] as const;

export async function fetchBusinessSettings(): Promise<BusinessSettings> {
  const { data, error } = await supabase
    .from("business_settings")
    .select(
      "id, business_name, business_logo_url, whatsapp_number, business_mobile, gst_number, address, upi_id, invoice_footer, default_country_code",
    )
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_BUSINESS;
  return { ...DEFAULT_BUSINESS, ...data };
}

export function useBusinessSettings() {
  return useQuery({
    queryKey: BUSINESS_QUERY_KEY,
    queryFn: fetchBusinessSettings,
    staleTime: 60_000,
  });
}