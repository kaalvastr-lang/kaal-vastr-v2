import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/pos/types";

/**
 * Single source of truth for role → landing page.
 * `admin` is the shop owner, `staff` is a counter employee.
 * Roles live in the shared `public.user_roles` table (never on `profiles`).
 */
export function homePathForRole(role: AppRole | null): "/dashboard" | "/employee" {
  return role === "admin" ? "/dashboard" : "/employee";
}

/** Resolves the highest role granted to a user id. Returns null when none. */
export async function fetchUserRole(userId: string): Promise<AppRole | null> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) return null;
  const roles = (data ?? []).map((r) => r.role as AppRole);
  if (roles.includes("admin")) return "admin";
  if (roles.includes("staff")) return "staff";
  return null;
}