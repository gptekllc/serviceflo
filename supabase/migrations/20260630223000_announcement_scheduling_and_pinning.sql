ALTER TABLE public.program_items
  ADD COLUMN published_at timestamptz,
  ADD COLUMN is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN priority integer NOT NULL DEFAULT 0;

CREATE INDEX program_items_announcements_idx
  ON public.program_items (program_id, item_type, is_pinned DESC, priority DESC, published_at DESC);
