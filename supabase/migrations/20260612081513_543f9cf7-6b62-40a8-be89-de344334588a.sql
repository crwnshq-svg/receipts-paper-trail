
-- 1) documents.ai_summary
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS ai_summary TEXT;

-- 2) profiles.last_active_at + location for targeting
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS state TEXT;

-- 3) document_insights
CREATE TABLE IF NOT EXISTS public.document_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL,
  insight_title TEXT NOT NULL,
  brief_description TEXT NOT NULL,
  full_guidance TEXT NOT NULL,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_insights TO authenticated;
GRANT ALL ON public.document_insights TO service_role;
ALTER TABLE public.document_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own insights" ON public.document_insights FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_doc_insights_doc ON public.document_insights(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_insights_user ON public.document_insights(user_id);

-- 4) notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('insight','broadcast')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  related_case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
  related_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifications" ON public.notifications FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read, created_at DESC);

-- 5) admin_notifications (broadcast source)
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  target_module TEXT NOT NULL CHECK (target_module IN ('landlord_tenant','employer_employee','other_general','all')),
  target_state TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_notifications TO authenticated;
GRANT ALL ON public.admin_notifications TO service_role;
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone read broadcasts" ON public.admin_notifications FOR SELECT TO authenticated USING (true);

-- 6) Fan-out trigger
CREATE OR REPLACE FUNCTION public.fanout_admin_notification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.published_at IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.notifications (user_id, type, title, body)
  SELECT DISTINCT p.id, 'broadcast', NEW.title, NEW.body
  FROM public.profiles p
  WHERE (NEW.target_state IS NULL OR p.state = NEW.target_state)
    AND (
      NEW.target_module = 'all'
      OR EXISTS (
        SELECT 1 FROM public.cases c
        WHERE c.user_id = p.id AND c.dispute_type = NEW.target_module
      )
    );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_fanout_admin_notification ON public.admin_notifications;
CREATE TRIGGER trg_fanout_admin_notification
AFTER INSERT OR UPDATE OF published_at ON public.admin_notifications
FOR EACH ROW EXECUTE FUNCTION public.fanout_admin_notification();

-- 7) push_subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own push subs" ON public.push_subscriptions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
