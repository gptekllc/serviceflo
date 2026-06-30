
REVOKE EXECUTE ON FUNCTION public.claim_coordinator_if_first() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.claim_coordinator_if_first() TO authenticated;
