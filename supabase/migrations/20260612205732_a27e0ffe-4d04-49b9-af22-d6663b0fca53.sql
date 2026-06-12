-- Restrict authenticated users from updating billing/quota columns on profiles.
-- Revoke broad UPDATE and re-grant only on user-editable columns.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, first_name, email, state, ai_tone, welcomed_at, last_active_at)
  ON public.profiles TO authenticated;
-- service_role retains full access for server-side billing logic.
GRANT ALL ON public.profiles TO service_role;