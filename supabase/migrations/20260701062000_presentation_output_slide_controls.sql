ALTER TABLE public.presentation_outputs
  ADD COLUMN IF NOT EXISTS slide_index integer NOT NULL DEFAULT 0;

UPDATE public.presentation_outputs
SET slide_index = 0
WHERE slide_index IS NULL;

ALTER TABLE public.presentation_outputs
  ADD CONSTRAINT presentation_outputs_slide_index_chk
  CHECK (slide_index >= 0);

CREATE OR REPLACE FUNCTION public.set_presentation_item(
  _program_id uuid,
  _target text,
  _item_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_program_id uuid;
  v_current_audience uuid;
  v_target_is_live boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'coordinator') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF _target NOT IN ('audience', 'stage', 'both') THEN
    RAISE EXCEPTION 'Invalid target';
  END IF;

  SELECT program_id INTO v_item_program_id
  FROM public.program_items
  WHERE id = _item_id;

  IF v_item_program_id IS NULL OR v_item_program_id <> _program_id THEN
    RAISE EXCEPTION 'Item does not belong to program';
  END IF;

  IF _target IN ('audience', 'both') THEN
    SELECT item_id INTO v_current_audience
    FROM public.presentation_outputs
    WHERE program_id = _program_id AND target = 'audience';

    SELECT EXISTS (
      SELECT 1
      FROM public.program_items
      WHERE id = _item_id AND status = 'live'
    ) INTO v_target_is_live;

    IF v_current_audience IS DISTINCT FROM _item_id OR NOT v_target_is_live THEN
      UPDATE public.program_items
      SET status = 'completed',
          live_started_at = null
      WHERE program_id = _program_id
        AND status = 'live'
        AND id <> _item_id;

      UPDATE public.program_items
      SET status = 'live',
          live_started_at = CASE
            WHEN status = 'live' AND live_started_at IS NOT NULL THEN live_started_at
            ELSE now()
          END
      WHERE id = _item_id;
    END IF;

    INSERT INTO public.presentation_outputs (program_id, target, item_id, slide_index)
    VALUES (_program_id, 'audience', _item_id, 0)
    ON CONFLICT (program_id, target)
    DO UPDATE SET item_id = EXCLUDED.item_id, slide_index = 0, updated_at = now();
  END IF;

  IF _target IN ('stage', 'both') THEN
    INSERT INTO public.presentation_outputs (program_id, target, item_id, slide_index)
    VALUES (_program_id, 'stage', _item_id, 0)
    ON CONFLICT (program_id, target)
    DO UPDATE SET item_id = EXCLUDED.item_id, slide_index = 0, updated_at = now();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_presentation_target(
  _program_id uuid,
  _target text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'coordinator') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF _target NOT IN ('audience', 'stage', 'both') THEN
    RAISE EXCEPTION 'Invalid target';
  END IF;

  IF _target IN ('audience', 'both') THEN
    UPDATE public.program_items
    SET status = 'upcoming',
        live_started_at = null
    WHERE program_id = _program_id AND status = 'live';

    INSERT INTO public.presentation_outputs (program_id, target, item_id, slide_index)
    VALUES (_program_id, 'audience', null, 0)
    ON CONFLICT (program_id, target)
    DO UPDATE SET item_id = null, slide_index = 0, updated_at = now();
  END IF;

  IF _target IN ('stage', 'both') THEN
    INSERT INTO public.presentation_outputs (program_id, target, item_id, slide_index)
    VALUES (_program_id, 'stage', null, 0)
    ON CONFLICT (program_id, target)
    DO UPDATE SET item_id = null, slide_index = 0, updated_at = now();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_presentation(
  _program_id uuid,
  _target text,
  _direction text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_id uuid;
  v_current_order int;
  v_next_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'coordinator') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF _target NOT IN ('audience', 'stage') THEN
    RAISE EXCEPTION 'Invalid target';
  END IF;

  IF _direction NOT IN ('next', 'previous') THEN
    RAISE EXCEPTION 'Invalid direction';
  END IF;

  SELECT item_id INTO v_current_id
  FROM public.presentation_outputs
  WHERE program_id = _program_id AND target = _target;

  IF _target = 'audience' AND v_current_id IS NULL THEN
    SELECT id INTO v_current_id
    FROM public.program_items
    WHERE program_id = _program_id AND status = 'live'
    ORDER BY order_index ASC
    LIMIT 1;
  END IF;

  IF v_current_id IS NOT NULL THEN
    SELECT order_index INTO v_current_order
    FROM public.program_items
    WHERE id = v_current_id;
  END IF;

  IF _direction = 'next' THEN
    IF v_current_order IS NULL THEN
      IF _target = 'audience' THEN
        SELECT id INTO v_next_id
        FROM public.program_items
        WHERE program_id = _program_id AND status = 'upcoming'
        ORDER BY order_index ASC
        LIMIT 1;
      ELSE
        SELECT id INTO v_next_id
        FROM public.program_items
        WHERE program_id = _program_id
        ORDER BY order_index ASC
        LIMIT 1;
      END IF;
    ELSE
      SELECT id INTO v_next_id
      FROM public.program_items
      WHERE program_id = _program_id AND order_index > v_current_order
      ORDER BY order_index ASC
      LIMIT 1;
    END IF;
  ELSE
    IF v_current_order IS NULL THEN
      RETURN null;
    END IF;

    SELECT id INTO v_next_id
    FROM public.program_items
    WHERE program_id = _program_id AND order_index < v_current_order
    ORDER BY order_index DESC
    LIMIT 1;
  END IF;

  IF _target = 'audience' THEN
    IF v_next_id IS NULL THEN
      IF _direction = 'next' AND v_current_id IS NOT NULL THEN
        UPDATE public.program_items
        SET status = 'completed',
            live_started_at = null
        WHERE program_id = _program_id AND status = 'live';
      END IF;

      INSERT INTO public.presentation_outputs (program_id, target, item_id, slide_index)
      VALUES (_program_id, 'audience', null, 0)
      ON CONFLICT (program_id, target)
      DO UPDATE SET item_id = null, slide_index = 0, updated_at = now();

      RETURN null;
    END IF;

    IF v_current_id IS NOT NULL THEN
      UPDATE public.program_items
      SET status = CASE
        WHEN _direction = 'next' THEN 'completed'
        ELSE 'upcoming'
      END,
          live_started_at = null
      WHERE program_id = _program_id AND status = 'live';
    END IF;

    UPDATE public.program_items
    SET status = 'live',
        live_started_at = CASE
          WHEN id = v_current_id AND status = 'live' AND live_started_at IS NOT NULL THEN live_started_at
          ELSE now()
        END
    WHERE id = v_next_id;

    INSERT INTO public.presentation_outputs (program_id, target, item_id, slide_index)
    VALUES (_program_id, 'audience', v_next_id, 0)
    ON CONFLICT (program_id, target)
    DO UPDATE SET item_id = EXCLUDED.item_id, slide_index = 0, updated_at = now();
  ELSE
    IF v_next_id IS NULL THEN
      RETURN null;
    END IF;

    INSERT INTO public.presentation_outputs (program_id, target, item_id, slide_index)
    VALUES (_program_id, 'stage', v_next_id, 0)
    ON CONFLICT (program_id, target)
    DO UPDATE SET item_id = EXCLUDED.item_id, slide_index = 0, updated_at = now();
  END IF;

  RETURN v_next_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_presentation_slide_index(
  _program_id uuid,
  _target text,
  _slide_index integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'coordinator') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF _target NOT IN ('audience', 'stage', 'both') THEN
    RAISE EXCEPTION 'Invalid target';
  END IF;

  IF _slide_index < 0 THEN
    RAISE EXCEPTION 'Invalid slide index';
  END IF;

  IF _target IN ('audience', 'both') THEN
    UPDATE public.presentation_outputs
    SET slide_index = _slide_index,
        updated_at = now()
    WHERE program_id = _program_id AND target = 'audience';
  END IF;

  IF _target IN ('stage', 'both') THEN
    UPDATE public.presentation_outputs
    SET slide_index = _slide_index,
        updated_at = now()
    WHERE program_id = _program_id AND target = 'stage';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_presentation_slide_index(uuid, text, integer)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_presentation_slide_index(uuid, text, integer)
  TO authenticated;
