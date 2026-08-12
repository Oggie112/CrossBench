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
    PostgrestVersion: "14.15"
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
      committee_sector_relevance: {
        Row: {
          committee_id: string
          sector: string
          weight: number
        }
        Insert: {
          committee_id: string
          sector: string
          weight: number
        }
        Update: {
          committee_id?: string
          sector?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "committee_sector_relevance_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "committees"
            referencedColumns: ["id"]
          },
        ]
      }
      committees: {
        Row: {
          chamber: string
          country: string
          external_ids: Json | null
          id: string
          name: string
        }
        Insert: {
          chamber: string
          country: string
          external_ids?: Json | null
          id?: string
          name: string
        }
        Update: {
          chamber?: string
          country?: string
          external_ids?: Json | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "committees_country_fkey"
            columns: ["country"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
        ]
      }
      countries: {
        Row: {
          code: string
          name: string
        }
        Insert: {
          code: string
          name: string
        }
        Update: {
          code?: string
          name?: string
        }
        Relationships: []
      }
      disclosure_events: {
        Row: {
          amount_max: number | null
          amount_min: number | null
          as_of_date: string | null
          confidence: string | null
          country: string
          created_at: string | null
          currency: string | null
          disclosure_type: string
          id: string
          instrument_type: string | null
          notification_date: string | null
          official_external_id: string | null
          official_id: string | null
          raw_security_text: string | null
          security_id: string | null
          source_document_id: string | null
          transaction_date: string | null
          transaction_type: string | null
          value_band: string | null
        }
        Insert: {
          amount_max?: number | null
          amount_min?: number | null
          as_of_date?: string | null
          confidence?: string | null
          country: string
          created_at?: string | null
          currency?: string | null
          disclosure_type: string
          id?: string
          instrument_type?: string | null
          notification_date?: string | null
          official_external_id?: string | null
          official_id?: string | null
          raw_security_text?: string | null
          security_id?: string | null
          source_document_id?: string | null
          transaction_date?: string | null
          transaction_type?: string | null
          value_band?: string | null
        }
        Update: {
          amount_max?: number | null
          amount_min?: number | null
          as_of_date?: string | null
          confidence?: string | null
          country?: string
          created_at?: string | null
          currency?: string | null
          disclosure_type?: string
          id?: string
          instrument_type?: string | null
          notification_date?: string | null
          official_external_id?: string | null
          official_id?: string | null
          raw_security_text?: string | null
          security_id?: string | null
          source_document_id?: string | null
          transaction_date?: string | null
          transaction_type?: string | null
          value_band?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disclosure_events_country_fkey"
            columns: ["country"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "disclosure_events_official_id_fkey"
            columns: ["official_id"]
            isOneToOne: false
            referencedRelation: "officials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disclosure_events_security_id_fkey"
            columns: ["security_id"]
            isOneToOne: false
            referencedRelation: "securities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disclosure_events_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "raw_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_runs: {
        Row: {
          error_message: string | null
          finished_at: string | null
          id: string
          records_fetched: number | null
          records_new: number | null
          source_name: string
          started_at: string | null
          status: string | null
        }
        Insert: {
          error_message?: string | null
          finished_at?: string | null
          id?: string
          records_fetched?: number | null
          records_new?: number | null
          source_name: string
          started_at?: string | null
          status?: string | null
        }
        Update: {
          error_message?: string | null
          finished_at?: string | null
          id?: string
          records_fetched?: number | null
          records_new?: number | null
          source_name?: string
          started_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      official_committee_memberships: {
        Row: {
          committee_id: string
          end_date: string | null
          official_id: string
          role: string | null
          start_date: string
        }
        Insert: {
          committee_id: string
          end_date?: string | null
          official_id: string
          role?: string | null
          start_date: string
        }
        Update: {
          committee_id?: string
          end_date?: string | null
          official_id?: string
          role?: string | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "official_committee_memberships_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "committees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "official_committee_memberships_official_id_fkey"
            columns: ["official_id"]
            isOneToOne: false
            referencedRelation: "officials"
            referencedColumns: ["id"]
          },
        ]
      }
      officials: {
        Row: {
          chamber: string
          country: string
          current_office: string | null
          external_ids: Json | null
          full_name: string
          id: string
          party: string | null
        }
        Insert: {
          chamber: string
          country: string
          current_office?: string | null
          external_ids?: Json | null
          full_name: string
          id?: string
          party?: string | null
        }
        Update: {
          chamber?: string
          country?: string
          current_office?: string | null
          external_ids?: Json | null
          full_name?: string
          id?: string
          party?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "officials_country_fkey"
            columns: ["country"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
        ]
      }
      raw_documents: {
        Row: {
          country: string
          fetched_at: string | null
          id: string
          processed: boolean | null
          processing_error: string | null
          source_name: string
          source_ref: string
          storage_path: string | null
        }
        Insert: {
          country: string
          fetched_at?: string | null
          id?: string
          processed?: boolean | null
          processing_error?: string | null
          source_name: string
          source_ref: string
          storage_path?: string | null
        }
        Update: {
          country?: string
          fetched_at?: string | null
          id?: string
          processed?: boolean | null
          processing_error?: string | null
          source_name?: string
          source_ref?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_documents_country_fkey"
            columns: ["country"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
        ]
      }
      securities: {
        Row: {
          canonical_name: string
          id: string
          isin: string | null
          primary_exchange: string | null
          primary_ticker: string | null
          sector: string | null
        }
        Insert: {
          canonical_name: string
          id?: string
          isin?: string | null
          primary_exchange?: string | null
          primary_ticker?: string | null
          sector?: string | null
        }
        Update: {
          canonical_name?: string
          id?: string
          isin?: string | null
          primary_exchange?: string | null
          primary_ticker?: string | null
          sector?: string | null
        }
        Relationships: []
      }
      security_identifiers: {
        Row: {
          context: string | null
          identifier_type: string
          identifier_value: string
          security_id: string | null
        }
        Insert: {
          context?: string | null
          identifier_type: string
          identifier_value: string
          security_id?: string | null
        }
        Update: {
          context?: string | null
          identifier_type?: string
          identifier_value?: string
          security_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_identifiers_security_id_fkey"
            columns: ["security_id"]
            isOneToOne: false
            referencedRelation: "securities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
