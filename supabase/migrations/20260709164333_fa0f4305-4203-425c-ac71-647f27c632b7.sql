
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS hsn_code text,
  ADD COLUMN IF NOT EXISTS gst_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS colors text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS min_stock integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.inventory_activity (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  action text NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  note text,
  user_id uuid,
  user_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_activity TO authenticated;
GRANT ALL ON public.inventory_activity TO service_role;

ALTER TABLE public.inventory_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team manages inventory activity"
  ON public.inventory_activity
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'staff'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'staff'::app_role));

CREATE INDEX IF NOT EXISTS inventory_activity_created_at_idx ON public.inventory_activity (created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_activity_product_id_idx ON public.inventory_activity (product_id);
