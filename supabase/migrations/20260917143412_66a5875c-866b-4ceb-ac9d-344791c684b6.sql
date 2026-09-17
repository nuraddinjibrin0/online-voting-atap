GRANT INSERT, DELETE ON public.user_roles TO authenticated;

CREATE POLICY "Admins grant roles" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins remove roles" ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND NOT (user_id = auth.uid() AND role = 'admin'));