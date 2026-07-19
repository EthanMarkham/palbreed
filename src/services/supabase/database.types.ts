export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      builder_search_definitions: {
        Row: never;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      builder_search_history: {
        Row: never;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      record_builder_search: {
        Args: {
          search_target_pal_id: string;
          search_passive_ids: string[];
          search_objective: string;
          search_allowed_extra_passives: number;
          anonymous_session_token?: string | null;
        };
        Returns: undefined;
      };
      list_recent_builder_searches: {
        Args: {
          anonymous_session_token?: string | null;
          result_limit?: number;
        };
        Returns: Array<{
          target_pal_id: string;
          passive_ids: string[];
          objective: string;
          allowed_extra_passives: number;
          searched_at: string;
        }>;
      };
      delete_recent_builder_search: {
        Args: {
          search_target_pal_id: string;
          search_passive_ids: string[];
          anonymous_session_token?: string | null;
        };
        Returns: undefined;
      };
      clear_recent_builder_searches: {
        Args: { anonymous_session_token?: string | null };
        Returns: undefined;
      };
      claim_recent_builder_searches: {
        Args: { anonymous_session_token: string };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
