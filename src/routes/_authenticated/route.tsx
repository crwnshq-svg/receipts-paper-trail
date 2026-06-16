import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { EmailVerificationGate } from "@/components/email-verification-gate";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  // Google / Apple users come with email_confirmed_at already set on first sign-in.
  // Email/password signups have it null until they click the link.
  if (!user.email_confirmed_at) {
    return <EmailVerificationGate email={user.email ?? ""} />;
  }
  return <Outlet />;
}
