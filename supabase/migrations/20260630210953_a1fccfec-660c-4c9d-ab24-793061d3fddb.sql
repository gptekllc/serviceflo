
-- 1. programs table
CREATE TABLE public.programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.programs TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.programs TO authenticated;
GRANT ALL ON public.programs TO service_role;

ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "programs public read" ON public.programs FOR SELECT USING (true);
CREATE POLICY "programs coordinator insert" ON public.programs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'coordinator'));
CREATE POLICY "programs coordinator update" ON public.programs FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'coordinator'))
  WITH CHECK (public.has_role(auth.uid(), 'coordinator'));
CREATE POLICY "programs coordinator delete" ON public.programs FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'coordinator'));

CREATE TRIGGER programs_updated_at BEFORE UPDATE ON public.programs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Seed Main Program and backfill
DO $$
DECLARE
  v_main_id uuid;
BEGIN
  INSERT INTO public.programs (name, is_active) VALUES ('Main Program', true)
  RETURNING id INTO v_main_id;

  -- Add new column, backfill, then swap
  ALTER TABLE public.program_items ADD COLUMN program_uuid uuid;
  UPDATE public.program_items SET program_uuid = v_main_id;
  ALTER TABLE public.program_items ALTER COLUMN program_uuid SET NOT NULL;
  ALTER TABLE public.program_items DROP COLUMN program_id;
  ALTER TABLE public.program_items RENAME COLUMN program_uuid TO program_id;
  ALTER TABLE public.program_items
    ADD CONSTRAINT program_items_program_id_fkey
    FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE CASCADE;
END $$;

CREATE INDEX program_items_program_order_idx
  ON public.program_items (program_id, order_index);

-- 3. live_started_at column
ALTER TABLE public.program_items ADD COLUMN live_started_at timestamptz;

-- 4. Realtime for programs
ALTER TABLE public.programs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.programs;

-- 5. Atomic active-program flip
CREATE OR REPLACE FUNCTION public.set_active_program(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'coordinator') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE public.programs SET is_active = false WHERE is_active = true AND id <> _id;
  UPDATE public.programs SET is_active = true WHERE id = _id;
END;
$$;

-- 6. Advance program (next | previous)
CREATE OR REPLACE FUNCTION public.advance_program(_program_id uuid, _direction text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_order int;
  v_next_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'coordinator') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _direction NOT IN ('next','previous') THEN
    RAISE EXCEPTION 'Invalid direction';
  END IF;

  SELECT order_index INTO v_current_order
  FROM public.program_items
  WHERE program_id = _program_id AND status = 'live'
  ORDER BY order_index ASC LIMIT 1;

  IF _direction = 'next' THEN
    IF v_current_order IS NULL THEN
      SELECT id INTO v_next_id FROM public.program_items
      WHERE program_id = _program_id AND status = 'upcoming'
      ORDER BY order_index ASC LIMIT 1;
    ELSE
      SELECT id INTO v_next_id FROM public.program_items
      WHERE program_id = _program_id AND order_index > v_current_order
      ORDER BY order_index ASC LIMIT 1;
    END IF;
  ELSE
    IF v_current_order IS NULL THEN
      RETURN NULL;
    END IF;
    SELECT id INTO v_next_id FROM public.program_items
    WHERE program_id = _program_id AND order_index < v_current_order
    ORDER BY order_index DESC LIMIT 1;
  END IF;

  IF v_next_id IS NULL THEN
    -- nothing to advance to; if going next, just complete current
    IF _direction = 'next' AND v_current_order IS NOT NULL THEN
      UPDATE public.program_items SET status = 'completed', live_started_at = NULL
      WHERE program_id = _program_id AND status = 'live';
    END IF;
    RETURN NULL;
  END IF;

  -- Move current off live
  IF v_current_order IS NOT NULL THEN
    UPDATE public.program_items
    SET status = CASE WHEN _direction = 'next' THEN 'completed' ELSE 'upcoming' END,
        live_started_at = NULL
    WHERE program_id = _program_id AND status = 'live';
  END IF;

  UPDATE public.program_items
  SET status = 'live', live_started_at = now()
  WHERE id = v_next_id;

  RETURN v_next_id;
END;
$$;

-- 7. Clear live (standby)
CREATE OR REPLACE FUNCTION public.clear_live(_program_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'coordinator') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE public.program_items
  SET status = 'upcoming', live_started_at = NULL
  WHERE program_id = _program_id AND status = 'live';
END;
$$;
