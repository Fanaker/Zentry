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
      accounts: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          billing_end_day: number | null
          billing_start_day: number | null
          counts_as_real_money: boolean
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          display_order: number
          hidden_in_accounts: boolean
          id: string
          initial_balance: number
          is_active: boolean
          name: string
          owner_id: string
        }
        Insert: {
          account_type: Database["public"]["Enums"]["account_type"]
          billing_end_day?: number | null
          billing_start_day?: number | null
          counts_as_real_money?: boolean
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          display_order?: number
          hidden_in_accounts?: boolean
          id?: string
          initial_balance?: number
          is_active?: boolean
          name: string
          owner_id?: string
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          billing_end_day?: number | null
          billing_start_day?: number | null
          counts_as_real_money?: boolean
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          display_order?: number
          hidden_in_accounts?: boolean
          id?: string
          initial_balance?: number
          is_active?: boolean
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      allowed_signups: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          id: string
          note: string | null
          used: boolean
          used_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          note?: string | null
          used?: boolean
          used_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          note?: string | null
          used?: boolean
          used_at?: string | null
        }
        Relationships: []
      }
      backup_history: {
        Row: {
          created_at: string
          created_by: string | null
          filename: string
          id: string
          notes: string | null
          owner_id: string
          record_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          filename: string
          id?: string
          notes?: string | null
          owner_id?: string
          record_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          filename?: string
          id?: string
          notes?: string | null
          owner_id?: string
          record_count?: number
        }
        Relationships: []
      }
      budgets: {
        Row: {
          amount_pen: number
          category_id: string
          created_at: string
          id: string
          month: number
          owner_id: string
          year: number
        }
        Insert: {
          amount_pen?: number
          category_id: string
          created_at?: string
          id?: string
          month: number
          owner_id?: string
          year: number
        }
        Update: {
          amount_pen?: number
          category_id?: string
          created_at?: string
          id?: string
          month?: number
          owner_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          owner_id: string
          tx_type: Database["public"]["Enums"]["tx_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          owner_id?: string
          tx_type: Database["public"]["Enums"]["tx_type"]
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          owner_id?: string
          tx_type?: Database["public"]["Enums"]["tx_type"]
        }
        Relationships: []
      }
      monthly_closings: {
        Row: {
          account_id: string
          created_at: string
          id: string
          month: number
          notes: string | null
          owner_id: string
          real_balance_pen: number
          real_balance_usd: number
          year: number
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          month: number
          notes?: string | null
          owner_id?: string
          real_balance_pen?: number
          real_balance_usd?: number
          year: number
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          month?: number
          notes?: string | null
          owner_id?: string
          real_balance_pen?: number
          real_balance_usd?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "monthly_closings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount_pen: number
          amount_usd: number
          category_id: string | null
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          day_order: number | null
          description: string | null
          destination_account_id: string | null
          id: string
          origin_account_id: string | null
          owner_id: string
          payment_account_id: string | null
          person_id: string | null
          tx_date: string
          tx_type: Database["public"]["Enums"]["tx_type"]
          updated_at: string
        }
        Insert: {
          amount_pen?: number
          amount_usd?: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          day_order?: number | null
          description?: string | null
          destination_account_id?: string | null
          id?: string
          origin_account_id?: string | null
          owner_id?: string
          payment_account_id?: string | null
          person_id?: string | null
          tx_date: string
          tx_type: Database["public"]["Enums"]["tx_type"]
          updated_at?: string
        }
        Update: {
          amount_pen?: number
          amount_usd?: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          day_order?: number | null
          description?: string | null
          destination_account_id?: string | null
          id?: string
          origin_account_id?: string | null
          owner_id?: string
          payment_account_id?: string | null
          person_id?: string | null
          tx_date?: string
          tx_type?: Database["public"]["Enums"]["tx_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_destination_account_id_fkey"
            columns: ["destination_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_origin_account_id_fkey"
            columns: ["origin_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_payment_account_id_fkey"
            columns: ["payment_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      admin_delete_user: { Args: { _user_id: string }; Returns: undefined }
      admin_list_users: {
        Args: never
        Returns: {
          created_at: string
          display_name: string
          email: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_email_allowed: { Args: { _email: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      account_type: "debit" | "credit" | "cash" | "dollars" | "other"
      app_role: "admin" | "viewer" | "super_admin"
      currency_code: "PEN" | "USD"
      tx_type: "expense" | "income" | "transfer"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      account_type: ["debit", "credit", "cash", "dollars", "other"],
      app_role: ["admin", "viewer", "super_admin"],
      currency_code: ["PEN", "USD"],
      tx_type: ["expense", "income", "transfer"],
    },
  },
} as const
