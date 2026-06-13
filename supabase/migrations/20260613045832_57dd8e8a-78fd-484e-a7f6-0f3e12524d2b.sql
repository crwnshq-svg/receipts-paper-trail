
-- 1. status_level on cases
DO $$ BEGIN
  CREATE TYPE public.case_status_level AS ENUM ('record', 'case');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS status_level public.case_status_level NOT NULL DEFAULT 'record';

UPDATE public.cases SET status_level = 'record' WHERE status_level IS NULL;

-- 2. document_ids on incidents
ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS document_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 3. notes table
CREATE TABLE IF NOT EXISTS public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  reminder_at timestamptz,
  reminder_sent boolean NOT NULL DEFAULT false,
  document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notes TO authenticated;
GRANT ALL ON public.notes TO service_role;

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own notes" ON public.notes;
CREATE POLICY "Users manage their own notes" ON public.notes
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_notes_updated_at ON public.notes;
CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS notes_case_id_idx ON public.notes(case_id);
CREATE INDEX IF NOT EXISTS notes_reminder_pending_idx ON public.notes(reminder_at) WHERE reminder_sent = false AND reminder_at IS NOT NULL;
