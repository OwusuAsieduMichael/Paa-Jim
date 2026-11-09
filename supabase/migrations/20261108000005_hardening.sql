-- =============================================================================
-- Paa Jim — 0005 hardening (from Supabase's security advisor)
--   * log_price_change (0003) was created after 0002 revoked EXECUTE on all
--     functions, so it kept the default PUBLIC grant. It is a trigger function
--     and must never be callable through the API.
--   * touch_updated_at had no fixed search_path.
-- =============================================================================

revoke execute on function public.log_price_change() from public, anon, authenticated;

alter function public.touch_updated_at() set search_path = '';
