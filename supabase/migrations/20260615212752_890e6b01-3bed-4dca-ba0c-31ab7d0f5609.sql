
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS primary_language text,
  ADD COLUMN IF NOT EXISTS is_renting boolean,
  ADD COLUMN IF NOT EXISTS lease_type text,
  ADD COLUMN IF NOT EXISTS rental_duration text,
  ADD COLUMN IF NOT EXISTS has_landlord_issues boolean,
  ADD COLUMN IF NOT EXISTS is_employed boolean,
  ADD COLUMN IF NOT EXISTS work_type text,
  ADD COLUMN IF NOT EXISTS has_workplace_issues boolean;
-- first_name and state likely already exist on profiles; add defensively
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS state text;
