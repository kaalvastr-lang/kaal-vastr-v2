import type { Tables } from "@/integrations/supabase/types";

/** Live product row from the shared `products` table (Owner Dashboard schema). */
export type Product = Tables<"products"> & {
  stock_by_size: Record<string, number> | null;
};

export type SaleRow = Tables<"sales">;
export type BusinessSettings = Tables<"business_settings">;

export type PaymentMode = "Cash" | "UPI" | "Card";

export interface CartItem {
  /** `${productId}::${size}` */
  key: string;
  product: Product;
  size: string;
  quantity: number;
  unitPrice: number;
}

export interface InvoiceLine {
  productId: string | null;
  name: string;
  size: string;
  color?: string | null;
  category?: string | null;
  quantity: number;
  price: number;
  discount: number;
  lineTotal: number;
}

export interface Invoice {
  invoiceNo: string;
  publicToken: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  items: InvoiceLine[];
  subtotal: number;
  discountAmount: number;
  gstAmount: number;
  total: number;
  paymentMode: string;
}

export type AppRole = "admin" | "staff";

export interface Employee {
  id: string;
  name: string;
  email: string;
  role: AppRole | null;
}
