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
          active: boolean
          category: string
          created_at: string
          expected_detected_intent: string | null
          expected_needs_goal_selection: boolean
          expected_no_message_recommended: boolean
          expected_output_path: string | null
          expected_risk_flags: Json | null
          expected_sendability_status: string | null
          feature_key: string
          id: string
          input_message: string
          mode: string
          name: string
          notes: string | null
          selected_goal_for_test: string | null
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          expected_detected_intent?: string | null
          expected_needs_goal_selection?: boolean
          expected_no_message_recommended?: boolean
          expected_output_path?: string | null
          expected_risk_flags?: Json | null
          expected_sendability_status?: string | null
          feature_key: string
          id?: string
          input_message: string
          mode: string
          name: string
          notes?: string | null
          selected_goal_for_test?: string | null
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          expected_detected_intent?: string | null
          expected_needs_goal_selection?: boolean
          expected_no_message_recommended?: boolean
          expected_output_path?: string | null
          expected_risk_flags?: Json | null
          expected_sendability_status?: string | null
          feature_key?: string
          id?: string
          input_message?: string
          mode?: string
          name?: string
          notes?: string | null
          selected_goal_for_test?: string | null
        }
        Relationships: []
      }
      ai_gold_suite_results: {
        Row: {
          actionability_score: number | null
          actual_detected_intent: string | null
          actual_needs_goal_selection: boolean | null
          actual_no_message_recommended: boolean | null
          actual_output_path: string | null
          actual_primary_output: string | null
          actual_redirect_message: string | null
          actual_risk_flags: Json | null
          actual_selected_goal: string | null
          actual_sendability_status: string | null
          category: string
          court_safe_phrasing_score: number | null
          created_at: string
          escalation_safety_score: number | null
          focus_discipline_score: number | null
          goal_alignment_score: number | null
          id: string
          no_message_quality_score: number | null
          original_message: string
          prompt_source: string | null
          prompt_version: string | null
          redirect_quality_score: number | null
          routing_accuracy_score: number | null
          run_id: string
          test_id: string
          triage_accuracy_score: number | null
          validator_notes: Json | null
          validator_pass: boolean | null
          validator_status: string | null
        }
        Insert: {
          actionability_score?: number | null
          actual_detected_intent?: string | null
          actual_needs_goal_selection?: boolean | null
          actual_no_message_recommended?: boolean | null
          actual_output_path?: string | null
          actual_primary_output?: string | null
          actual_redirect_message?: string | null
          actual_risk_flags?: Json | null
          actual_selected_goal?: string | null
          actual_sendability_status?: string | null
          category: string
          court_safe_phrasing_score?: number | null
          created_at?: string
          escalation_safety_score?: number | null
          focus_discipline_score?: number | null
          goal_alignment_score?: number | null
          id?: string
          no_message_quality_score?: number | null
          original_message: string
          prompt_source?: string | null
          prompt_version?: string | null
          redirect_quality_score?: number | null
          routing_accuracy_score?: number | null
          run_id: string
          test_id: string
          triage_accuracy_score?: number | null
          validator_notes?: Json | null
          validator_pass?: boolean | null
          validator_status?: string | null
        }
        Update: {
          actionability_score?: number | null
          actual_detected_intent?: string | null
          actual_needs_goal_selection?: boolean | null
          actual_no_message_recommended?: boolean | null
          actual_output_path?: string | null
          actual_primary_output?: string | null
          actual_redirect_message?: string | null
          actual_risk_flags?: Json | null
          actual_selected_goal?: string | null
          actual_sendability_status?: string | null
          category?: string
          court_safe_phrasing_score?: number | null
          created_at?: string
          escalation_safety_score?: number | null
          focus_discipline_score?: number | null
          goal_alignment_score?: number | null
          id?: string
          no_message_quality_score?: number | null
          original_message?: string
          prompt_source?: string | null
          prompt_version?: string | null
          redirect_quality_score?: number | null
          routing_accuracy_score?: number | null
          run_id?: string
          test_id?: string
          triage_accuracy_score?: number | null
          validator_notes?: Json | null
          validator_pass?: boolean | null
          validator_status?: string | null
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
          workflow_version: string | null
        }
        Insert: {
          created_at?: string
          feature_key: string
          id?: string
          mode: string
          prompt_source?: string | null
          prompt_version?: string | null
          run_label?: string | null
          workflow_version?: string | null
        }
        Update: {
          created_at?: string
          feature_key?: string
          id?: string
          mode?: string
          prompt_source?: string | null
          prompt_version?: string | null
          run_label?: string | null
          workflow_version?: string | null
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
      case_intelligence_analyses: {
        Row: {
          case_id: string
          created_at: string
          entries_snapshot_max_updated_at: string | null
          id: string
          status: string
          summary: Json | null
          user_id: string
        }
        Insert: {
          case_id: string
          created_at?: string
          entries_snapshot_max_updated_at?: string | null
          id?: string
          status?: string
          summary?: Json | null
          user_id: string
        }
        Update: {
          case_id?: string
          created_at?: string
          entries_snapshot_max_updated_at?: string | null
          id?: string
          status?: string
          summary?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      case_intelligence_patterns: {
        Row: {
          analysis_id: string
          case_id: string
          created_at: string
          explanation: string | null
          first_event_date: string | null
          id: string
          last_event_date: string | null
          name: string
          related_entry_ids: string[]
          user_id: string
        }
        Insert: {
          analysis_id: string
          case_id: string
          created_at?: string
          explanation?: string | null
          first_event_date?: string | null
          id?: string
          last_event_date?: string | null
          name: string
          related_entry_ids?: string[]
          user_id: string
        }
        Update: {
          analysis_id?: string
          case_id?: string
          created_at?: string
          explanation?: string | null
          first_event_date?: string | null
          id?: string
          last_event_date?: string | null
          name?: string
          related_entry_ids?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_intelligence_patterns_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "case_intelligence_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      case_log_attachments: {
        Row: {
          case_id: string
          case_log_entry_id: string
          created_at: string
          evidence_note: string | null
          file_name: string
          file_path: string
          file_size_bytes: number
          file_type: string
          id: string
          user_id: string
        }
        Insert: {
          case_id: string
          case_log_entry_id: string
          created_at?: string
          evidence_note?: string | null
          file_name: string
          file_path: string
          file_size_bytes: number
          file_type: string
          id?: string
          user_id: string
        }
        Update: {
          case_id?: string
          case_log_entry_id?: string
          created_at?: string
          evidence_note?: string | null
          file_name?: string
          file_path?: string
          file_size_bytes?: number
          file_type?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_log_attachments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_log_attachments_case_log_entry_id_fkey"
            columns: ["case_log_entry_id"]
            isOneToOne: false
            referencedRelation: "case_log_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      case_log_entries: {
        Row: {
          case_id: string
          child_impact: string | null
          communication_involved: boolean
          context: string
          created_at: string
          entry_type: Database["public"]["Enums"]["case_log_entry_type"]
          event_date: string
          event_time: string
          id: string
          metadata: Json | null
          summary: string
          updated_at: string
          user_id: string
        }
        Insert: {
          case_id: string
          child_impact?: string | null
          communication_involved?: boolean
          context: string
          created_at?: string
          entry_type: Database["public"]["Enums"]["case_log_entry_type"]
          event_date: string
          event_time: string
          id?: string
          metadata?: Json | null
          summary: string
          updated_at?: string
          user_id: string
        }
        Update: {
          case_id?: string
          child_impact?: string | null
          communication_involved?: boolean
          context?: string
          created_at?: string
          entry_type?: Database["public"]["Enums"]["case_log_entry_type"]
          event_date?: string
          event_time?: string
          id?: string
          metadata?: Json | null
          summary?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_log_entries_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          case_name: string
          created_at: string
          id: string
          is_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          case_name: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          case_name?: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id?: string
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
          created_at: string
          firmer_version: string | null
          generation_index: number
          id: string
          is_selected: boolean
          primary_response: string | null
          primary_rewrite: string | null
          result_type: string
          risk_flags: Json | null
          session_id: string
          shorter_version: string | null
          why_this_is_safer: string | null
        }
        Insert: {
          created_at?: string
          firmer_version?: string | null
          generation_index?: number
          id?: string
          is_selected?: boolean
          primary_response?: string | null
          primary_rewrite?: string | null
          result_type?: string
          risk_flags?: Json | null
          session_id: string
          shorter_version?: string | null
          why_this_is_safer?: string | null
        }
        Update: {
          created_at?: string
          firmer_version?: string | null
          generation_index?: number
          id?: string
          is_selected?: boolean
          primary_response?: string | null
          primary_rewrite?: string | null
          result_type?: string
          risk_flags?: Json | null
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
          actionable_logistics_summary: string | null
          created_at: string
          detected_intent: string | null
          detected_tone: string | null
          free_regenerations_used: number
          goal_options: Json | null
          id: string
          mode: string
          original_message: string
          output_path: string | null
          recommendation_type: string | null
          response_intent_options: Json | null
          selected_goal: string | null
          selected_response_intent: string | null
          sendability_reason: string | null
          sendability_status: string | null
          session_status: string
          triage_confidence: number | null
          updated_at: string
          user_id: string
          workflow_version: string | null
        }
        Insert: {
          actionable_logistics_summary?: string | null
          created_at?: string
          detected_intent?: string | null
          detected_tone?: string | null
          free_regenerations_used?: number
          goal_options?: Json | null
          id?: string
          mode?: string
          original_message: string
          output_path?: string | null
          recommendation_type?: string | null
          response_intent_options?: Json | null
          selected_goal?: string | null
          selected_response_intent?: string | null
          sendability_reason?: string | null
          sendability_status?: string | null
          session_status?: string
          triage_confidence?: number | null
          updated_at?: string
          user_id: string
          workflow_version?: string | null
        }
        Update: {
          actionable_logistics_summary?: string | null
          created_at?: string
          detected_intent?: string | null
          detected_tone?: string | null
          free_regenerations_used?: number
          goal_options?: Json | null
          id?: string
          mode?: string
          original_message?: string
          output_path?: string | null
          recommendation_type?: string | null
          response_intent_options?: Json | null
          selected_goal?: string | null
          selected_response_intent?: string | null
          sendability_reason?: string | null
          sendability_status?: string | null
          session_status?: string
          triage_confidence?: number | null
          updated_at?: string
          user_id?: string
          workflow_version?: string | null
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
          case_intelligence_analyses_used: number
          created_at: string
          id: string
          message_rewrites_used: number
          period_end: string
          period_start: string
          updated_at: string
          user_id: string
        }
        Insert: {
          case_intelligence_analyses_used?: number
          created_at?: string
          id?: string
          message_rewrites_used?: number
          period_end?: string
          period_start?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          case_intelligence_analyses_used?: number
          created_at?: string
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
      check_message_rewrite_quota: {
        Args: { p_user_id: string }
        Returns: {
          allowed: boolean
          limit: number
          used: number
        }[]
      }
      consume_case_intelligence_analysis: {
        Args: { p_user_id: string }
        Returns: {
          allowed: boolean
          limit: number
          used: number
        }[]
      }
      get_case_intelligence_limit: {
        Args: { p_plan: Database["public"]["Enums"]["plan_type"] }
        Returns: number
      }
      get_message_rewrites_limit: {
        Args: { p_plan: Database["public"]["Enums"]["plan_type"] }
        Returns: number
      }
      increment_message_rewrites: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      is_admin: { Args: { p_user_id: string }; Returns: boolean }
    }
    Enums: {
      case_log_entry_type:
        | "general_incident"
        | "parenting_time_exchange"
        | "communication"
        | "medical"
        | "school_daycare"
        | "expense"
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
      case_log_entry_type: [
        "general_incident",
        "parenting_time_exchange",
        "communication",
        "medical",
        "school_daycare",
        "expense",
      ],
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
