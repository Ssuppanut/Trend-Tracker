/**
 * Hand-authored types for the Trend Tracker Supabase schema.
 *
 * Mirrors `supabase/migrations/0001_initial.sql`. There is no Supabase project
 * linked to the CLI yet, so these are maintained by hand. Once a project is
 * linked you can regenerate this file with:
 *
 *   supabase gen types typescript --project-id <id> > lib/db/types.ts
 *
 * Use with the Supabase clients, e.g. `SupabaseClient<Database>`.
 */

export type Lang = "th" | "en";
export type LangScope = "th" | "en" | "mixed";
export type TrendStatus = "active" | "fading" | "archived";
export type Plan = "free" | "pro";
export type DigestFreq = "daily" | "weekly" | "off";

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
      categories: {
        Row: {
          slug: string;
          name_th: string;
          name_en: string;
          sort_order: number;
        };
        Insert: {
          slug: string;
          name_th: string;
          name_en: string;
          sort_order?: number;
        };
        Update: {
          slug?: string;
          name_th?: string;
          name_en?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      raw_items: {
        Row: {
          id: number;
          source: string;
          external_id: string;
          title: string;
          url: string | null;
          body: string | null;
          lang: Lang;
          category_hint: string | null;
          engagement: number;
          engagement_raw: Json | null;
          published_at: string;
          fetched_at: string;
          embedding: number[] | null;
          trend_id: number | null;
        };
        Insert: {
          id?: number;
          source: string;
          external_id: string;
          title: string;
          url?: string | null;
          body?: string | null;
          lang: Lang;
          category_hint?: string | null;
          engagement?: number;
          engagement_raw?: Json | null;
          published_at: string;
          fetched_at?: string;
          embedding?: number[] | null;
          trend_id?: number | null;
        };
        Update: {
          id?: number;
          source?: string;
          external_id?: string;
          title?: string;
          url?: string | null;
          body?: string | null;
          lang?: Lang;
          category_hint?: string | null;
          engagement?: number;
          engagement_raw?: Json | null;
          published_at?: string;
          fetched_at?: string;
          embedding?: number[] | null;
          trend_id?: number | null;
        };
        Relationships: [];
      };
      trends: {
        Row: {
          id: number;
          title: string;
          summary: string | null;
          category: string;
          lang_scope: LangScope;
          status: TrendStatus;
          score: number;
          volume_24h: number;
          volume_7d_avg: number;
          velocity: number;
          source_count: number;
          engagement_sum: number;
          centroid: number[] | null;
          first_seen: string;
          last_updated: string;
        };
        Insert: {
          id?: number;
          title: string;
          summary?: string | null;
          category: string;
          lang_scope?: LangScope;
          status?: TrendStatus;
          score?: number;
          volume_24h?: number;
          volume_7d_avg?: number;
          velocity?: number;
          source_count?: number;
          engagement_sum?: number;
          centroid?: number[] | null;
          first_seen?: string;
          last_updated?: string;
        };
        Update: {
          id?: number;
          title?: string;
          summary?: string | null;
          category?: string;
          lang_scope?: LangScope;
          status?: TrendStatus;
          score?: number;
          volume_24h?: number;
          volume_7d_avg?: number;
          velocity?: number;
          source_count?: number;
          engagement_sum?: number;
          centroid?: number[] | null;
          first_seen?: string;
          last_updated?: string;
        };
        Relationships: [];
      };
      trend_snapshots: {
        Row: {
          trend_id: number;
          captured_at: string;
          score: number;
          volume_24h: number;
          velocity: number;
        };
        Insert: {
          trend_id: number;
          captured_at?: string;
          score: number;
          volume_24h: number;
          velocity: number;
        };
        Update: {
          trend_id?: number;
          captured_at?: string;
          score?: number;
          volume_24h?: number;
          velocity?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          user_id: string;
          display_name: string | null;
          plan: Plan;
          categories: string[];
          digest_freq: DigestFreq;
          created_at: string;
        };
        Insert: {
          user_id: string;
          display_name?: string | null;
          plan?: Plan;
          categories?: string[];
          digest_freq?: DigestFreq;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          display_name?: string | null;
          plan?: Plan;
          categories?: string[];
          digest_freq?: DigestFreq;
          created_at?: string;
        };
        Relationships: [];
      };
      user_keywords: {
        Row: {
          id: number;
          user_id: string;
          keyword: string;
          lang: Lang;
          created_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          keyword: string;
          lang?: Lang;
          created_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          keyword?: string;
          lang?: Lang;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
