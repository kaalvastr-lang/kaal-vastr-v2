
CREATE TABLE public.business_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_name text NOT NULL DEFAULT 'My Business',
  business_logo_url text,
  whatsapp_number text,
  business_mobile text,
  gst_number text,
  address text,
  upi_id text,
  invoice_footer text,
  default_country_code text NOT NULL DEFAULT '91',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.business_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_settings TO authenticated;
GRANT ALL ON public.business_settings TO service_role;

ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read business settings"
  ON public.business_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins manage business settings insert"
  ON public.business_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage business settings update"
  ON public.business_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage business settings delete"
  ON public.business_settings FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.set_business_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_business_settings_updated_at
  BEFORE UPDATE ON public.business_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_business_settings_updated_at();

-- Seed a single default row so the app can always load settings.
INSERT INTO public.business_settings (business_name)
SELECT 'My Business'
WHERE NOT EXISTS (SELECT 1 FROM public.business_settings);
