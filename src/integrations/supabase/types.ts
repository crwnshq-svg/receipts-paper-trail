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
      admin_notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          published_at: string | null
          target_module: string
          target_state: string | null
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          published_at?: string | null
          target_module: string
          target_state?: string | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          published_at?: string | null
          target_module?: string
          target_state?: string | null
          title?: string
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          case_id: string
          created_at: string
          id: string
          intake_completed: boolean
          messages: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          case_id: string
          created_at?: string
          id?: string
          intake_completed?: boolean
          messages?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          case_id?: string
          created_at?: string
          id?: string
          intake_completed?: boolean
          messages?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_packages: {
        Row: {
          case_id: string
          content: string | null
          created_at: string
          id: string
          pdf_url: string | null
          personal_statement: string | null
          recipient_type: string | null
          regeneration_count: number
          sections_included: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          case_id: string
          content?: string | null
          created_at?: string
          id?: string
          pdf_url?: string | null
          personal_statement?: string | null
          recipient_type?: string | null
          regeneration_count?: number
          sections_included?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          case_id?: string
          content?: string | null
          created_at?: string
          id?: string
          pdf_url?: string | null
          personal_statement?: string | null
          recipient_type?: string | null
          regeneration_count?: number
          sections_included?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_packages_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          case_name: string | null
          created_at: string
          custom_sub_type: string | null
          description: string | null
          dispute_type: Database["public"]["Enums"]["dispute_type"]
          foundation_doc_pending: boolean
          id: string
          module: Database["public"]["Enums"]["case_module"] | null
          opposing_party: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["case_status"]
          status_level: Database["public"]["Enums"]["case_status_level"]
          strength_score: number
          sub_type: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          case_name?: string | null
          created_at?: string
          custom_sub_type?: string | null
          description?: string | null
          dispute_type: Database["public"]["Enums"]["dispute_type"]
          foundation_doc_pending?: boolean
          id?: string
          module?: Database["public"]["Enums"]["case_module"] | null
          opposing_party?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["case_status"]
          status_level?: Database["public"]["Enums"]["case_status_level"]
          strength_score?: number
          sub_type?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          case_name?: string | null
          created_at?: string
          custom_sub_type?: string | null
          description?: string | null
          dispute_type?: Database["public"]["Enums"]["dispute_type"]
          foundation_doc_pending?: boolean
          id?: string
          module?: Database["public"]["Enums"]["case_module"] | null
          opposing_party?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["case_status"]
          status_level?: Database["public"]["Enums"]["case_status_level"]
          strength_score?: number
          sub_type?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      document_insights: {
        Row: {
          brief_description: string
          case_id: string
          created_at: string
          document_id: string
          full_guidance: string
          id: string
          insight_title: string
          insight_type: string
          is_dismissed: boolean
          user_id: string
        }
        Insert: {
          brief_description: string
          case_id: string
          created_at?: string
          document_id: string
          full_guidance: string
          id?: string
          insight_title: string
          insight_type: string
          is_dismissed?: boolean
          user_id: string
        }
        Update: {
          brief_description?: string
          case_id?: string
          created_at?: string
          document_id?: string
          full_guidance?: string
          id?: string
          insight_title?: string
          insight_type?: string
          is_dismissed?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_insights_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_insights_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          ai_summary: string | null
          case_id: string
          created_at: string
          description: string | null
          detected_type: string | null
          display_name: string | null
          exhibit_label: string | null
          extracted_data: Json | null
          file_name: string
          file_size: number
          file_type: string | null
          file_url: string | null
          flag_message: string | null
          flag_type: string | null
          id: string
          mime_type: string | null
          passive_ai_flagged: boolean
          storage_path: string
          suggested_name: string | null
          user_id: string
          user_note: string | null
        }
        Insert: {
          ai_summary?: string | null
          case_id: string
          created_at?: string
          description?: string | null
          detected_type?: string | null
          display_name?: string | null
          exhibit_label?: string | null
          extracted_data?: Json | null
          file_name: string
          file_size?: number
          file_type?: string | null
          file_url?: string | null
          flag_message?: string | null
          flag_type?: string | null
          id?: string
          mime_type?: string | null
          passive_ai_flagged?: boolean
          storage_path: string
          suggested_name?: string | null
          user_id: string
          user_note?: string | null
        }
        Update: {
          ai_summary?: string | null
          case_id?: string
          created_at?: string
          description?: string | null
          detected_type?: string | null
          display_name?: string | null
          exhibit_label?: string | null
          extracted_data?: Json | null
          file_name?: string
          file_size?: number
          file_type?: string | null
          file_url?: string | null
          flag_message?: string | null
          flag_type?: string | null
          id?: string
          mime_type?: string | null
          passive_ai_flagged?: boolean
          storage_path?: string
          suggested_name?: string | null
          user_id?: string
          user_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_documents: {
        Row: {
          case_id: string
          certified_mail_sent: boolean
          content: string
          created_at: string
          document_type: string
          id: string
          recipient_address: string | null
          recipient_type: string | null
          tracking_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          case_id: string
          certified_mail_sent?: boolean
          content: string
          created_at?: string
          document_type: string
          id?: string
          recipient_address?: string | null
          recipient_type?: string | null
          tracking_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          case_id?: string
          certified_mail_sent?: boolean
          content?: string
          created_at?: string
          document_type?: string
          id?: string
          recipient_address?: string | null
          recipient_type?: string | null
          tracking_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          case_id: string
          category: string | null
          clarifying_questions: Json
          created_at: string
          date_of_incident: string | null
          document_ids: Json
          edited_at: string | null
          flag_message: string | null
          flag_type: string | null
          formatted_entry: string | null
          id: string
          location: string | null
          notes: string | null
          occurred_at: string
          passive_ai_flagged: boolean
          raw_input: string | null
          title: string
          updated_at: string
          user_id: string
          what_happened: string
          who_involved: string | null
        }
        Insert: {
          case_id: string
          category?: string | null
          clarifying_questions?: Json
          created_at?: string
          date_of_incident?: string | null
          document_ids?: Json
          edited_at?: string | null
          flag_message?: string | null
          flag_type?: string | null
          formatted_entry?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          occurred_at?: string
          passive_ai_flagged?: boolean
          raw_input?: string | null
          title: string
          updated_at?: string
          user_id: string
          what_happened: string
          who_involved?: string | null
        }
        Update: {
          case_id?: string
          category?: string | null
          clarifying_questions?: Json
          created_at?: string
          date_of_incident?: string | null
          document_ids?: Json
          edited_at?: string | null
          flag_message?: string | null
          flag_type?: string | null
          formatted_entry?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          occurred_at?: string
          passive_ai_flagged?: boolean
          raw_input?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          what_happened?: string
          who_involved?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incidents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          case_id: string
          content: string
          created_at: string
          document_ids: Json
          id: string
          reminder_at: string | null
          reminder_sent: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          case_id: string
          content: string
          created_at?: string
          document_ids?: Json
          id?: string
          reminder_at?: string | null
          reminder_sent?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          case_id?: string
          content?: string
          created_at?: string
          document_ids?: Json
          id?: string
          reminder_at?: string | null
          reminder_sent?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          is_read: boolean
          related_case_id: string | null
          related_document_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_read?: boolean
          related_case_id?: string | null
          related_document_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_read?: boolean
          related_case_id?: string | null
          related_document_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_related_case_id_fkey"
            columns: ["related_case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_document_id_fkey"
            columns: ["related_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_listings: {
        Row: {
          blurb: string | null
          city: string | null
          contact_email: string | null
          contact_phone: string | null
          contact_url: string | null
          created_at: string
          id: string
          is_active: boolean
          module_type: Database["public"]["Enums"]["dispute_type"]
          name: string
          specialty: string
          state: string | null
          updated_at: string
        }
        Insert: {
          blurb?: string | null
          city?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          contact_url?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          module_type: Database["public"]["Enums"]["dispute_type"]
          name: string
          specialty: string
          state?: string | null
          updated_at?: string
        }
        Update: {
          blurb?: string | null
          city?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          contact_url?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          module_type?: Database["public"]["Enums"]["dispute_type"]
          name?: string
          specialty?: string
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      passive_ai_flags: {
        Row: {
          case_id: string
          created_at: string
          entity_id: string | null
          entity_type: string
          flag_message: string
          flag_type: string
          full_explanation: string | null
          id: string
          is_dismissed: boolean
          suggested_action: string | null
          user_id: string
        }
        Insert: {
          case_id: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          flag_message: string
          flag_type: string
          full_explanation?: string | null
          id?: string
          is_dismissed?: boolean
          suggested_action?: string | null
          user_id: string
        }
        Update: {
          case_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          flag_message?: string
          flag_type?: string
          full_explanation?: string | null
          id?: string
          is_dismissed?: boolean
          suggested_action?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "passive_ai_flags_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ai_questions_used: number
          ai_tone: string
          case_package_credits: number
          city: string | null
          created_at: string
          email: string | null
          first_name: string | null
          full_name: string | null
          has_landlord_issues: boolean | null
          has_workplace_issues: boolean | null
          id: string
          is_employed: boolean | null
          is_renting: boolean | null
          last_active_at: string | null
          lease_type: string | null
          onboarding_completed: boolean
          primary_language: string | null
          privacy_acknowledged_at: string | null
          rental_duration: string | null
          state: string | null
          stripe_customer_id: string | null
          subscription_status: string
          subscription_tier: Database["public"]["Enums"]["subscription_tier"]
          updated_at: string
          welcomed_at: string | null
          work_type: string | null
        }
        Insert: {
          ai_questions_used?: number
          ai_tone?: string
          case_package_credits?: number
          city?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          has_landlord_issues?: boolean | null
          has_workplace_issues?: boolean | null
          id: string
          is_employed?: boolean | null
          is_renting?: boolean | null
          last_active_at?: string | null
          lease_type?: string | null
          onboarding_completed?: boolean
          primary_language?: string | null
          privacy_acknowledged_at?: string | null
          rental_duration?: string | null
          state?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string
          subscription_tier?: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string
          welcomed_at?: string | null
          work_type?: string | null
        }
        Update: {
          ai_questions_used?: number
          ai_tone?: string
          case_package_credits?: number
          city?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          has_landlord_issues?: boolean | null
          has_workplace_issues?: boolean | null
          id?: string
          is_employed?: boolean | null
          is_renting?: boolean | null
          last_active_at?: string | null
          lease_type?: string | null
          onboarding_completed?: boolean
          primary_language?: string | null
          privacy_acknowledged_at?: string | null
          rental_duration?: string | null
          state?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string
          subscription_tier?: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string
          welcomed_at?: string | null
          work_type?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      case_module: "landlord_tenant" | "employer_employee" | "other_general"
      case_status: "active" | "resolved" | "archived" | "ongoing" | "escalated"
      case_status_level: "record" | "case"
      dispute_type:
        | "landlord_tenant"
        | "employer_employee"
        | "neighbor"
        | "other"
      subscription_tier: "free" | "monthly" | "annual"
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
      case_module: ["landlord_tenant", "employer_employee", "other_general"],
      case_status: ["active", "resolved", "archived", "ongoing", "escalated"],
      case_status_level: ["record", "case"],
      dispute_type: [
        "landlord_tenant",
        "employer_employee",
        "neighbor",
        "other",
      ],
      subscription_tier: ["free", "monthly", "annual"],
    },
  },
} as const
