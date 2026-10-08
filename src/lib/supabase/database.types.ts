export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      entries: {
        Row: {
          body_sha256: string | null
          char_count: number
          client_updated_at: string
          conflict_of: string | null
          created_at: string
          deleted_at: string | null
          id: string
          is_recovered: boolean
          preview_text: string
          revision_id: string | null
          storage_path: string
          updated_at: string
          user_id: string
          version: number
          word_count: number
        }
        Insert: {
          body_sha256?: string | null
          char_count?: number
          client_updated_at?: string
          conflict_of?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_recovered?: boolean
          preview_text?: string
          revision_id?: string | null
          storage_path: string
          updated_at?: string
          user_id: string
          version?: number
          word_count?: number
        }
        Update: {
          body_sha256?: string | null
          char_count?: number
          client_updated_at?: string
          conflict_of?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_recovered?: boolean
          preview_text?: string
          revision_id?: string | null
          storage_path?: string
          updated_at?: string
          user_id?: string
          version?: number
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "entries_conflict_of_fkey"
            columns: ["conflict_of"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_receipts: {
        Row: {
          mutation_id: string
          request: Json
          result: Json
          user_id: string
        }
        Insert: {
          mutation_id: string
          request: Json
          result: Json
          user_id: string
        }
        Update: {
          mutation_id?: string
          request?: Json
          result?: Json
          user_id?: string
        }
        Relationships: []
      }
      mcp_keys: {
        Row: {
          ciphertext: string
          created_at: string
          generation: string
          key_hash: string
          last_used_at: string | null
          request_count: number
          user_id: string
          window_started_at: string
        }
        Insert: {
          ciphertext: string
          created_at?: string
          generation: string
          key_hash: string
          last_used_at?: string | null
          request_count?: number
          user_id: string
          window_started_at?: string
        }
        Update: {
          ciphertext?: string
          created_at?: string
          generation?: string
          key_hash?: string
          last_used_at?: string | null
          request_count?: number
          user_id?: string
          window_started_at?: string
        }
        Relationships: []
      }
      preferences: {
        Row: {
          client_updated_at: string
          font: string
          font_size: number
          theme: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          client_updated_at?: string
          font?: string
          font_size?: number
          theme?: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          client_updated_at?: string
          font?: string
          font_size?: number
          theme?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      authenticate_mcp_key: {
        Args: { p_hash: string }
        Returns: {
          account_id: string
          limited: boolean
        }[]
      }
      get_preferences: {
        Args: never
        Returns: {
          client_updated_at: string
          font: string
          font_size: number
          theme: string
          updated_at: string
          user_id: string
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "preferences"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      publish_entry: {
        Args: { p_mutation_id: string; p_request: Json }
        Returns: Json
      }
      publish_preferences: {
        Args: {
          expected_version: number
          patch: Json
          requested_user_id: string
        }
        Returns: {
          client_updated_at: string
          font: string
          font_size: number
          theme: string
          updated_at: string
          user_id: string
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "preferences"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      replace_mcp_key: {
        Args: {
          p_ciphertext: string
          p_expected: string
          p_generation: string
          p_hash: string
          p_user_id: string
        }
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

