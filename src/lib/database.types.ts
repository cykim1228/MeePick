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
          /** 이 멤버가 앱 계정과 연결돼 있으면 그 회원 id. 손님 멤버는 null */
          profile_id: string | null;
          /** 명단에서 숨긴다. 운영 계정처럼 실제로 게임하지 않는 멤버용 */
          hidden: boolean;
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
          /** 이 판이 속한 모임 일정. 일정 없이 그냥 모인 날은 null */
          meetup_id: string | null;
        };
        Insert: Partial<Database['public']['Tables']['plays']['Row']>;
        Update: Partial<Database['public']['Tables']['plays']['Row']>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          handle: string;
          /** 닉네임 — 화면에 보이는 이름 */
          display_name: string;
          /** 실명 — 누구인지 확인용 */
          real_name: string | null;
          avatar_path: string | null;
          bio: string | null;
          /** 모임장. 남의 글 삭제와 회원 내보내기가 가능하다 */
          is_admin: boolean;
          /** 첫 안내를 마친 시각. null이면 아직 안 봤다 */
          onboarded_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['profiles']['Row']>;
        Update: Partial<Database['public']['Tables']['profiles']['Row']>;
        Relationships: [];
      };
      invite_codes: {
        Row: {
          code: string;
          created_by: string | null;
          used_by: string | null;
          used_at: string | null;
          is_reusable: boolean;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['invite_codes']['Row']>;
        Update: Partial<Database['public']['Tables']['invite_codes']['Row']>;
        Relationships: [];
      };
      posts: {
        Row: {
          id: string;
          author_id: string;
          body: string;
          image_paths: string[];
          game_id: string | null;
          meetup_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['posts']['Row']>;
        Update: Partial<Database['public']['Tables']['posts']['Row']>;
        Relationships: [];
      };
      post_likes: {
        Row: { post_id: string; user_id: string; created_at: string };
        Insert: Partial<Database['public']['Tables']['post_likes']['Row']>;
        Update: Partial<Database['public']['Tables']['post_likes']['Row']>;
        Relationships: [];
      };
      game_likes: {
        Row: { game_id: string; profile_id: string; created_at: string };
        Insert: Partial<Database['public']['Tables']['game_likes']['Row']>;
        Update: Partial<Database['public']['Tables']['game_likes']['Row']>;
        Relationships: [];
      };
      post_comments: {
        Row: {
          id: string;
          post_id: string;
          author_id: string;
          body: string;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['post_comments']['Row']>;
        Update: Partial<Database['public']['Tables']['post_comments']['Row']>;
        Relationships: [];
      };
      meetups: {
        Row: {
          id: string;
          title: string;
          starts_at: string;
          place: string | null;
          memo: string | null;
          capacity: number | null;
          created_by: string;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['meetups']['Row']>;
        Update: Partial<Database['public']['Tables']['meetups']['Row']>;
        Relationships: [];
      };
      meetup_rsvps: {
        Row: {
          meetup_id: string;
          user_id: string;
          status: 'going' | 'maybe' | 'no';
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['meetup_rsvps']['Row']>;
        Update: Partial<Database['public']['Tables']['meetup_rsvps']['Row']>;
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
        Args: {
          p_game_id: string;
          p_member_ids?: string[];
          p_played_on?: string;
          p_meetup_id?: string | null;
        };
        Returns: Database['public']['Tables']['plays']['Row'];
      };
      link_guest_to_profile: {
        Args: { p_guest_id: string; p_profile_id: string };
        Returns: Database['public']['Tables']['members']['Row'];
      };
      is_member: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      check_invite: {
        Args: { p_code: string };
        Returns: boolean;
      };
      redeem_invite: {
        Args: { p_code: string; p_display_name: string; p_real_name?: string | null };
        Returns: Database['public']['Tables']['profiles']['Row'];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
