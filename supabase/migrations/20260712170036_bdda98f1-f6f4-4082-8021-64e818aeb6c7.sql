
-- 1. Profiles INSERT policy (self-only)
CREATE POLICY "Users insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- 2. Lock down SECURITY DEFINER functions
-- Trigger functions: should not be callable by clients
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decrement_stock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_sale_stock() FROM PUBLIC, anon, authenticated;

-- has_role: only used inside RLS policies; restrict client execution
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- get_invoice_by_token: intentional public API for invoice sharing
REVOKE ALL ON FUNCTION public.get_invoice_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invoice_by_token(text) TO anon, authenticated;
