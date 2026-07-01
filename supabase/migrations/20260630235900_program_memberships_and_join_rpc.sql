-- Track attendee memberships per program
CREATE TABLE IF NOT EXISTS public.program_memberships (
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (program_id, user_id)
);

CREATE INDEX IF NOT EXISTS program_memberships_user_id_idx
  ON public.program_memberships (user_id);

GRANT SELECT, INSERT ON public.program_memberships TO authenticated;
GRANT ALL ON public.program_memberships TO service_role;

ALTER TABLE public.program_memberships ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'program_memberships'
      AND policyname = 'program_memberships own read'
  ) THEN
    CREATE POLICY "program_memberships own read"
      ON public.program_memberships FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'program_memberships'
      AND policyname = 'program_memberships own insert'
  ) THEN
    CREATE POLICY "program_memberships own insert"
      ON public.program_memberships FOR INSERT
      TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'programs_join_code_format_chk'
      AND conrelid = 'public.programs'::regclass
  ) THEN
    ALTER TABLE public.programs
      ADD CONSTRAINT programs_join_code_format_chk
      CHECK (join_code ~ '^[A-F0-9]{6}$');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.join_program_by_code(_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_code text;
  v_program_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_code := upper(trim(_code));
  IF v_code = '' THEN
    RAISE EXCEPTION 'Program code is required';
  END IF;

  SELECT id INTO v_program_id
  FROM public.programs
  WHERE join_code = v_code
  LIMIT 1;

  IF v_program_id IS NULL THEN
    RAISE EXCEPTION 'Program code not found';
  END IF;

  INSERT INTO public.program_memberships (program_id, user_id)
  VALUES (v_program_id, v_user_id)
  ON CONFLICT (program_id, user_id) DO NOTHING;

  RETURN v_program_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_program_by_code(text) TO authenticated;
