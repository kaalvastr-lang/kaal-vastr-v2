import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { stockForSize } from "@/services/products";
import type { CartItem, Product } from "./types";

/**
 * Cart state only — a bill in progress on this device.
 * Products, sales and stock all live in Supabase (see `src/services`).
 */
interface CartContextValue {
  cart: CartItem[];
  addToCart: (product: Product, size: string) => void;
  setQuantity: (key: string, quantity: number) => void;
  removeFromCart: (key: string) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export const cartKey = (productId: string, size: string) => `${productId}::${size}`;

export function PosProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);

  const addToCart = useCallback((product: Product, size: string) => {
    const key = cartKey(product.id, size);
    const max = stockForSize(product, size);
    if (max <= 0) return;
    setCart((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) {
        return prev.map((i) =>
          i.key === key ? { ...i, quantity: Math.min(max, i.quantity + 1), product } : i,
        );
      }
      return [
        ...prev,
        { key, product, size, quantity: 1, unitPrice: Number(product.selling_price) },
      ];
    });
  }, []);

  const setQuantity = useCallback((key: string, quantity: number) => {
    setCart((prev) =>
      prev
        .map((i) =>
          i.key === key
            ? { ...i, quantity: Math.max(0, Math.min(stockForSize(i.product, i.size), quantity)) }
            : i,
        )
        .filter((i) => i.quantity > 0),
    );
  }, []);

  const removeFromCart = useCallback((key: string) => {
    setCart((prev) => prev.filter((i) => i.key !== key));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const value = useMemo(
    () => ({ cart, addToCart, setQuantity, removeFromCart, clearCart }),
    [cart, addToCart, setQuantity, removeFromCart, clearCart],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function usePos() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("usePos must be used within PosProvider");
  return ctx;
}
