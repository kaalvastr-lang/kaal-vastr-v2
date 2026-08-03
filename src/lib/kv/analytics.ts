/**
 * Date-range helpers + metric aggregation for the owner Sales Analytics page.
 * Pure functions only, so they can be unit-tested and reused by any surface.
 */

export type PeriodKey =
  | "today"
  | "yesterday"
  | "week"
  | "month"
  | "lastMonth"
  | "custom"
  | "monthly";

export type DateRange = { from: Date; to: Date };

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "This Week",
  month: "This Month",
  lastMonth: "Last Month",
  custom: "Custom Range",
  monthly: "Monthly View",
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

/** Resolves a picker selection into an inclusive local-time range. */
export function resolveRange(
  period: PeriodKey,
  opts: { customFrom?: string; customTo?: string; month?: string } = {},
): DateRange {
  const now = new Date();
  switch (period) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "week": {
      // Week starts on Monday, matching Indian retail reporting.
      const day = (now.getDay() + 6) % 7;
      const from = new Date(now);
      from.setDate(from.getDate() - day);
      return { from: startOfDay(from), to: endOfDay(now) };
    }
    case "month":
      return {
        from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: endOfDay(now),
      };
    case "lastMonth": {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: startOfDay(from), to: endOfDay(to) };
    }
    case "monthly": {
      const [y, m] = (opts.month || "").split("-").map(Number);
      const year = y || now.getFullYear();
      const monthIdx = (m || now.getMonth() + 1) - 1;
      return {
        from: startOfDay(new Date(year, monthIdx, 1)),
        to: endOfDay(new Date(year, monthIdx + 1, 0)),
      };
    }
    case "custom":
    default: {
      const from = opts.customFrom ? new Date(`${opts.customFrom}T00:00:00`) : startOfDay(now);
      const to = opts.customTo ? new Date(`${opts.customTo}T00:00:00`) : now;
      return { from: startOfDay(from), to: endOfDay(to) };
    }
  }
}

export type SaleRow = {
  invoice_number: string;
  total_amount: number;
  profit: number;
  quantity: number;
  payment_method: string;
  is_returned: boolean;
  created_at: string;
};

export type AnalyticsMetrics = {
  totalSales: number;
  totalProfit: number;
  billsGenerated: number;
  cashSales: number;
  upiSales: number;
  cardSales: number;
  averageBillValue: number;
  totalItemsSold: number;
};

const method = (m: string) => (m || "").trim().toLowerCase();

/** Aggregates sale line rows into the headline metrics. Returns are excluded. */
export function computeMetrics(rows: SaleRow[]): AnalyticsMetrics {
  const live = rows.filter((r) => !r.is_returned);
  const bills = new Set(live.map((r) => r.invoice_number));

  let totalSales = 0;
  let totalProfit = 0;
  let cashSales = 0;
  let upiSales = 0;
  let cardSales = 0;
  let totalItemsSold = 0;

  for (const r of live) {
    const amount = Number(r.total_amount) || 0;
    totalSales += amount;
    totalProfit += Number(r.profit) || 0;
    totalItemsSold += Number(r.quantity) || 0;
    const m = method(r.payment_method);
    if (m === "cash") cashSales += amount;
    else if (m === "upi") upiSales += amount;
    else if (m === "card") cardSales += amount;
  }

  return {
    totalSales,
    totalProfit,
    billsGenerated: bills.size,
    cashSales,
    upiSales,
    cardSales,
    averageBillValue: bills.size ? totalSales / bills.size : 0,
    totalItemsSold,
  };
}

/** Groups revenue by calendar day for the trend chart. */
export function dailySeries(rows: SaleRow[]): Array<{ day: string; sales: number; profit: number }> {
  const map = new Map<string, { sales: number; profit: number }>();
  for (const r of rows) {
    if (r.is_returned) continue;
    const key = r.created_at.slice(0, 10);
    const cur = map.get(key) ?? { sales: 0, profit: 0 };
    cur.sales += Number(r.total_amount) || 0;
    cur.profit += Number(r.profit) || 0;
    map.set(key, cur);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => ({ day, ...v }));
}