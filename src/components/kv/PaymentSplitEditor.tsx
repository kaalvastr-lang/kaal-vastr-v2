import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PaymentSplitState } from "@/hooks/use-payment-split";
import { PAY_METHODS, type PayMethod } from "@/lib/kv/payments";

const rupee = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);

function MethodSelect({
  value,
  onChange,
  label,
}: {
  value: PayMethod;
  onChange: (m: PayMethod) => void;
  label: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as PayMethod)}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PAY_METHODS.map((m) => (
          <SelectItem key={m} value={m}>
            {m}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** One payment method, or a split between two (e.g. Cash + UPI). Used by both billing screens. */
export function PaymentSplitEditor({
  pay,
  total,
  idPrefix = "pay",
}: {
  pay: PaymentSplitState;
  total: number;
  idPrefix?: string;
}) {
  return (
    <div className="space-y-2.5">
      {!pay.split ? (
        <MethodSelect value={pay.method} onChange={pay.setMethod} label="Payment method" />
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_1fr] gap-2">
            <MethodSelect value={pay.first} onChange={pay.setFirst} label="First payment method" />
            <Input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={pay.firstAmount}
              onChange={(e) => pay.setFirstAmount(e.target.value)}
              placeholder="Amount"
              aria-label="First payment amount"
            />
          </div>
          <div className="grid grid-cols-[1fr_1fr] gap-2">
            <MethodSelect
              value={pay.second}
              onChange={pay.setSecond}
              label="Second payment method"
            />
            <div
              className="flex h-9 items-center rounded-md border border-border bg-secondary/30 px-3 text-sm tabular-nums"
              aria-label="Second payment amount (the rest)"
            >
              {pay.rest > 0 ? rupee(pay.rest) : "—"}
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>The second method pays the rest of {rupee(total)}.</span>
            <button
              type="button"
              className="underline hover:text-foreground"
              onClick={pay.halfAndHalf}
            >
              Half &amp; half
            </button>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Switch id={`${idPrefix}-split`} checked={pay.split} onCheckedChange={pay.setSplit} />
        <Label htmlFor={`${idPrefix}-split`} className="text-sm font-normal">
          Split payment (two methods)
        </Label>
      </div>
      {pay.error && (
        <p className="text-xs text-red-400" role="alert">
          {pay.error}
        </p>
      )}
    </div>
  );
}
