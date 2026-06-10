
-- Lock down SECURITY DEFINER helpers
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Storage policies: files live under {user_id}/{case_id}/{filename}
CREATE POLICY "Users read own files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'case-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users upload own files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'case-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'case-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users update own files" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'case-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
