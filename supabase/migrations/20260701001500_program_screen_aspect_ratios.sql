ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS audience_aspect_ratio text,
  ADD COLUMN IF NOT EXISTS stage_aspect_ratio text;

UPDATE public.programs
SET
  audience_aspect_ratio = COALESCE(audience_aspect_ratio, '16:9'),
  stage_aspect_ratio = COALESCE(stage_aspect_ratio, '16:9');

ALTER TABLE public.programs
  ALTER COLUMN audience_aspect_ratio SET DEFAULT '16:9',
  ALTER COLUMN stage_aspect_ratio SET DEFAULT '16:9',
  ALTER COLUMN audience_aspect_ratio SET NOT NULL,
  ALTER COLUMN stage_aspect_ratio SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'programs_audience_aspect_ratio_chk'
      AND conrelid = 'public.programs'::regclass
  ) THEN
    ALTER TABLE public.programs
      ADD CONSTRAINT programs_audience_aspect_ratio_chk
      CHECK (audience_aspect_ratio IN ('4:3', '7:5', '1:1', '16:9', '20:9'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'programs_stage_aspect_ratio_chk'
      AND conrelid = 'public.programs'::regclass
  ) THEN
    ALTER TABLE public.programs
      ADD CONSTRAINT programs_stage_aspect_ratio_chk
      CHECK (stage_aspect_ratio IN ('4:3', '7:5', '1:1', '16:9', '20:9'));
  END IF;
END $$;
