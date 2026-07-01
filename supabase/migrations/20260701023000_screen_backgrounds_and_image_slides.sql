ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS audience_background_color text NOT NULL DEFAULT '#05070b',
  ADD COLUMN IF NOT EXISTS stage_background_color text NOT NULL DEFAULT '#09090b';

UPDATE public.programs
SET
  audience_background_color = COALESCE(NULLIF(audience_background_color, ''), '#05070b'),
  stage_background_color = COALESCE(NULLIF(stage_background_color, ''), '#09090b');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'program_items_item_type_check'
      AND conrelid = 'public.program_items'::regclass
  ) THEN
    ALTER TABLE public.program_items DROP CONSTRAINT program_items_item_type_check;
  END IF;

  ALTER TABLE public.program_items
    ADD CONSTRAINT program_items_item_type_check
    CHECK (item_type IN ('announcement','speaker','song','image'));
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'programs_audience_background_color_chk'
      AND conrelid = 'public.programs'::regclass
  ) THEN
    ALTER TABLE public.programs
      ADD CONSTRAINT programs_audience_background_color_chk
      CHECK (audience_background_color ~ '^#[0-9A-Fa-f]{6}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'programs_stage_background_color_chk'
      AND conrelid = 'public.programs'::regclass
  ) THEN
    ALTER TABLE public.programs
      ADD CONSTRAINT programs_stage_background_color_chk
      CHECK (stage_background_color ~ '^#[0-9A-Fa-f]{6}$');
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'program-images',
  'program-images',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'program_images public read'
  ) THEN
    CREATE POLICY "program_images public read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'program-images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'program_images coordinator insert'
  ) THEN
    CREATE POLICY "program_images coordinator insert"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'program-images'
        AND public.has_role(auth.uid(), 'coordinator')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'program_images coordinator update'
  ) THEN
    CREATE POLICY "program_images coordinator update"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'program-images'
        AND public.has_role(auth.uid(), 'coordinator')
      )
      WITH CHECK (
        bucket_id = 'program-images'
        AND public.has_role(auth.uid(), 'coordinator')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'program_images coordinator delete'
  ) THEN
    CREATE POLICY "program_images coordinator delete"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'program-images'
        AND public.has_role(auth.uid(), 'coordinator')
      );
  END IF;
END $$;
