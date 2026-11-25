import { useCallback, useMemo, useState } from "react";
import {
  encodePayments,
  PAY_METHODS,
  round2,
  validateSplit,
  type PayMethod,
  type PaymentPart,
} from "@/lib/kv/payments";

const otherThan = (m: PayMethod): PayMethod => PAY_METHODS.find((x) => x !== m) ?? "Cash";

/**
 * State for "pay with one method, or split between two" (e.g. half Cash, half UPI).
 * In split mode the person types the first amount and the second method automatically gets the
 * rest, so the two parts can never drift away from the bill total.
 */
export function usePaymentSplit(total: number) {
  const [split, setSplitState] = useState(false);
  const [method, setMethod] = useState<PayMethod>("Cash");
  const [first, setFirstState] = useState<PayMethod>("Cash");
  const [second, setSecondState] = useState<PayMethod>("UPI");
  const [firstAmount, setFirstAmount] = useState("");

  const t = round2(total);
  const a = round2(Number(firstAmount) || 0);
  const rest = round2(t - a);

  const setSplit = useCallback(
    (on: boolean) => {
      setSplitState(on);
      if (on && !firstAmount && t > 0) setFirstAmount(String(Math.floor(t / 2)));
    },
    [firstAmount, t],
  );
  const setFirst = useCallback(
    (m: PayMethod) => {
      setFirstState(m);
      if (m === second) setSecondState(otherThan(m));
    },
    [second],
  );
  const setSecond = useCallback(
    (m: PayMethod) => {
      setSecondState(m);
      if (m === first) setFirstState(otherThan(m));
    },
    [first],
  );
  const halfAndHalf = useCallback(() => setFirstAmount(String(round2(t / 2))), [t]);

  const parts: PaymentPart[] = useMemo(
    () =>
      split
        ? [
            { method: first, amount: a },
            { method: second, amount: rest },
          ]
        : [{ method, amount: t }],
    [split, first, second, a, rest, method, t],
  );

  const error = useMemo(() => {
    if (!split || t <= 0) return null;
    if (!(a > 0)) return "Enter how much is paid with the first method.";
    if (!(rest > 0)) return "The first amount must be less than the bill total.";
    return validateSplit(parts, t);
  }, [split, t, a, rest, parts]);

  const reset = useCallback(() => {
    setSplitState(false);
    setMethod("Cash");
    setFirstState("Cash");
    setSecondState("UPI");
    setFirstAmount("");
  }, []);

  return {
    split,
    setSplit,
    method,
    setMethod,
    first,
    setFirst,
    second,
    setSecond,
    firstAmount,
    setFirstAmount,
    halfAndHalf,
    rest,
    parts,
    error,
    encoded: encodePayments(parts),
    reset,
  };
}

export type PaymentSplitState = ReturnType<typeof usePaymentSplit>;
