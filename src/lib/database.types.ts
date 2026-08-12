/**
 * supabase/migrations/ 의 스키마를 반영한 DB 타입.
 *
 * Supabase 프로젝트를 만든 뒤에는 아래 명령으로 재생성하고, 이 파일을 손으로 고치지 않는다.
 *   npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      games: {
        Row: {
          id: string;
          title_ko: string;
          title_en: string | null;
          owned: boolean;
          player_counts: number[];
          recommended_counts: number[];
          best_count: number | null;
          supports_10_plus: boolean;
          min_playtime: number | null;
          max_playtime: number | null;
          weight: number | null;
          categories: string[];
          themes: string[];
          mechanics: string[];
          year_published: number | null;
          image_file: string | null;
          image_path: string | null;
          rule_video_url: string | null;
          description: string | null;
          notes: string | null;
          is_estimated: boolean;
          estimated_fields: string[];
          last_played_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['games']['Row']>;
        Update: Partial<Database['public']['Tables']['games']['Row']>;
        Relationships: [];
      };
      members: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['members']['Row']>;
        Update: Partial<Database['public']['Tables']['members']['Row']>;
        Relationships: [];
      };
      plays: {
        Row: {
          id: string;
          game_id: string;
          member_ids: string[];
          rounds: Json;
          memo: string | null;
          scores: Json;
          started_at: string;
          ended_at: string | null;
        };
        Insert: Partial<Database['public']['Tables']['plays']['Row']>;
        Update: Partial<Database['public']['Tables']['plays']['Row']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      mark_played: {
        Args: { p_game_id: string; p_played_on?: string };
        Returns: Database['public']['Tables']['games']['Row'];
      };
      end_play: {
        Args: { p_play_id: string; p_memo?: string; p_played_on?: string };
        Returns: Database['public']['Tables']['plays']['Row'];
      };
      log_play: {
        Args: { p_game_id: string; p_member_ids?: string[]; p_played_on?: string };
        Returns: Database['public']['Tables']['plays']['Row'];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
