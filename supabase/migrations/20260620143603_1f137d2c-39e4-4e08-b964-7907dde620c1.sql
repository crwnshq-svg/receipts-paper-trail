ALTER TABLE public.generated_documents
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS selected_incident_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS selected_document_ids uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE public.generated_documents
  DROP CONSTRAINT IF EXISTS generated_documents_status_check;

ALTER TABLE public.generated_documents
  ADD CONSTRAINT generated_documents_status_check
  CHECK (status IN ('draft','sent','awaiting_response'));