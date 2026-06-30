
-- Roles enum
CREATE TYPE public.app_role AS ENUM ('coordinator', 'attendee');

-- updated_at trigger helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- program_items
CREATE TABLE public.program_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id TEXT NOT NULL DEFAULT 'default',
  title TEXT NOT NULL,
  duration INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','live','completed')),
  item_type TEXT NOT NULL DEFAULT 'announcement' CHECK (item_type IN ('announcement','speaker','song')),
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  order_index INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.program_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_items TO authenticated;
GRANT ALL ON public.program_items TO service_role;

ALTER TABLE public.program_items ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER program_items_set_updated_at
BEFORE UPDATE ON public.program_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX program_items_program_order_idx
  ON public.program_items (program_id, order_index);

-- user_roles
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

-- has_role helper (security definer; bypasses RLS to avoid recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO anon, authenticated;

-- claim coordinator if none exists
CREATE OR REPLACE FUNCTION public.claim_coordinator_if_first()
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  existing_count INT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT count(*) INTO existing_count FROM public.user_roles WHERE role = 'coordinator';
  IF existing_count > 0 THEN
    RETURN FALSE;
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (uid, 'coordinator')
    ON CONFLICT DO NOTHING;
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_coordinator_if_first() TO authenticated;

-- Policies: program_items
CREATE POLICY "program_items public read"
  ON public.program_items FOR SELECT
  USING (true);

CREATE POLICY "program_items coordinator insert"
  ON public.program_items FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'coordinator'));

CREATE POLICY "program_items coordinator update"
  ON public.program_items FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'coordinator'))
  WITH CHECK (public.has_role(auth.uid(), 'coordinator'));

CREATE POLICY "program_items coordinator delete"
  ON public.program_items FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'coordinator'));

-- Policies: user_roles
CREATE POLICY "user_roles own read"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Realtime
ALTER TABLE public.program_items REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.program_items;
