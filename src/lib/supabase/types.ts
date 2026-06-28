/**
 * Supabase Database type definitions.
 *
 * This file is a placeholder that will be replaced by the generated types
 * from `supabase gen types typescript --local > src/lib/supabase/types.ts`
 * once the database schema is applied in Task 2.
 *
 * All tables and their column types are enumerated here so TypeScript
 * can validate queries at compile time.
 */

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
      users: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          role: "member" | "admin" | "super_admin";
          status: "active" | "inactive";
          contact_number: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          full_name: string;
          email: string;
          role?: "member" | "admin" | "super_admin";
          status?: "active" | "inactive";
          contact_number?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          email?: string;
          role?: "member" | "admin" | "super_admin";
          status?: "active" | "inactive";
          contact_number?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      courts: {
        Row: {
          id: string;
          name: string;
          operating_hours: Json;
          status: "available" | "unavailable";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          operating_hours: Json;
          status?: "available" | "unavailable";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          operating_hours?: Json;
          status?: "available" | "unavailable";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      court_unavailable_dates: {
        Row: {
          id: string;
          court_id: string;
          unavailable_date: string;
          reason: string | null;
        };
        Insert: {
          id?: string;
          court_id: string;
          unavailable_date: string;
          reason?: string | null;
        };
        Update: {
          id?: string;
          court_id?: string;
          unavailable_date?: string;
          reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "court_unavailable_dates_court_id_fkey";
            columns: ["court_id"];
            referencedRelation: "courts";
            referencedColumns: ["id"];
          },
        ];
      };
      bookings: {
        Row: {
          id: string;
          member_id: string;
          court_id: string;
          booking_date: string;
          start_time: string;
          end_time: string;
          status: "pending" | "confirmed" | "cancelled" | "rescheduled";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          member_id: string;
          court_id: string;
          booking_date: string;
          start_time: string;
          end_time: string;
          status?: "pending" | "confirmed" | "cancelled" | "rescheduled";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          member_id?: string;
          court_id?: string;
          booking_date?: string;
          start_time?: string;
          end_time?: string;
          status?: "pending" | "confirmed" | "cancelled" | "rescheduled";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_member_id_fkey";
            columns: ["member_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_court_id_fkey";
            columns: ["court_id"];
            referencedRelation: "courts";
            referencedColumns: ["id"];
          },
        ];
      };
      website_content: {
        Row: {
          id: string;
          section: string;
          content: Json;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          section: string;
          content: Json;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          section?: string;
          content?: Json;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "website_content_updated_by_fkey";
            columns: ["updated_by"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      gallery_images: {
        Row: {
          id: string;
          storage_path: string;
          public_url: string;
          display_order: number;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          storage_path: string;
          public_url: string;
          display_order: number;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          storage_path?: string;
          public_url?: string;
          display_order?: number;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "gallery_images_uploaded_by_fkey";
            columns: ["uploaded_by"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_messages: {
        Row: {
          id: string;
          sender_name: string;
          sender_email: string;
          message: string;
          status: "unread" | "replied" | "archived";
          created_at: string;
        };
        Insert: {
          id?: string;
          sender_name: string;
          sender_email: string;
          message: string;
          status?: "unread" | "replied" | "archived";
          created_at?: string;
        };
        Update: {
          id?: string;
          sender_name?: string;
          sender_email?: string;
          message?: string;
          status?: "unread" | "replied" | "archived";
          created_at?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string | null;
          action_type: string;
          affected_record_id: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          action_type: string;
          affected_record_id?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          action_type?: string;
          affected_record_id?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      roles: {
        Row: {
          id: string;
          name: string;
          permissions: Json;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          permissions: Json;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          permissions?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      backup_history: {
        Row: {
          id: string;
          triggered_by: string | null;
          status: "in_progress" | "completed" | "failed";
          error_message: string | null;
          started_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          triggered_by?: string | null;
          status?: "in_progress" | "completed" | "failed";
          error_message?: string | null;
          started_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          triggered_by?: string | null;
          status?: "in_progress" | "completed" | "failed";
          error_message?: string | null;
          started_at?: string;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "backup_history_triggered_by_fkey";
            columns: ["triggered_by"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      system_settings: {
        Row: {
          id: string;
          key: string;
          value: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          value: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          key?: string;
          value?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: "member" | "admin" | "super_admin";
      user_status: "active" | "inactive";
      booking_status: "pending" | "confirmed" | "cancelled" | "rescheduled";
      court_status: "available" | "unavailable";
      contact_message_status: "unread" | "replied" | "archived";
      backup_status: "in_progress" | "completed" | "failed";
    };
    CompositeTypes: Record<string, never>;
  };
}
