import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchUserRole, homePathForRole } from "@/lib/roles";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Kaal Vastr" },
      { name: "description", content: "Secure sign-in for the Kaal Vastr admin console." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Already signed in? Route straight to the correct workspace.
  useEffect(() => {
    let mounted = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted || !data.session) return;
      const role = await fetchUserRole(data.session.user.id);
      if (mounted) navigate({ to: homePathForRole(role), replace: true });
    })();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      if (!data.session) throw new Error("Sign in failed. Please try again.");

      // One login for everyone — the role decides where you land.
      const role = await fetchUserRole(data.session.user.id);
      toast.success(role === "admin" ? "Welcome back, owner" : "Welcome back");
      navigate({ to: homePathForRole(role), replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-10 h-96 w-96 rounded-full bg-[#d4af37]/10 blur-3xl" />
        <div className="absolute -right-32 bottom-10 h-96 w-96 rounded-full bg-[#a37e12]/10 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="glass relative w-full max-w-md rounded-3xl p-10"
      >
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#d4af37]/40">
            <span className="font-display gold-text text-2xl tracking-[0.3em]">KV</span>
          </div>
          <h1 className="mt-6 font-display text-3xl font-medium">Kaal Vastr</h1>
          <p className="mt-1 text-xs uppercase tracking-[0.4em] text-muted-foreground">
            Secure Sign In
          </p>
        </div>

        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Email</Label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@kaalvastr.com"
              className="border-white/10 bg-white/5 h-11"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Password</Label>
            <Input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="border-white/10 bg-white/5 h-11"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="h-11 w-full rounded-xl bg-gradient-to-r from-[#f0d67a] via-[#d4af37] to-[#a37e12] font-semibold text-[#1a1408] hover:opacity-90"
          >
            {loading ? "Signing in…" : "Sign In"}
          </Button>
        </form>

        <p className="mt-6 text-center text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
          Owners and employees use the same sign in
        </p>
      </motion.div>
    </div>
  );
}