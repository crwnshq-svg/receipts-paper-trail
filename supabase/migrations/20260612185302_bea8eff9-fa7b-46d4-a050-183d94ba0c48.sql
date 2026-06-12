ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_tone text NOT NULL DEFAULT 'straightforward'
    CHECK (ai_tone IN ('straightforward', 'personable'));

CREATE TABLE IF NOT EXISTS public.partner_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  specialty text NOT NULL,
  module_type public.dispute_type NOT NULL,
  state text,
  city text,
  contact_email text,
  contact_phone text,
  contact_url text,
  blurb text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.partner_listings TO authenticated, anon;
GRANT ALL ON public.partner_listings TO service_role;

ALTER TABLE public.partner_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active partners"
  ON public.partner_listings FOR SELECT
  USING (is_active = true);

CREATE TRIGGER update_partner_listings_updated_at
  BEFORE UPDATE ON public.partner_listings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.partner_listings (name, specialty, module_type, contact_email, contact_url, blurb) VALUES
  ('Tenant Rights Legal Aid', 'Landlord/tenant disputes, evictions, habitability', 'landlord_tenant', 'intake@tenantrightslegalaid.org', 'https://tenantrightslegalaid.org', 'Nonprofit legal aid for tenants facing landlord disputes.'),
  ('HomeShield Tenant Attorneys', 'Security deposits, repair lawsuits, retaliation', 'landlord_tenant', NULL, 'https://homeshieldattorneys.example', 'Tenant-side attorneys offering free consultations.'),
  ('Workers First Employment Law', 'Wage theft, wrongful termination, retaliation', 'employer_employee', 'hello@workersfirstlaw.example', 'https://workersfirstlaw.example', 'Employee-side firm handling wage, hour, and discrimination claims.'),
  ('Equal Workplace Advocates', 'Discrimination, harassment, EEOC filings', 'employer_employee', NULL, 'https://equalworkplace.example', 'Civil rights attorneys focused on workplace discrimination.'),
  ('Neighbor Dispute Mediation Center', 'Neighbor disputes, noise, property line, HOA', 'neighbor', 'contact@neighbormediation.example', 'https://neighbormediation.example', 'Mediators and attorneys focused on neighbor and HOA disputes.'),
  ('Consumer Justice Project', 'Consumer disputes, debt, contracts, small claims', 'other', NULL, 'https://consumerjustice.example', 'Nonprofit consumer protection legal clinic.'),
  ('Civil Dispute Counsel', 'General civil disputes, contracts, small claims prep', 'other', 'hello@civildisputecounsel.example', 'https://civildisputecounsel.example', 'Attorneys offering flat-fee civil dispute consultations.');
