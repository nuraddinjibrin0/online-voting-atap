CREATE OR REPLACE FUNCTION public.admin_exists()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin')
$$;
REVOKE ALL ON FUNCTION public.admin_exists() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_exists() TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_first_admin()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    RETURN false;
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  INSERT INTO public.audit_logs (user_id, action) VALUES (auth.uid(), 'FIRST_ADMIN_CLAIMED');
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.claim_first_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_first_admin() TO authenticated;