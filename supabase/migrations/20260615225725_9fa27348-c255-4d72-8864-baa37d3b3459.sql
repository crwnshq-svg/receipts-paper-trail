
-- 1) Restrict partner_listings read access to authenticated users only
DROP POLICY IF EXISTS "Anyone can read active partners" ON public.partner_listings;
REVOKE SELECT ON public.partner_listings FROM anon;

CREATE POLICY "Authenticated users can read active partners"
ON public.partner_listings
FOR SELECT
TO authenticated
USING (true);

-- 2) Lock down Realtime channel subscriptions to the user's own topic
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can subscribe to their own channel" ON realtime.messages;
CREATE POLICY "Users can subscribe to their own channel"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (realtime.topic() = ('user:' || auth.uid()::text))
);

DROP POLICY IF EXISTS "Users can broadcast to their own channel" ON realtime.messages;
CREATE POLICY "Users can broadcast to their own channel"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  (realtime.topic() = ('user:' || auth.uid()::text))
);
