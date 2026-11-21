import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchUserRole } from "@/lib/roles";

/**
 * Confirms the signed-in user is the owner (admin). This is a UI guard only: the route is already
 * owner-gated and every new database function re-checks the role, so it is defence in depth.
 */
export function useIsOwner() {
  const q = useQuery({
    queryKey: ["kv-is-owner"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return false;
      return (await fetchUserRole(data.user.id)) === "admin";
    },
    staleTime: 5 * 60_000,
  });
  return { isOwner: q.data === true, loading: q.isLoading };
}
