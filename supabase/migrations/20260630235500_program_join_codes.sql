CREATE OR REPLACE FUNCTION public.generate_join_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  LOOP
    v_code := upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.programs WHERE join_code = v_code
    );
  END LOOP;
  RETURN v_code;
END;
$$;

ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS join_code text;

UPDATE public.programs
SET join_code = public.generate_join_code()
WHERE join_code IS NULL;

ALTER TABLE public.programs
  ALTER COLUMN join_code SET NOT NULL,
  ALTER COLUMN join_code SET DEFAULT public.generate_join_code();

CREATE UNIQUE INDEX IF NOT EXISTS programs_join_code_key
  ON public.programs (join_code);
