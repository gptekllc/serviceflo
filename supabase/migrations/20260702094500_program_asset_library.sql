CREATE TABLE IF NOT EXISTS public.program_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_type text NOT NULL CHECK (asset_type IN ('image', 'pptx')),
  title text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint,
  storage_path text NOT NULL UNIQUE,
  public_url text NOT NULL,
  fit text NOT NULL DEFAULT 'contain' CHECK (fit IN ('contain', 'cover')),
  alt text NOT NULL DEFAULT '',
  slide_count int,
  source_program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_assets TO authenticated;
GRANT ALL ON public.program_assets TO service_role;

ALTER TABLE public.program_assets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'program_assets_set_updated_at'
  ) THEN
    CREATE TRIGGER program_assets_set_updated_at
    BEFORE UPDATE ON public.program_assets
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS program_assets_type_created_idx
  ON public.program_assets (asset_type, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'program_assets'
      AND policyname = 'program_assets coordinator read'
  ) THEN
    CREATE POLICY "program_assets coordinator read"
      ON public.program_assets FOR SELECT
      TO authenticated
      USING (public.has_role(auth.uid(), 'coordinator'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'program_assets'
      AND policyname = 'program_assets coordinator insert'
  ) THEN
    CREATE POLICY "program_assets coordinator insert"
      ON public.program_assets FOR INSERT
      TO authenticated
      WITH CHECK (public.has_role(auth.uid(), 'coordinator'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'program_assets'
      AND policyname = 'program_assets coordinator update'
  ) THEN
    CREATE POLICY "program_assets coordinator update"
      ON public.program_assets FOR UPDATE
      TO authenticated
      USING (public.has_role(auth.uid(), 'coordinator'))
      WITH CHECK (public.has_role(auth.uid(), 'coordinator'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'program_assets'
      AND policyname = 'program_assets coordinator delete'
  ) THEN
    CREATE POLICY "program_assets coordinator delete"
      ON public.program_assets FOR DELETE
      TO authenticated
      USING (public.has_role(auth.uid(), 'coordinator'));
  END IF;
END $$;

ALTER TABLE public.program_assets REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'program_assets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.program_assets;
  END IF;
END $$;
