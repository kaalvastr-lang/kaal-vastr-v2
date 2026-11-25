export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      barcode_print_jobs: {
        Row: {
          barcode: string
          colour: string | null
          copies: number
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          printer_name: string | null
          product_name: string | null
          size: string | null
          status: string
          variant_id: string | null
        }
        Insert: {
          barcode: string
          colour?: string | null
          copies?: number
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          printer_name?: string | null
          product_name?: string | null
          size?: string | null
          status?: string
          variant_id?: string | null
        }
        Update: {
          barcode?: string
          colour?: string | null
          copies?: number
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          printer_name?: string | null
          product_name?: string | null
          size?: string | null
          status?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "barcode_print_jobs_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      business_settings: {
        Row: {
          address: string | null
          business_logo_url: string | null
          business_mobile: string | null
          business_name: string
          created_at: string
          default_country_code: string
          gst_number: string | null
          id: string
          invoice_footer: string | null
          is_active: boolean
          updated_at: string
          upi_id: string | null
          whatsapp_number: string | null
        }
        Insert: {
          address?: string | null
          business_logo_url?: string | null
          business_mobile?: string | null
          business_name?: string
          created_at?: string
          default_country_code?: string
          gst_number?: string | null
          id?: string
          invoice_footer?: string | null
          is_active?: boolean
          updated_at?: string
          upi_id?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          address?: string | null
          business_logo_url?: string | null
          business_mobile?: string | null
          business_name?: string
          created_at?: string
          default_country_code?: string
          gst_number?: string | null
          id?: string
          invoice_footer?: string | null
          is_active?: boolean
          updated_at?: string
          upi_id?: string | null
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      inventory_activity: {
        Row: {
          action: string
          created_at: string
          id: string
          note: string | null
          product_id: string | null
          product_name: string
          quantity: number
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          note?: string | null
          product_id?: string | null
          product_name: string
          quantity?: number
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          note?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_activity_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand: string | null
          category: string
          colors: string[]
          cost_price: number
          created_at: string
          description: string | null
          gst_pct: number
          hsn_code: string | null
          id: string
          image_url: string | null
          is_archived: boolean
          min_stock: number
          name: string
          selling_price: number
          size_type: string
          sizes: string[]
          sku: string | null
          stock: number
          stock_by_size: Json
          updated_at: string
          variant: string | null
        }
        Insert: {
          brand?: string | null
          category?: string
          colors?: string[]
          cost_price?: number
          created_at?: string
          description?: string | null
          gst_pct?: number
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          is_archived?: boolean
          min_stock?: number
          name: string
          selling_price?: number
          size_type?: string
          sizes?: string[]
          sku?: string | null
          stock?: number
          stock_by_size?: Json
          updated_at?: string
          variant?: string | null
        }
        Update: {
          brand?: string | null
          category?: string
          colors?: string[]
          cost_price?: number
          created_at?: string
          description?: string | null
          gst_pct?: number
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          is_archived?: boolean
          min_stock?: number
          name?: string
          selling_price?: number
          size_type?: string
          sizes?: string[]
          sku?: string | null
          stock?: number
          stock_by_size?: Json
          updated_at?: string
          variant?: string | null
        }
        Relationships: []
      }
      product_variants: {
        Row: {
          barcode: string
          colour: string
          created_at: string
          id: string
          is_active: boolean
          product_id: string
          size: string
          stock: number
          updated_at: string
        }
        Insert: {
          barcode: string
          colour?: string
          created_at?: string
          id?: string
          is_active?: boolean
          product_id: string
          size: string
          stock?: number
          updated_at?: string
        }
        Update: {
          barcode?: string
          colour?: string
          created_at?: string
          id?: string
          is_active?: boolean
          product_id?: string
          size?: string
          stock?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      sales: {
        Row: {
          barcode: string | null
          created_at: string
          created_by: string | null
          customer_mobile: string
          customer_name: string
          discount: number
          id: string
          invoice_number: string
          is_returned: boolean
          payment_method: string
          payment_status: string
          pdf_url: string | null
          product_id: string | null
          product_name: string
          profit: number
          public_token: string
          quantity: number
          size: string
          total_amount: number
          unit_cost: number
          unit_price: number
          variant: string | null
          variant_id: string | null
        }
        Insert: {
          barcode?: string | null
          created_at?: string
          created_by?: string | null
          customer_mobile: string
          customer_name: string
          discount?: number
          id?: string
          invoice_number: string
          is_returned?: boolean
          payment_method?: string
          payment_status?: string
          pdf_url?: string | null
          product_id?: string | null
          product_name: string
          profit?: number
          public_token: string
          quantity: number
          size: string
          total_amount: number
          unit_cost?: number
          unit_price: number
          variant?: string | null
          variant_id?: string | null
        }
        Update: {
          barcode?: string | null
          created_at?: string
          created_by?: string | null
          customer_mobile?: string
          customer_name?: string
          discount?: number
          id?: string
          invoice_number?: string
          is_returned?: boolean
          payment_method?: string
          payment_status?: string
          pdf_url?: string | null
          product_id?: string | null
          product_name?: string
          profit?: number
          public_token?: string
          quantity?: number
          size?: string
          total_amount?: number
          unit_cost?: number
          unit_price?: number
          variant?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_invoice_by_token: {
        Args: { _token: string }
        Returns: {
          created_at: string
          customer_mobile: string
          customer_name: string
          discount: number
          id: string
          invoice_number: string
          payment_method: string
          payment_status: string
          pdf_url: string
          product_name: string
          public_token: string
          quantity: number
          size: string
          total_amount: number
          unit_price: number
          variant: string
        }[]
      }
      kv_complete_sale: {
        Args: {
          p_customer_mobile: string
          p_customer_name: string
          p_discount_type: string
          p_discount_value: number
          p_items: Json
          p_payment_method: string
          p_payments?: Json
          p_request_key: string
        }
        Returns: Json
      }
      kv_stock_in: {
        Args: { p_product: Json; p_request_key: string; p_variants: Json }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "staff"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "staff"],
    },
  },
} as const
