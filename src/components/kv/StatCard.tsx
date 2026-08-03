import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  delay: _delay,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  accent?: "gold" | "positive" | "negative" | "neutral";
  delay?: number;
}) {
  void _delay;
  const accentClass =
    accent === "positive"
      ? "text-emerald-400"
      : accent === "negative"
        ? "text-rose-400"
        : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-[#4a4a4a]">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className={cn("mt-2 font-money text-2xl font-semibold tracking-tight", accentClass)}>
            {value}
          </p>
        </div>
        <div className="rounded-md border border-border bg-secondary/40 p-1.5 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
    </div>
  );
}