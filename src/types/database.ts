export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      rate_cards: {
        Row: {
          id: string;
          rate_card_name: string;
          activity: string;
          rate: number;
          role_category: string;
          status: string;
          lookup_key: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          rate_card_name: string;
          activity: string;
          rate: number;
          role_category: string;
          status?: string;
          lookup_key: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          rate_card_name?: string;
          activity?: string;
          rate?: number;
          role_category?: string;
          status?: string;
          lookup_key?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      service_hours: {
        Row: {
          id: string;
          service_name: string;
          scope_value: string;
          ba_hours: number;
          pm_hours: number;
          sr_im_hours: number;
          scope_label: string;
          service_group: string;
          status: string;
          lookup_key: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          service_name: string;
          scope_value: string;
          ba_hours?: number;
          pm_hours?: number;
          sr_im_hours?: number;
          scope_label: string;
          service_group: string;
          status?: string;
          lookup_key: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          service_name?: string;
          scope_value?: string;
          ba_hours?: number;
          pm_hours?: number;
          sr_im_hours?: number;
          scope_label?: string;
          service_group?: string;
          status?: string;
          lookup_key?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          company_name: string;
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          state: string | null;
          zip: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_name: string;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state?: string | null;
          zip?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_name?: string;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state?: string | null;
          zip?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      proposals: {
        Row: {
          id: string;
          name: string;
          customer_id: string | null;
          created_by: string;
          status: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          customer_id?: string | null;
          created_by: string;
          status?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          customer_id?: string | null;
          created_by?: string;
          status?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "proposals_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      scenarios: {
        Row: {
          id: string;
          proposal_id: string;
          scenario_type: string;
          is_active: boolean;
          summary_total_hours: number;
          summary_total_cost: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          proposal_id: string;
          scenario_type: string;
          is_active?: boolean;
          summary_total_hours?: number;
          summary_total_cost?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          proposal_id?: string;
          scenario_type?: string;
          is_active?: boolean;
          summary_total_hours?: number;
          summary_total_cost?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scenarios_proposal_id_fkey";
            columns: ["proposal_id"];
            isOneToOne: false;
            referencedRelation: "proposals";
            referencedColumns: ["id"];
          },
        ];
      };
      scenario_lines: {
        Row: {
          id: string;
          scenario_id: string;
          row_order: number;
          module: string;
          scope_selection: string | null;
          sr_im_hours: number;
          sr_im_cost: number;
          pm_hours: number;
          pm_cost: number;
          ba_hours: number;
          ba_cost: number;
          total_hours: number;
          total_cost: number;
          is_locked: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          scenario_id: string;
          row_order: number;
          module: string;
          scope_selection?: string | null;
          sr_im_hours?: number;
          sr_im_cost?: number;
          pm_hours?: number;
          pm_cost?: number;
          ba_hours?: number;
          ba_cost?: number;
          total_hours?: number;
          total_cost?: number;
          is_locked?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          scenario_id?: string;
          row_order?: number;
          module?: string;
          scope_selection?: string | null;
          sr_im_hours?: number;
          sr_im_cost?: number;
          pm_hours?: number;
          pm_cost?: number;
          ba_hours?: number;
          ba_cost?: number;
          total_hours?: number;
          total_cost?: number;
          is_locked?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scenario_lines_scenario_id_fkey";
            columns: ["scenario_id"];
            isOneToOne: false;
            referencedRelation: "scenarios";
            referencedColumns: ["id"];
          },
        ];
      };
      scoped_services: {
        Row: {
          id: string;
          proposal_id: string;
          service_type: string;
          description: string | null;
          hours: number;
          rate_card_lookup_key: string;
          cost: number;
          row_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          proposal_id: string;
          service_type: string;
          description?: string | null;
          hours?: number;
          rate_card_lookup_key: string;
          cost?: number;
          row_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          proposal_id?: string;
          service_type?: string;
          description?: string | null;
          hours?: number;
          rate_card_lookup_key?: string;
          cost?: number;
          row_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scoped_services_proposal_id_fkey";
            columns: ["proposal_id"];
            isOneToOne: false;
            referencedRelation: "proposals";
            referencedColumns: ["id"];
          },
        ];
      };
      migration_services: {
        Row: {
          id: string;
          proposal_id: string;
          line_label: string;
          sales_price: number;
          migration_detail: Json | null;
          row_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          proposal_id: string;
          line_label: string;
          sales_price?: number;
          migration_detail?: Json | null;
          row_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          proposal_id?: string;
          line_label?: string;
          sales_price?: number;
          migration_detail?: Json | null;
          row_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "migration_services_proposal_id_fkey";
            columns: ["proposal_id"];
            isOneToOne: false;
            referencedRelation: "proposals";
            referencedColumns: ["id"];
          },
        ];
      };
      bid_sheets: {
        Row: {
          id: string;
          proposal_id: string;
          customer_id: string | null;
          p1_hours: number;
          p1_cost: number;
          p2_hours: number;
          p2_cost: number;
          opt1_hours: number;
          opt1_cost: number;
          opt2_hours: number;
          opt2_cost: number;
          migration_cost: number;
          scoped_services_cost: number;
          discount_percent: number;
          recommended_scenario: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          proposal_id: string;
          customer_id?: string | null;
          p1_hours?: number;
          p1_cost?: number;
          p2_hours?: number;
          p2_cost?: number;
          opt1_hours?: number;
          opt1_cost?: number;
          opt2_hours?: number;
          opt2_cost?: number;
          migration_cost?: number;
          scoped_services_cost?: number;
          discount_percent?: number;
          recommended_scenario?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          proposal_id?: string;
          customer_id?: string | null;
          p1_hours?: number;
          p1_cost?: number;
          p2_hours?: number;
          p2_cost?: number;
          opt1_hours?: number;
          opt1_cost?: number;
          opt2_hours?: number;
          opt2_cost?: number;
          migration_cost?: number;
          scoped_services_cost?: number;
          discount_percent?: number;
          recommended_scenario?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bid_sheets_proposal_id_fkey";
            columns: ["proposal_id"];
            isOneToOne: true;
            referencedRelation: "proposals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bid_sheets_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      migration_config: {
        Row: {
          id: string;
          proposal_id: string;
          num_projects: number;
          hrs_per_import: number;
          lines_per_import_file: number;
          is_effort_included: boolean;
          is_workshop_included: boolean;
          pm_contingency_pct: number;
          ba_complexity_factor: number;
          pm_complexity_factor: number;
          ba_trips: number;
          pm_trips: number;
          doc_avg_mb_per_project: number;
          doc_mb_per_hour: number;
          core_requirements_hrs: number;
          core_migration_plan_hrs: number;
          core_validation_hrs: number;
          core_final_qa_hrs: number;
          core_pm_oversight_hrs: number;
          computed_total_cost: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          proposal_id: string;
          num_projects?: number;
          hrs_per_import?: number;
          lines_per_import_file?: number;
          is_effort_included?: boolean;
          is_workshop_included?: boolean;
          pm_contingency_pct?: number;
          ba_complexity_factor?: number;
          pm_complexity_factor?: number;
          ba_trips?: number;
          pm_trips?: number;
          doc_avg_mb_per_project?: number;
          doc_mb_per_hour?: number;
          core_requirements_hrs?: number;
          core_migration_plan_hrs?: number;
          core_validation_hrs?: number;
          core_final_qa_hrs?: number;
          core_pm_oversight_hrs?: number;
          computed_total_cost?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          proposal_id?: string;
          num_projects?: number;
          hrs_per_import?: number;
          lines_per_import_file?: number;
          is_effort_included?: boolean;
          is_workshop_included?: boolean;
          pm_contingency_pct?: number;
          ba_complexity_factor?: number;
          pm_complexity_factor?: number;
          ba_trips?: number;
          pm_trips?: number;
          doc_avg_mb_per_project?: number;
          doc_mb_per_hour?: number;
          core_requirements_hrs?: number;
          core_migration_plan_hrs?: number;
          core_validation_hrs?: number;
          core_final_qa_hrs?: number;
          core_pm_oversight_hrs?: number;
          computed_total_cost?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "migration_config_proposal_id_fkey";
            columns: ["proposal_id"];
            isOneToOne: true;
            referencedRelation: "proposals";
            referencedColumns: ["id"];
          },
        ];
      };
      migration_detail_lines: {
        Row: {
          id: string;
          proposal_id: string;
          section: string;
          label: string;
          quantity: number;
          items_per_object: number;
          total_line_items: number;
          row_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          proposal_id: string;
          section: string;
          label: string;
          quantity?: number;
          items_per_object?: number;
          total_line_items?: number;
          row_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          proposal_id?: string;
          section?: string;
          label?: string;
          quantity?: number;
          items_per_object?: number;
          total_line_items?: number;
          row_order?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "migration_detail_lines_proposal_id_fkey";
            columns: ["proposal_id"];
            isOneToOne: false;
            referencedRelation: "proposals";
            referencedColumns: ["id"];
          },
        ];
      };
      change_log: {
        Row: {
          id: string;
          proposal_id: string | null;
          table_name: string;
          record_id: string;
          action: string;
          changed_by: string | null;
          old_values: Json | null;
          new_values: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          proposal_id?: string | null;
          table_name: string;
          record_id: string;
          action: string;
          changed_by?: string | null;
          old_values?: Json | null;
          new_values?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          proposal_id?: string | null;
          table_name?: string;
          record_id?: string;
          action?: string;
          changed_by?: string | null;
          old_values?: Json | null;
          new_values?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "change_log_proposal_id_fkey";
            columns: ["proposal_id"];
            isOneToOne: false;
            referencedRelation: "proposals";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
