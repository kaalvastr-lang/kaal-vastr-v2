import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { fetchUserRole } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });

    const role = await fetchUserRole(data.user.id);
    // Owner-only surfaces live outside /employee. Anyone who is not an admin
    // is bounced to the employee panel instead of seeing owner data.
    if (role !== "admin" && !location.pathname.startsWith("/employee")) {
      throw redirect({ to: "/employee" });
    }
    return { user: data.user, role };
  },
  component: () => <Outlet />,
});