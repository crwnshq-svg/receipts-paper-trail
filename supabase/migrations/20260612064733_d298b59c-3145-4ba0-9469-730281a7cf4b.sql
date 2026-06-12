
-- ============ PROFILES ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS ai_questions_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS welcomed_at timestamptz;

-- ============ CASES ============
DO $$ BEGIN
  CREATE TYPE public.case_module AS ENUM ('landlord_tenant','employer_employee','other_general');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Extend case_status enum to include ongoing/escalated
DO $$ BEGIN
  ALTER TYPE public.case_status ADD VALUE IF NOT EXISTS 'ongoing';
EXCEPTION WHEN others THEN null; END $$;
DO $$ BEGIN
  ALTER TYPE public.case_status ADD VALUE IF NOT EXISTS 'escalated';
EXCEPTION WHEN others THEN null; END $$;

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS module public.case_module,
  ADD COLUMN IF NOT EXISTS sub_type text,
  ADD COLUMN IF NOT EXISTS custom_sub_type text,
  ADD COLUMN IF NOT EXISTS case_name text,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS strength_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS foundation_doc_pending boolean NOT NULL DEFAULT false;

-- Backfill module from dispute_type for existing rows
UPDATE public.cases SET module =
  CASE dispute_type::text
    WHEN 'landlord_tenant' THEN 'landlord_tenant'::public.case_module
    WHEN 'employer_employee' THEN 'employer_employee'::public.case_module
    ELSE 'other_general'::public.case_module
  END
WHERE module IS NULL;
UPDATE public.cases SET case_name = COALESCE(case_name, title) WHERE case_name IS NULL;

-- ============ INCIDENTS ============
ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS raw_input text,
  ADD COLUMN IF NOT EXISTS formatted_entry text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS date_of_incident timestamptz,
  ADD COLUMN IF NOT EXISTS passive_ai_flagged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_type text,
  ADD COLUMN IF NOT EXISTS flag_message text;

UPDATE public.incidents SET
  raw_input = COALESCE(raw_input, what_happened),
  formatted_entry = COALESCE(formatted_entry, what_happened),
  date_of_incident = COALESCE(date_of_incident, occurred_at)
WHERE raw_input IS NULL OR formatted_entry IS NULL OR date_of_incident IS NULL;

-- ============ DOCUMENTS ============
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS file_url text,
  ADD COLUMN IF NOT EXISTS file_type text,
  ADD COLUMN IF NOT EXISTS detected_type text,
  ADD COLUMN IF NOT EXISTS extracted_data jsonb,
  ADD COLUMN IF NOT EXISTS user_note text,
  ADD COLUMN IF NOT EXISTS exhibit_label text,
  ADD COLUMN IF NOT EXISTS passive_ai_flagged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_type text,
  ADD COLUMN IF NOT EXISTS flag_message text;

-- ============ GENERATED DOCUMENTS ============
CREATE TABLE IF NOT EXISTS public.generated_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  document_type text NOT NULL,
  recipient_type text,
  content text NOT NULL,
  certified_mail_sent boolean NOT NULL DEFAULT false,
  tracking_number text,
  recipient_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_documents TO authenticated;
GRANT ALL ON public.generated_documents TO service_role;
ALTER TABLE public.generated_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own generated docs" ON public.generated_documents
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_generated_documents_updated_at BEFORE UPDATE ON public.generated_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ CASE PACKAGES ============
CREATE TABLE IF NOT EXISTS public.case_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  sections_included jsonb NOT NULL DEFAULT '{}'::jsonb,
  personal_statement text,
  recipient_type text,
  pdf_url text,
  content text,
  regeneration_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_packages TO authenticated;
GRANT ALL ON public.case_packages TO service_role;
ALTER TABLE public.case_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own case packages" ON public.case_packages
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_case_packages_updated_at BEFORE UPDATE ON public.case_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ AI CONVERSATIONS ============
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  intake_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations TO authenticated;
GRANT ALL ON public.ai_conversations TO service_role;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own ai conversations" ON public.ai_conversations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_ai_conversations_updated_at BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PASSIVE AI FLAGS ============
CREATE TABLE IF NOT EXISTS public.passive_ai_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  flag_type text NOT NULL,
  flag_message text NOT NULL,
  full_explanation text,
  suggested_action text,
  is_dismissed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.passive_ai_flags TO authenticated;
GRANT ALL ON public.passive_ai_flags TO service_role;
ALTER TABLE public.passive_ai_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own passive ai flags" ON public.passive_ai_flags
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ UPDATE handle_new_user to capture first_name ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, first_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    COALESCE(NEW.raw_user_meta_data->>'first_name',
             split_part(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''), ' ', 1))
  );
  RETURN NEW;
END; $$;

-- Ensure auth trigger exists
DO $$ BEGIN
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
EXCEPTION WHEN duplicate_object THEN null; END $$;
