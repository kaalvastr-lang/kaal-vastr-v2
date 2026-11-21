import { cn } from "@/lib/utils";

export type BillingMode = "new-sale" | "scan-billing";

/** Lets the owner flip between the existing manual billing and Scan Billing. */
export function BillingModeSwitch({
  value,
  onChange,
}: {
  value: BillingMode;
  onChange: (m: BillingMode) => void;
}) {
  const opts: { id: BillingMode; label: string }[] = [
    { id: "new-sale", label: "Normal Billing" },
    { id: "scan-billing", label: "Scan Billing" },
  ];
  return (
    <div
      className="mb-4 inline-flex rounded-lg border border-border bg-card p-1"
      role="tablist"
      aria-label="Billing mode"
    >
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
            value === o.id
              ? "bg-[#d4af37]/15 text-[#f0d67a]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
