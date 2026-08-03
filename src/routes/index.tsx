import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { fetchUserRole, homePathForRole } from "@/lib/roles";

export const Route = createFileRoute("/")({
  component: Index,
});

/** Entry point: sends the visitor to their role's home, or to the login page. */
function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    let mounted = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!data.session) {
        navigate({ to: "/auth", replace: true });
        return;
      }
      const role = await fetchUserRole(data.session.user.id);
      if (!mounted) return;
      navigate({ to: homePathForRole(role), replace: true });
    })();
    return () => {
      mounted = false;
    };
  }, [navigate]);
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="gold-text text-4xl tracking-[0.4em]">KV</div>
    </div>
  );
}
