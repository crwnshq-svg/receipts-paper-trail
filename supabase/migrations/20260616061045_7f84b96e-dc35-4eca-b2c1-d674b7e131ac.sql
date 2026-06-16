REVOKE UPDATE ON public.profiles FROM authenticated;

GRANT UPDATE (
  full_name,
  first_name,
  email,
  state,
  ai_tone,
  welcomed_at,
  last_active_at,
  onboarding_completed,
  privacy_acknowledged_at,
  city,
  primary_language,
  is_renting,
  lease_type,
  rental_duration,
  has_landlord_issues,
  is_employed,
  work_type,
  has_workplace_issues
) ON public.profiles TO authenticated;

GRANT ALL ON public.profiles TO service_role;