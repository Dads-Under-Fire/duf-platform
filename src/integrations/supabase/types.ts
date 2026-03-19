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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      ai_system_prompts: {
        Row: {
          created_at: string
          feature_key: string
          id: string
          is_active: boolean
          mode: string
          notes: string | null
          prompt_text: string
          updated_at: string
          version_label: string
        }
        Insert: {
          created_at?: string
          feature_key: string
          id?: string
          is_active?: boolean
          mode: string
          notes?: string | null
          prompt_text: string
          updated_at?: string
          version_label?: string
        }
        Update: {
          created_at?: string
          feature_key?: string
          id?: string
          is_active?: boolean
          mode?: string
          notes?: string | null
          prompt_text?: string
          updated_at?: string
          version_label?: string
        }
        Relationships: []
      }
      communication_shield_history: {
        Row: {
          actionability_score: number | null
          admission_risk_score: number | null
          court_safe_phrasing_score: number | null
          created_at: string
          escalation_safety_score: number | null
          firmer_version: string | null
          focus_discipline_score: number | null
          id: string
          mode: string
          original_message: string
          original_score: number | null
          original_score_notes: Json | null
          primary_response: string | null
          primary_rewrite: string | null
          quality_score_notes: Json | null
          quality_score_status: string | null
          quality_score_total: number | null
          recommendation_type: string | null
          rewrite_quality_notes: Json | null
          rewrite_quality_score: number | null
          risk_flags: Json | null
          shorter_version: string | null
          tone_assessment: string | null
          user_id: string
          why_this_is_safer: string | null
        }
        Insert: {
          actionability_score?: number | null
          admission_risk_score?: number | null
          court_safe_phrasing_score?: number | null
          created_at?: string
          escalation_safety_score?: number | null
          firmer_version?: string | null
          focus_discipline_score?: number | null
          id?: string
          mode?: string
          original_message: string
          original_score?: number | null
          original_score_notes?: Json | null
          primary_response?: string | null
          primary_rewrite?: string | null
          quality_score_notes?: Json | null
          quality_score_status?: string | null
          quality_score_total?: number | null
          recommendation_type?: string | null
          rewrite_quality_notes?: Json | null
          rewrite_quality_score?: number | null
          risk_flags?: Json | null
          shorter_version?: string | null
          tone_assessment?: string | null
          user_id: string
          why_this_is_safer?: string | null
        }
        Update: {
          actionability_score?: number | null
          admission_risk_score?: number | null
          court_safe_phrasing_score?: number | null
          created_at?: string
          escalation_safety_score?: number | null
          firmer_version?: string | null
          focus_discipline_score?: number | null
          id?: string
          mode?: string
          original_message?: string
          original_score?: number | null
          original_score_notes?: Json | null
          primary_response?: string | null
          primary_rewrite?: string | null
          quality_score_notes?: Json | null
          quality_score_status?: string | null
          quality_score_total?: number | null
          recommendation_type?: string | null
          rewrite_quality_notes?: Json | null
          rewrite_quality_score?: number | null
          risk_flags?: Json | null
          shorter_version?: string | null
          tone_assessment?: string | null
          user_id?: string
          why_this_is_safer?: string | null
        }
        Relationships: []
      }
      evidence_analyses: {
        Row: {
          analysis_result: string
          analysis_type: string
          created_at: string
          id: string
          original_content: string
          user_id: string
        }
        Insert: {
          analysis_result: string
          analysis_type?: string
          created_at?: string
          id?: string
          original_content: string
          user_id: string
        }
        Update: {
          analysis_result?: string
          analysis_type?: string
          created_at?: string
          id?: string
          original_content?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          intended_plan: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          intended_plan?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          intended_plan?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          billing_period_end: string
          billing_period_start: string
          created_at: string
          id: string
          plan: Database["public"]["Enums"]["plan_type"]
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_period_end?: string
          billing_period_start?: string
          created_at?: string
          id?: string
          plan?: Database["public"]["Enums"]["plan_type"]
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_period_end?: string
          billing_period_start?: string
          created_at?: string
          id?: string
          plan?: Database["public"]["Enums"]["plan_type"]
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      usage_counters: {
        Row: {
          created_at: string
          evidence_analyses_used: number
          evidence_words_used: number
          id: string
          message_rewrites_used: number
          period_end: string
          period_start: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          evidence_analyses_used?: number
          evidence_words_used?: number
          id?: string
          message_rewrites_used?: number
          period_end?: string
          period_start?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          evidence_analyses_used?: number
          evidence_words_used?: number
          id?: string
          message_rewrites_used?: number
          period_end?: string
          period_start?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_evidence_analysis_quota: {
        Args: { p_user_id: string; p_word_count?: number }
        Returns: {
          allowed: boolean
          limit: number
          unit: string
          used: number
        }[]
      }
      check_message_rewrite_quota: {
        Args: { p_user_id: string }
        Returns: {
          allowed: boolean
          limit: number
          used: number
        }[]
      }
      get_plan_limits: {
        Args: { p_plan: Database["public"]["Enums"]["plan_type"] }
        Returns: {
          evidence_analyses_limit: number
          evidence_words_limit: number
          message_rewrites_limit: number
        }[]
      }
      increment_evidence_analyses: {
        Args: { p_user_id: string; p_word_count?: number }
        Returns: undefined
      }
      increment_message_rewrites: {
        Args: { p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      plan_type: "free" | "core" | "pro" | "case_builder"
      subscription_status:
        | "active"
        | "inactive"
        | "trialing"
        | "canceled"
        | "past_due"
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
      plan_type: ["free", "core", "pro", "case_builder"],
      subscription_status: [
        "active",
        "inactive",
        "trialing",
        "canceled",
        "past_due",
      ],
    },
  },
} as const
