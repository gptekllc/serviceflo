
REVOKE EXECUTE ON FUNCTION public.set_active_program(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.advance_program(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.clear_live(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_active_program(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_program(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_live(uuid) TO authenticated;
