import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole, Employee } from "@/lib/pos/types";

interface AuthContextValue {
  employee: Employee | null;
  session: Session | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadEmployee(session: Session): Promise<Employee> {
  const userId = session.user.id;
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("full_name, email").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);
  const roleList = (roles ?? []).map((r) => r.role as AppRole);
  const role: AppRole | null = roleList.includes("admin")
    ? "admin"
    : roleList.includes("staff")
      ? "staff"
      : null;
  const email = profile?.email ?? session.user.email ?? "";
  return {
    id: userId,
    name: profile?.full_name?.trim() || email.split("@")[0] || "Employee",
    email,
    role,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    const hydrate = async (next: Session | null) => {
      if (!active) return;
      setSession(next);
      if (!next) {
        setEmployee(null);
        setReady(true);
        return;
      }
      try {
        const emp = await loadEmployee(next);
        if (active) setEmployee(emp);
      } catch {
        if (active) setEmployee(null);
      } finally {
        if (active) setReady(true);
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "TOKEN_REFRESHED") {
        setSession(next);
        return;
      }
      void hydrate(next);
    });

    void supabase.auth.getSession().then(({ data }) => hydrate(data.session ?? null));

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw new Error(error.message);
    if (!data.session) throw new Error("Sign in failed. Please try again.");
    const emp = await loadEmployee(data.session);
    if (!emp.role) {
      await supabase.auth.signOut();
      throw new Error("This account has no POS access. Ask the owner to grant you staff access.");
    }
    setSession(data.session);
    setEmployee(emp);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setEmployee(null);
  }, []);

  const value = useMemo(
    () => ({ employee, session, ready, signIn, signOut }),
    [employee, session, ready, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
