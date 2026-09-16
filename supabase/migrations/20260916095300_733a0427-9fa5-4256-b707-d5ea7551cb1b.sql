CREATE TYPE public.app_role AS ENUM ('admin', 'voter');
CREATE TYPE public.election_status AS ENUM ('draft', 'open', 'closed');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  voter_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE TABLE public.candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL CHECK (length(btrim(full_name)) > 1),
  position TEXT NOT NULL CHECK (length(btrim(position)) > 1),
  manifesto TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX candidates_position_idx ON public.candidates (position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidates TO authenticated;
GRANT ALL ON public.candidates TO service_role;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.elections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (length(btrim(title)) > 1),
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status public.election_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT elections_time_order CHECK (end_time > start_time)
);
CREATE INDEX elections_status_idx ON public.elections (status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.elections TO authenticated;
GRANT ALL ON public.elections TO service_role;
ALTER TABLE public.elections ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id UUID NOT NULL REFERENCES public.elections(id) ON DELETE CASCADE,
  voter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT votes_one_per_election UNIQUE (election_id, voter_id)
);
CREATE INDEX votes_election_idx ON public.votes (election_id);
CREATE INDEX votes_candidate_idx ON public.votes (candidate_id);
GRANT SELECT, INSERT ON public.votes TO authenticated;
GRANT ALL ON public.votes TO service_role;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_at_idx ON public.audit_logs (created_at DESC);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete profiles" ON public.profiles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated read candidates" ON public.candidates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage candidates" ON public.candidates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated read elections" ON public.elections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage elections" ON public.elections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Voters read own vote" ON public.votes FOR SELECT TO authenticated
  USING (auth.uid() = voter_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Voters cast one vote in open election" ON public.votes FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = voter_id
    AND public.has_role(auth.uid(), 'voter')
    AND EXISTS (
      SELECT 1 FROM public.elections e
      WHERE e.id = election_id
        AND e.status = 'open'
        AND now() >= e.start_time
        AND now() <= e.end_time
    )
  );

CREATE POLICY "Users insert own audit log" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins read audit logs" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.enforce_vote_rules()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.elections;
BEGIN
  SELECT * INTO e FROM public.elections WHERE id = NEW.election_id;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Election not found'; END IF;
  IF e.status <> 'open' OR now() < e.start_time OR now() > e.end_time THEN
    RAISE EXCEPTION 'Election is not open for voting';
  END IF;
  IF EXISTS (SELECT 1 FROM public.votes v WHERE v.election_id = NEW.election_id AND v.voter_id = NEW.voter_id) THEN
    RAISE EXCEPTION 'You have already voted in this election';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER votes_enforce_rules BEFORE INSERT ON public.votes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_vote_rules();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, voter_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'voter_id', ''), 'VID-' || upper(substr(replace(NEW.id::text,'-',''), 1, 8)))
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'voter')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.audit_logs (user_id, action) VALUES (NEW.id, 'REGISTRATION');
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "Signed in users read candidate photos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'candidate-photos');
CREATE POLICY "Admins upload candidate photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'candidate-photos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update candidate photos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'candidate-photos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete candidate photos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'candidate-photos' AND public.has_role(auth.uid(), 'admin'));