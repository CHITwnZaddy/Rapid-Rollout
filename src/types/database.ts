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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      bid_sheets: {
        Row: {
          created_at: string | null
          customer_id: string | null
          discount_dollars: number
          discount_percent: number | null
          id: string
          migration_cost: number | null
          notes: string | null
          opt1_cost: number | null
          opt1_hours: number | null
          opt2_cost: number | null
          opt2_hours: number | null
          p1_cost: number | null
          p1_hours: number | null
          p2_cost: number | null
          p2_hours: number | null
          proposal_id: string
          recommended_scenario: string | null
          scoped_services_cost: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id?: string | null
          discount_dollars?: number
          discount_percent?: number | null
          id?: string
          migration_cost?: number | null
          notes?: string | null
          opt1_cost?: number | null
          opt1_hours?: number | null
          opt2_cost?: number | null
          opt2_hours?: number | null
          p1_cost?: number | null
          p1_hours?: number | null
          p2_cost?: number | null
          p2_hours?: number | null
          proposal_id: string
          recommended_scenario?: string | null
          scoped_services_cost?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string | null
          discount_dollars?: number
          discount_percent?: number | null
          id?: string
          migration_cost?: number | null
          notes?: string | null
          opt1_cost?: number | null
          opt1_hours?: number | null
          opt2_cost?: number | null
          opt2_hours?: number | null
          p1_cost?: number | null
          p1_hours?: number | null
          p2_cost?: number | null
          p2_hours?: number | null
          proposal_id?: string
          recommended_scenario?: string | null
          scoped_services_cost?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bid_sheets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_sheets_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: true
            referencedRelation: "proposal_revenue_report_base"
            referencedColumns: ["proposal_id"]
          },
          {
            foreignKeyName: "bid_sheets_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: true
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      change_log: {
        Row: {
          action: string
          changed_by: string | null
          created_at: string | null
          id: string
          new_values: Json | null
          old_values: Json | null
          proposal_id: string | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          changed_by?: string | null
          created_at?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          proposal_id?: string | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          changed_by?: string | null
          created_at?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          proposal_id?: string | null
          record_id?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_log_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposal_revenue_report_base"
            referencedColumns: ["proposal_id"]
          },
          {
            foreignKeyName: "change_log_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          company_name: string
          created_at: string | null
          created_by: string | null
          id: string
          state: string | null
          updated_at: string | null
          zip: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          company_name: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          state?: string | null
          updated_at?: string | null
          zip?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          company_name?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          state?: string | null
          updated_at?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      kpi_user_targets: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          target_amount: number
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          target_amount: number
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          target_amount?: number
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "kpi_user_targets_year_fkey"
            columns: ["year"]
            isOneToOne: false
            referencedRelation: "kpi_year_targets"
            referencedColumns: ["year"]
          },
        ]
      }
      kpi_year_targets: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string
          team_quota: number
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          team_quota: number
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          team_quota?: number
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      migration_config: {
        Row: {
          complexity_factor: number
          computed_total_cost: number | null
          core_final_qa_hrs: number | null
          core_migration_plan_hrs: number | null
          core_pm_oversight_hrs: number | null
          core_requirements_hrs: number | null
          core_validation_hrs: number | null
          created_at: string | null
          doc_avg_mb_per_project: number | null
          doc_mb_per_hour: number | null
          hrs_per_import: number | null
          id: string
          is_effort_included: boolean | null
          is_workshop_included: boolean | null
          lines_per_import_file: number | null
          num_projects: number | null
          pm_trips: number | null
          proposal_id: string
          sr_im_trips: number | null
          updated_at: string | null
        }
        Insert: {
          complexity_factor?: number
          computed_total_cost?: number | null
          core_final_qa_hrs?: number | null
          core_migration_plan_hrs?: number | null
          core_pm_oversight_hrs?: number | null
          core_requirements_hrs?: number | null
          core_validation_hrs?: number | null
          created_at?: string | null
          doc_avg_mb_per_project?: number | null
          doc_mb_per_hour?: number | null
          hrs_per_import?: number | null
          id?: string
          is_effort_included?: boolean | null
          is_workshop_included?: boolean | null
          lines_per_import_file?: number | null
          num_projects?: number | null
          pm_trips?: number | null
          proposal_id: string
          sr_im_trips?: number | null
          updated_at?: string | null
        }
        Update: {
          complexity_factor?: number
          computed_total_cost?: number | null
          core_final_qa_hrs?: number | null
          core_migration_plan_hrs?: number | null
          core_pm_oversight_hrs?: number | null
          core_requirements_hrs?: number | null
          core_validation_hrs?: number | null
          created_at?: string | null
          doc_avg_mb_per_project?: number | null
          doc_mb_per_hour?: number | null
          hrs_per_import?: number | null
          id?: string
          is_effort_included?: boolean | null
          is_workshop_included?: boolean | null
          lines_per_import_file?: number | null
          num_projects?: number | null
          pm_trips?: number | null
          proposal_id?: string
          sr_im_trips?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "migration_config_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: true
            referencedRelation: "proposal_revenue_report_base"
            referencedColumns: ["proposal_id"]
          },
          {
            foreignKeyName: "migration_config_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: true
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      migration_detail_lines: {
        Row: {
          created_at: string | null
          id: string
          items_per_object: number | null
          label: string
          proposal_id: string
          quantity: number | null
          row_order: number | null
          section: string
          total_line_items: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          items_per_object?: number | null
          label: string
          proposal_id: string
          quantity?: number | null
          row_order?: number | null
          section: string
          total_line_items?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          items_per_object?: number | null
          label?: string
          proposal_id?: string
          quantity?: number | null
          row_order?: number | null
          section?: string
          total_line_items?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "migration_detail_lines_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposal_revenue_report_base"
            referencedColumns: ["proposal_id"]
          },
          {
            foreignKeyName: "migration_detail_lines_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          display_name: string
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_name: string
          id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      proposal_stale_thresholds: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          status: string
          threshold_days: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          status: string
          threshold_days: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          status?: string
          threshold_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      proposal_status_history: {
        Row: {
          changed_at: string
          changed_by: string
          id: string
          new_status: string
          old_status: string | null
          proposal_id: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          id?: string
          new_status: string
          old_status?: string | null
          proposal_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          id?: string
          new_status?: string
          old_status?: string | null
          proposal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_status_history_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposal_revenue_report_base"
            referencedColumns: ["proposal_id"]
          },
          {
            foreignKeyName: "proposal_status_history_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_variance_reasons: {
        Row: {
          code: string
          created_at: string
          description: string
          id: string
          is_active: boolean
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description: string
          id?: string
          is_active?: boolean
          label: string
          sort_order: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      proposals: {
        Row: {
          closed_financials_corrected_at: string | null
          closed_financials_corrected_by: string | null
          closed_lost_note: string | null
          closed_lost_reason: string | null
          created_at: string | null
          created_by: string
          customer_id: string | null
          id: string
          loe_signed_date: string | null
          loe_value: number | null
          name: string
          notes: string | null
          scoped_complexity_factor: number
          sold_price: number | null
          status: string
          updated_at: string | null
          variance_note: string | null
          variance_reason_code: string | null
        }
        Insert: {
          closed_financials_corrected_at?: string | null
          closed_financials_corrected_by?: string | null
          closed_lost_note?: string | null
          closed_lost_reason?: string | null
          created_at?: string | null
          created_by: string
          customer_id?: string | null
          id?: string
          loe_signed_date?: string | null
          loe_value?: number | null
          name: string
          notes?: string | null
          scoped_complexity_factor?: number
          sold_price?: number | null
          status?: string
          updated_at?: string | null
          variance_note?: string | null
          variance_reason_code?: string | null
        }
        Update: {
          closed_financials_corrected_at?: string | null
          closed_financials_corrected_by?: string | null
          closed_lost_note?: string | null
          closed_lost_reason?: string | null
          created_at?: string | null
          created_by?: string
          customer_id?: string | null
          id?: string
          loe_signed_date?: string | null
          loe_value?: number | null
          name?: string
          notes?: string | null
          scoped_complexity_factor?: number
          sold_price?: number | null
          status?: string
          updated_at?: string | null
          variance_note?: string | null
          variance_reason_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposals_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_variance_reason_code_fkey"
            columns: ["variance_reason_code"]
            isOneToOne: false
            referencedRelation: "proposal_variance_reasons"
            referencedColumns: ["code"]
          },
        ]
      }
      rate_cards: {
        Row: {
          activity: string
          created_at: string | null
          id: string
          lookup_key: string
          rate: number
          rate_card_name: string
          role_category: string
          status: string
          updated_at: string | null
        }
        Insert: {
          activity: string
          created_at?: string | null
          id?: string
          lookup_key: string
          rate: number
          rate_card_name: string
          role_category: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          activity?: string
          created_at?: string | null
          id?: string
          lookup_key?: string
          rate?: number
          rate_card_name?: string
          role_category?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      scenario_lines: {
        Row: {
          ba_cost: number | null
          ba_hours: number | null
          created_at: string | null
          id: string
          is_locked: boolean | null
          module: string
          pm_cost: number | null
          pm_hours: number | null
          row_order: number
          scenario_id: string
          scope_selection: string | null
          sr_im_cost: number | null
          sr_im_hours: number | null
          total_cost: number | null
          total_hours: number | null
          updated_at: string | null
        }
        Insert: {
          ba_cost?: number | null
          ba_hours?: number | null
          created_at?: string | null
          id?: string
          is_locked?: boolean | null
          module: string
          pm_cost?: number | null
          pm_hours?: number | null
          row_order: number
          scenario_id: string
          scope_selection?: string | null
          sr_im_cost?: number | null
          sr_im_hours?: number | null
          total_cost?: number | null
          total_hours?: number | null
          updated_at?: string | null
        }
        Update: {
          ba_cost?: number | null
          ba_hours?: number | null
          created_at?: string | null
          id?: string
          is_locked?: boolean | null
          module?: string
          pm_cost?: number | null
          pm_hours?: number | null
          row_order?: number
          scenario_id?: string
          scope_selection?: string | null
          sr_im_cost?: number | null
          sr_im_hours?: number | null
          total_cost?: number | null
          total_hours?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scenario_lines_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      scenarios: {
        Row: {
          complexity_factor: number
          created_at: string | null
          id: string
          is_active: boolean | null
          proposal_id: string
          scenario_type: string
          summary_total_cost: number | null
          summary_total_hours: number | null
          updated_at: string | null
        }
        Insert: {
          complexity_factor?: number
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          proposal_id: string
          scenario_type: string
          summary_total_cost?: number | null
          summary_total_hours?: number | null
          updated_at?: string | null
        }
        Update: {
          complexity_factor?: number
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          proposal_id?: string
          scenario_type?: string
          summary_total_cost?: number | null
          summary_total_hours?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scenarios_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposal_revenue_report_base"
            referencedColumns: ["proposal_id"]
          },
          {
            foreignKeyName: "scenarios_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      scoped_services: {
        Row: {
          cost: number | null
          created_at: string | null
          description: string | null
          hours: number
          id: string
          proposal_id: string
          rate_card_lookup_key: string
          row_order: number
          service_type: string
          updated_at: string | null
        }
        Insert: {
          cost?: number | null
          created_at?: string | null
          description?: string | null
          hours?: number
          id?: string
          proposal_id: string
          rate_card_lookup_key: string
          row_order?: number
          service_type: string
          updated_at?: string | null
        }
        Update: {
          cost?: number | null
          created_at?: string | null
          description?: string | null
          hours?: number
          id?: string
          proposal_id?: string
          rate_card_lookup_key?: string
          row_order?: number
          service_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scoped_services_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposal_revenue_report_base"
            referencedColumns: ["proposal_id"]
          },
          {
            foreignKeyName: "scoped_services_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      service_hours: {
        Row: {
          ba_hours: number | null
          created_at: string | null
          id: string
          lookup_key: string
          pm_hours: number | null
          scope_label: string
          scope_value: string
          service_group: string
          service_name: string
          sort_order: number
          sr_im_hours: number | null
          status: string
          updated_at: string | null
        }
        Insert: {
          ba_hours?: number | null
          created_at?: string | null
          id?: string
          lookup_key: string
          pm_hours?: number | null
          scope_label: string
          scope_value: string
          service_group: string
          service_name: string
          sort_order: number
          sr_im_hours?: number | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          ba_hours?: number | null
          created_at?: string | null
          id?: string
          lookup_key?: string
          pm_hours?: number | null
          scope_label?: string
          scope_value?: string
          service_group?: string
          service_name?: string
          sort_order?: number
          sr_im_hours?: number | null
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      proposal_revenue_report_base: {
        Row: {
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          opt1_cost: number | null
          opt2_cost: number | null
          opt3_cost: number | null
          p1_cost: number | null
          p2_cost: number | null
          p3_cost: number | null
          proposal_id: string | null
          proposal_name: string | null
          scenario_total: number | null
          scoped_complexity_factor: number | null
          scoped_total: number | null
          status: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposals_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_proposal_bundle: {
        Args: { p_customer_id?: string; p_name: string }
        Returns: string
      }
      current_app_role: { Args: never; Returns: string }
      display_name_from_email: { Args: { p_email: string }; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      is_manager_or_admin: { Args: never; Returns: boolean }
      save_scenario_grid: {
        Args: {
          p_lines: Json
          p_scenario_id: string
          p_summary_total_cost: number
          p_summary_total_hours: number
        }
        Returns: boolean
      }
      transition_proposal_status: {
        Args: { p_new_status: string; p_proposal_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
