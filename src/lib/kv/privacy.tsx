import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type PrivacyCtx = {
  hidden: boolean;
  toggle: () => void;
  setHidden: (v: boolean) => void;
};

const Ctx = createContext<PrivacyCtx | null>(null);
const KEY = "kv-privacy";

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v === "1") setHidden(true);
    } catch {
      /* ignore */
    }
  }, []);

  const update = (v: boolean) => {
    setHidden(v);
    try {
      localStorage.setItem(KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  return (
    <Ctx.Provider value={{ hidden, toggle: () => update(!hidden), setHidden: update }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePrivacy() {
  const c = useContext(Ctx);
  if (!c) return { hidden: false, toggle: () => {}, setHidden: () => {} };
  return c;
}

const rupee = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

export function Money({
  value,
  className,
  as: As = "span",
  format,
}: {
  value: number;
  className?: string;
  as?: "span" | "p" | "div";
  format?: (n: number) => string;
}) {
  const { hidden } = usePrivacy();
  const fmt = format ?? rupee;
  return (
    <As className={cn("font-money", className)}>
      {hidden ? "•••••••" : fmt(value)}
    </As>
  );
}