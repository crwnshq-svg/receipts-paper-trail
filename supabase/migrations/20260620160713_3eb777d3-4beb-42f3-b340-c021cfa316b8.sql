
ALTER TABLE public.case_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage settings for their own cases"
ON public.case_settings
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_settings.case_id AND c.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_settings.case_id AND c.user_id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_settings TO authenticated;
GRANT ALL ON public.case_settings TO service_role;
