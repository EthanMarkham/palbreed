export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          user_id: string;
          display_name: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: { display_name?: string; avatar_url?: string | null };
        Relationships: [];
      };
      workspaces: {
        Row: never;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      workspace_members: {
        Row: never;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      workspace_invites: {
        Row: never;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      world_snapshots: {
        Row: never;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      ensure_my_account: { Args: Record<PropertyKey, never>; Returns: undefined };
      list_my_workspaces: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          workspace_id: string;
          name: string;
          kind: string;
          role: string;
          created_at: string;
        }>;
      };
      list_workspace_members: {
        Args: { target_workspace_id: string };
        Returns: Array<{
          user_id: string;
          display_name: string;
          avatar_url: string | null;
          role: string;
          joined_at: string;
        }>;
      };
      create_team_workspace: { Args: { workspace_name: string }; Returns: string };
      create_workspace_invite: {
        Args: { target_workspace_id: string; invited_role: string; expires_in_hours?: number };
        Returns: Array<{
          invitation_id: string;
          invitation_token: string;
          role: string;
          expires_at: string;
        }>;
      };
      list_workspace_invites: {
        Args: { target_workspace_id: string };
        Returns: Array<{
          invitation_id: string;
          role: string;
          created_at: string;
          expires_at: string;
          accepted_at: string | null;
          revoked_at: string | null;
        }>;
      };
      accept_workspace_invite: { Args: { invitation_token: string }; Returns: string };
      revoke_workspace_invite: { Args: { invitation_id: string }; Returns: undefined };
      set_workspace_member_role: {
        Args: { target_workspace_id: string; target_user_id: string; next_role: string };
        Returns: undefined;
      };
      remove_workspace_member: {
        Args: { target_workspace_id: string; target_user_id: string };
        Returns: undefined;
      };
      list_world_snapshot_metadata: {
        Args: { target_workspace_id: string };
        Returns: Array<{
          snapshot_id: string;
          identity_key: string;
          name: string;
          platform: string;
          game_version: string;
          schema_version: number;
          revision: number;
          imported_at: string | null;
          updated_at: string;
          deleted_at: string | null;
        }>;
      };
      get_world_snapshot: {
        Args: { target_snapshot_id: string };
        Returns: Array<{
          snapshot_id: string;
          workspace_id: string;
          identity_key: string;
          name: string;
          platform: string;
          game_version: string;
          schema_version: number;
          revision: number;
          payload: Json;
          imported_at: string | null;
          updated_at: string;
        }>;
      };
      replace_world_snapshot: {
        Args: {
          target_workspace_id: string;
          target_snapshot_id: string;
          target_identity_key: string;
          expected_revision: number;
          snapshot_name: string;
          snapshot_platform: string;
          snapshot_game_version: string;
          snapshot_schema_version: number;
          snapshot_payload: Json;
          snapshot_imported_at: string | null;
        };
        Returns: Array<{
          applied: boolean;
          snapshot_id: string | null;
          revision: number;
          updated_at: string | null;
          deleted_at: string | null;
        }>;
      };
      delete_world_snapshot: {
        Args: { target_snapshot_id: string; expected_revision: number };
        Returns: Array<{
          applied: boolean;
          snapshot_id: string | null;
          revision: number;
          updated_at: string | null;
          deleted_at: string | null;
        }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
