import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function GlassCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("glass-panel fade-up rounded-2xl p-5", className)}>{children}</div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: ReactNode;
}) {
  return (
    <GlassCard className="hover-lift">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="min-w-0">
          <p className="text-xs tracking-widest text-muted-foreground uppercase">{label}</p>
          <p className="gold-text mt-2 font-display text-3xl font-bold sm:text-4xl">{value}</p>
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-secondary/60 text-primary">
          {icon}
        </div>
      </div>
    </GlassCard>
  );
}
