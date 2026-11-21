import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { useIsOwner } from "@/hooks/use-owner";
import { GlassCard } from "@/components/kv/GlassCard";

/** Renders children only for the owner (admin). The database enforces the same rule independently. */
export function OwnerOnly({ children }: { children: ReactNode }) {
  const { isOwner, loading } = useIsOwner();
  if (loading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Checking access…</div>;
  }
  if (!isOwner) {
    return (
      <GlassCard className="mx-auto mt-10 max-w-md text-center">
        <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="font-medium">Owner access only</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Stock In and Scan Billing are available to the owner account.
        </p>
      </GlassCard>
    );
  }
  return <>{children}</>;
}
