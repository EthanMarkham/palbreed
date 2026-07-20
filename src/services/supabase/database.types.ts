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
      inventory_profiles: {
        Row: never;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      pal_instances: {
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
      get_inventory_document: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      list_inventory_profiles: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          profile_id: string;
          local_profile_id: string;
          name: string;
          game_version: string;
          platform: string;
          world_id: string | null;
          slot_id: string | null;
          account_id: string | null;
          player_id: string | null;
          player_name: string | null;
          player_level: number | null;
          pal_count: number;
          imported_at: string | null;
          created_at: string;
          updated_at: string;
          revision: number;
        }>;
      };
      replace_inventory_profile: {
        Args: {
          profile_local_id: string;
          profile_name: string;
          profile_game_version: string;
          profile_platform: string;
          profile_world_id: string;
          profile_slot_id: string;
          profile_account_id?: string | null;
          profile_player_id?: string | null;
          profile_player_name?: string | null;
          profile_player_level?: number | null;
          imported_at?: string | null;
          pal_records?: Json;
        };
        Returns: Json;
      };
      delete_inventory_profile: {
        Args: { profile_local_id: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
