import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Flat enterprise card. Name preserved for backwards compat with existing JSX;
 * visual = matte charcoal, subtle border, no glass/glow.
 */
export function GlassCard({
  children,
  className,
  delay: _delay,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  void _delay;
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}