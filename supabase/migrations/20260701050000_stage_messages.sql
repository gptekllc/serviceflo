CREATE TABLE public.stage_messages (
  program_id uuid PRIMARY KEY REFERENCES public.programs(id) ON DELETE CASCADE,
  message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.stage_messages TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.stage_messages TO authenticated;
GRANT ALL ON public.stage_messages TO service_role;

ALTER TABLE public.stage_messages ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER stage_messages_updated_at
BEFORE UPDATE ON public.stage_messages
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "stage_messages public read"
  ON public.stage_messages FOR SELECT
  USING (true);

CREATE POLICY "stage_messages coordinator insert"
  ON public.stage_messages FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'coordinator'));

CREATE POLICY "stage_messages coordinator update"
  ON public.stage_messages FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'coordinator'))
  WITH CHECK (public.has_role(auth.uid(), 'coordinator'));

CREATE POLICY "stage_messages coordinator delete"
  ON public.stage_messages FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'coordinator'));

ALTER TABLE public.stage_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stage_messages;
