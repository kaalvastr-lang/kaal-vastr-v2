import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  LogOut,
  Package,
  Receipt,
  ScrollText,
  Search,
  ShoppingBag,
} from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { usePos } from "@/lib/pos/pos-context";
import { useBusinessSettings } from "@/hooks/use-pos-data";

const NAV = [
  { to: "/employee", label: "Home", icon: LayoutDashboard },
  { to: "/employee/new-sale", label: "New Sale", icon: Receipt },
  { to: "/employee/bills", label: "Bills", icon: ScrollText },
  { to: "/employee/search", label: "Products", icon: Search },
  { to: "/employee/inventory", label: "Inventory", icon: Package },
] as const;

export function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string | undefined;
  children: ReactNode;
}) {
  const { employee, signOut } = useAuth();
  const { cart } = usePos();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const cartCount = cart.reduce((n, i) => n + i.quantity, 0);

  return (
    <div className="min-h-screen pb-28 lg:pb-10 lg:pl-64">
      <aside className="no-print glass-panel fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-2 rounded-none border-y-0 border-l-0 p-5 lg:flex">
        <Brand />
        <nav className="mt-6 flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "gold-surface"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{label}</span>
                {to === "/employee/new-sale" && cartCount > 0 && !active ? (
                  <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                    {cartCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-3">
          <div className="rounded-xl border border-border bg-secondary/50 p-3">
            <p className="truncate text-sm font-semibold">{employee?.name}</p>
            <p className="truncate text-xs text-muted-foreground">{employee?.email}</p>
          </div>
          <button
            onClick={() => {
              signOut();
              router.navigate({ to: "/auth", replace: true });
            }}
            className="flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-foreground"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      <header className="no-print sticky top-0 z-20 mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border bg-background/70 px-4 py-4 backdrop-blur-xl sm:flex sm:justify-between md:px-8">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold sm:text-2xl">{title}</h1>
          {subtitle ? (
            <p className="truncate text-xs text-muted-foreground sm:text-sm">{subtitle}</p>
          ) : null}
        </div>
        <span className="shrink-0 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Employee POS
        </span>
      </header>

      <main className="px-4 md:px-8">{children}</main>

      <nav className="no-print glass-panel fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 rounded-none border-x-0 border-b-0 lg:hidden">
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function Brand() {
  const { data: business } = useBusinessSettings();
  const name = business?.business_name ?? "Kaal Vastr";
  return (
    <div className="flex items-center gap-3">
      <div className="gold-surface grid h-10 w-10 shrink-0 place-items-center rounded-xl">
        <ShoppingBag className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="gold-text truncate font-display text-lg font-bold">{name}</p>
        <p className="truncate text-[11px] tracking-widest text-muted-foreground uppercase">
          Timeless Apparel
        </p>
      </div>
    </div>
  );
}
