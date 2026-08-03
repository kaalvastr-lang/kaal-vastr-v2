import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchProducts } from "@/services/products";
import { fetchBusinessSettings } from "@/services/business";
import { createSale, fetchTodaySales, type CheckoutInput } from "@/services/sales";

export const productsKey = ["products"] as const;
export const salesKey = ["sales", "today"] as const;
export const businessKey = ["business-settings"] as const;

export function useProducts() {
  return useQuery({
    queryKey: productsKey,
    queryFn: fetchProducts,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useTodaySales() {
  return useQuery({ queryKey: salesKey, queryFn: fetchTodaySales, staleTime: 0 });
}

export function useBusinessSettings() {
  return useQuery({ queryKey: businessKey, queryFn: fetchBusinessSettings, staleTime: 60_000 });
}

export function useCheckout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CheckoutInput) => createSale(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productsKey });
      qc.invalidateQueries({ queryKey: salesKey });
    },
  });
}

/** Realtime sync so stock and takings update without a refresh. */
export function useRealtimeSync() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("pos-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => {
        qc.invalidateQueries({ queryKey: productsKey });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, () => {
        qc.invalidateQueries({ queryKey: salesKey });
        qc.invalidateQueries({ queryKey: productsKey });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);
}
