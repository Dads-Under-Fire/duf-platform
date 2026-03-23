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
      ai_gold_suite_cases: {
        Row: {
          category: string
          created_at: string
          expected_behavior: string | null
          feature_key: string
          id: string
          is_active: boolean
          mode: string
          must_not_do: string | null
          notes: string | null
          original_message: string
          test_id: string
          validator_rules: Json | null
        }
        Insert: {
          category: string
          created_at?: string
          expected_behavior?: string | null
          feature_key: string
          id?: string
          is_active?: boolean
          mode: string
          must_not_do?: string | null
          notes?: string | null
          original_message: string
          test_id: string
          validator_rules?: Json | null
        }
        Update: {
          category?: string
          created_at?: string
          expected_behavior?: string | null
          feature_key?: string
          id?: string
          is_active?: boolean
          mode?: string
          must_not_do?: string | null
          notes?: string | null
          original_message?: string
          test_id?: string
          validator_rules?: Json | null
        }
        Relationships: []
      }
      ai_gold_suite_results: {
        Row: {
          category: string
          created_at: string
          firmer_version: string | null
          id: string
          original_message: string
          original_score: number | null
          original_score_notes: Json | null
          primary_rewrite: string | null
          prompt_source: string | null
          prompt_version: string | null
          rewrite_quality_notes: Json | null
          rewrite_quality_score: number | null
          risk_flags: Json | null
          run_id: string
          shorter_version: string | null
          test_id: string
          tone_assessment: string | null
          validator_notes: Json | null
          validator_pass: boolean | null
          validator_status: string | null
          why_this_is_safer: string | null
        }
        Insert: {
          category: string
          created_at?: string
          firmer_version?: string | null
          id?: string
          original_message: string
          original_score?: number | null
          original_score_notes?: Json | null
          primary_rewrite?: string | null
          prompt_source?: string | null
          prompt_version?: string | null
          rewrite_quality_notes?: Json | null
          rewrite_quality_score?: number | null
          risk_flags?: Json | null
          run_id: string
          shorter_version?: string | null
          test_id: string
          tone_assessment?: string | null
          validator_notes?: Json | null
          validator_pass?: boolean | null
          validator_status?: string | null
          why_this_is_safer?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          firmer_version?: string | null
          id?: string
          original_message?: string
          original_score?: number | null
          original_score_notes?: Json | null
          primary_rewrite?: string | null
          prompt_source?: string | null
          prompt_version?: string | null
          rewrite_quality_notes?: Json | null
          rewrite_quality_score?: number | null
          risk_flags?: Json | null
          run_id?: string
          shorter_version?: string | null
          test_id?: string
          tone_assessment?: string | null
          validator_notes?: Json | null
          validator_pass?: boolean | null
          validator_status?: string | null
          why_this_is_safer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_gold_suite_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_gold_suite_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_gold_suite_runs: {
        Row: {
          created_at: string
          feature_key: string
          id: string
          mode: string
          prompt_source: string | null
          prompt_version: string | null
          run_label: string | null
        }
        Insert: {
          created_at?: string
          feature_key: string
          id?: string
          mode: string
          prompt_source?: string | null
          prompt_version?: string | null
          run_label?: string | null
        }
        Update: {
          created_at?: string
          feature_key?: string
          id?: string
          mode?: string
          prompt_source?: string | null
          prompt_version?: string | null
          run_label?: string | null
        }
        Relationships: []
      }
      ai_system_prompts: {
        Row: {
          created_at: string
          deprecated_at: string | null
          feature_key: string
          id: string
          is_active: boolean
          is_production: boolean
          last_used_at: string | null
          mode: string
          notes: string | null
          output_schema_key: string | null
          prompt_name: string | null
          prompt_purpose: string | null
          prompt_text: string
          stage_key: string
          updated_at: string
          version_label: string
        }
        Insert: {
          created_at?: string
          deprecated_at?: string | null
          feature_key: string
          id?: string
          is_active?: boolean
          is_production?: boolean
          last_used_at?: string | null
          mode: string
          notes?: string | null
          output_schema_key?: string | null
          prompt_name?: string | null
          prompt_purpose?: string | null
          prompt_text: string
          stage_key?: string
          updated_at?: string
          version_label?: string
        }
        Update: {
          created_at?: string
          deprecated_at?: string | null
          feature_key?: string
          id?: string
          is_active?: boolean
          is_production?: boolean
          last_used_at?: string | null
          mode?: string
          notes?: string | null
          output_schema_key?: string | null
          prompt_name?: string | null
          prompt_purpose?: string | null
          prompt_text?: string
          stage_key?: string
          updated_at?: string
          version_label?: string
        }
        Relationships: []
      }
      communication_shield_history_legacy: {
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
      communication_shield_results: {
        Row: {
          alternative_1: string | null
          alternative_2: string | null
          alternative_3: string | null
          created_at: string
          firmer_version: string | null
          generation_index: number
          id: string
          is_selected: boolean
          primary_response: string | null
          primary_rewrite: string | null
          redirect_message: string | null
          result_type: string
          risk_flags: Json | null
          safe_alternative: string | null
          session_id: string
          shorter_version: string | null
          why_this_is_safer: string | null
        }
        Insert: {
          alternative_1?: string | null
          alternative_2?: string | null
          alternative_3?: string | null
          created_at?: string
          firmer_version?: string | null
          generation_index?: number
          id?: string
          is_selected?: boolean
          primary_response?: string | null
          primary_rewrite?: string | null
          redirect_message?: string | null
          result_type?: string
          risk_flags?: Json | null
          safe_alternative?: string | null
          session_id: string
          shorter_version?: string | null
          why_this_is_safer?: string | null
        }
        Update: {
          alternative_1?: string | null
          alternative_2?: string | null
          alternative_3?: string | null
          created_at?: string
          firmer_version?: string | null
          generation_index?: number
          id?: string
          is_selected?: boolean
          primary_response?: string | null
          primary_rewrite?: string | null
          redirect_message?: string | null
          result_type?: string
          risk_flags?: Json | null
          safe_alternative?: string | null
          session_id?: string
          shorter_version?: string | null
          why_this_is_safer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_shield_results_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "communication_shield_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_shield_sessions: {
        Row: {
          actionability_score: number | null
          admission_risk_score: number | null
          court_safe_phrasing_score: number | null
          created_at: string
          detected_intent: string | null
          detected_tone: string | null
          escalation_safety_score: number | null
          focus_discipline_score: number | null
          goal_options: Json | null
          goal_selection_source: string | null
          id: string
          migrated_from_history_id: string | null
          mode: string
          original_message: string
          original_score: number | null
          original_score_notes: Json | null
          output_path: string | null
          quality_score_notes: Json | null
          quality_score_status: string | null
          quality_score_total: number | null
          recommendation_type: string | null
          rewrite_prompt_version: string | null
          rewrite_quality_notes: Json | null
          rewrite_quality_score: number | null
          scoring_version: string | null
          selected_goal: string | null
          sendability_reason: string | null
          sendability_status: string | null
          tone_assessment: string | null
          triage_confidence: number | null
          triage_prompt_version: string | null
          updated_at: string
          user_id: string
          workflow_version: string | null
        }
        Insert: {
          actionability_score?: number | null
          admission_risk_score?: number | null
          court_safe_phrasing_score?: number | null
          created_at?: string
          detected_intent?: string | null
          detected_tone?: string | null
          escalation_safety_score?: number | null
          focus_discipline_score?: number | null
          goal_options?: Json | null
          goal_selection_source?: string | null
          id?: string
          migrated_from_history_id?: string | null
          mode?: string
          original_message: string
          original_score?: number | null
          original_score_notes?: Json | null
          output_path?: string | null
          quality_score_notes?: Json | null
          quality_score_status?: string | null
          quality_score_total?: number | null
          recommendation_type?: string | null
          rewrite_prompt_version?: string | null
          rewrite_quality_notes?: Json | null
          rewrite_quality_score?: number | null
          scoring_version?: string | null
          selected_goal?: string | null
          sendability_reason?: string | null
          sendability_status?: string | null
          tone_assessment?: string | null
          triage_confidence?: number | null
          triage_prompt_version?: string | null
          updated_at?: string
          user_id: string
          workflow_version?: string | null
        }
        Update: {
          actionability_score?: number | null
          admission_risk_score?: number | null
          court_safe_phrasing_score?: number | null
          created_at?: string
          detected_intent?: string | null
          detected_tone?: string | null
          escalation_safety_score?: number | null
          focus_discipline_score?: number | null
          goal_options?: Json | null
          goal_selection_source?: string | null
          id?: string
          migrated_from_history_id?: string | null
          mode?: string
          original_message?: string
          original_score?: number | null
          original_score_notes?: Json | null
          output_path?: string | null
          quality_score_notes?: Json | null
          quality_score_status?: string | null
          quality_score_total?: number | null
          recommendation_type?: string | null
          rewrite_prompt_version?: string | null
          rewrite_quality_notes?: Json | null
          rewrite_quality_score?: number | null
          scoring_version?: string | null
          selected_goal?: string | null
          sendability_reason?: string | null
          sendability_status?: string | null
          tone_assessment?: string | null
          triage_confidence?: number | null
          triage_prompt_version?: string | null
          updated_at?: string
          user_id?: string
          workflow_version?: string | null
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
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          intended_plan?: string | null
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          intended_plan?: string | null
          role?: string
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
      is_admin: { Args: { p_user_id: string }; Returns: boolean }
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
