// ============================================================================
// CreoSmith — database types
// ----------------------------------------------------------------------------
// Hand-authored to mirror supabase/schema.sql. When the schema changes, update
// this file (or regenerate with `supabase gen types typescript` once a project
// is linked) and keep docs/data-model.md in sync.
// ============================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          stripe_customer_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          stripe_customer_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          stripe_customer_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      templates: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          type: string;
          category: string | null;
          supported_standards: string[];
          runtime_keys: Json;
          preview_url: string | null;
          config_schema: Json;
          pricing_tier: string | null;
          is_published: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          type: string;
          category?: string | null;
          supported_standards?: string[];
          runtime_keys?: Json;
          preview_url?: string | null;
          config_schema?: Json;
          pricing_tier?: string | null;
          is_published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          type?: string;
          category?: string | null;
          supported_standards?: string[];
          runtime_keys?: Json;
          preview_url?: string | null;
          config_schema?: Json;
          pricing_tier?: string | null;
          is_published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      creatives: {
        Row: {
          id: string;
          user_id: string;
          template_id: string;
          name: string | null;
          selected_format: string;
          config_json: Json;
          status: Database["public"]["Enums"]["creative_status"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          template_id: string;
          name?: string | null;
          selected_format: string;
          config_json?: Json;
          status?: Database["public"]["Enums"]["creative_status"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          template_id?: string;
          name?: string | null;
          selected_format?: string;
          config_json?: Json;
          status?: Database["public"]["Enums"]["creative_status"];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "creatives_template_id_fkey";
            columns: ["template_id"];
            referencedRelation: "templates";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          plan_type: Database["public"]["Enums"]["plan_type"];
          template_id: string | null;
          status: Database["public"]["Enums"]["subscription_status"];
          stripe_subscription_id: string | null;
          stripe_customer_id: string | null;
          current_period_end: string | null;
          cancel_at_period_end: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          plan_type: Database["public"]["Enums"]["plan_type"];
          template_id?: string | null;
          status: Database["public"]["Enums"]["subscription_status"];
          stripe_subscription_id?: string | null;
          stripe_customer_id?: string | null;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          plan_type?: Database["public"]["Enums"]["plan_type"];
          template_id?: string | null;
          status?: Database["public"]["Enums"]["subscription_status"];
          stripe_subscription_id?: string | null;
          stripe_customer_id?: string | null;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_template_id_fkey";
            columns: ["template_id"];
            referencedRelation: "templates";
            referencedColumns: ["id"];
          },
        ];
      };
      // ADR-0016: aggregated, not append-only. No client or app code writes this
      // directly — `increment_creative_event()` is the only writer, because the
      // upsert it performs cannot be expressed through PostgREST.
      creative_event_counters: {
        Row: {
          creative_id: string;
          event_type: Database["public"]["Enums"]["creative_event_type"];
          /** date_trunc('hour', …) at ingest; collapsed to midnight after 30 days. */
          bucket: string;
          count: number;
        };
        Insert: {
          creative_id: string;
          event_type: Database["public"]["Enums"]["creative_event_type"];
          bucket: string;
          count?: number;
        };
        Update: {
          creative_id?: string;
          event_type?: Database["public"]["Enums"]["creative_event_type"];
          bucket?: string;
          count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "creative_event_counters_creative_id_fkey";
            columns: ["creative_id"];
            referencedRelation: "creatives";
            referencedColumns: ["id"];
          },
        ];
      };
      stripe_events: {
        Row: {
          id: string;
          type: string;
          received_at: string;
        };
        Insert: {
          id: string;
          type: string;
          received_at?: string;
        };
        Update: {
          id?: string;
          type?: string;
          received_at?: string;
        };
        Relationships: [];
      };
      // ADR-0023: the per-click store behind conversion attribution. Written
      // only by record_click(), from the `/r` redirect; no client access.
      creative_clicks: {
        Row: {
          /** 24 lower-case hex characters, minted by `/r`. */
          click_id: string;
          creative_id: string;
          /** The config field the viewer left through, e.g. `resultABUrl`. */
          field: string;
          /** ISO 3166-1 alpha-2, or null when the platform sent no geo header. */
          country: string | null;
          created_at: string;
        };
        Insert: {
          click_id: string;
          creative_id: string;
          field: string;
          country?: string | null;
          created_at?: string;
        };
        Update: {
          click_id?: string;
          creative_id?: string;
          field?: string;
          country?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "creative_clicks_creative_id_fkey";
            columns: ["creative_id"];
            referencedRelation: "creatives";
            referencedColumns: ["id"];
          },
        ];
      };
      // ADR-0023: written only by record_postback(); read only through
      // get_creative_conversions() and get_creative_conversion_goals().
      conversions: {
        Row: {
          id: number;
          click_id: string;
          creative_id: string;
          field: string;
          /** '' when the network sent none (ADR-0027). */
          goal: string;
          txid: string;
          status: ConversionStatus;
          payout: number;
          currency: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          click_id: string;
          creative_id: string;
          field: string;
          goal?: string;
          txid?: string;
          status: ConversionStatus;
          payout?: number;
          currency?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          click_id?: string;
          creative_id?: string;
          field?: string;
          goal?: string;
          txid?: string;
          status?: ConversionStatus;
          payout?: number;
          currency?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversions_creative_id_fkey";
            columns: ["creative_id"];
            referencedRelation: "creatives";
            referencedColumns: ["id"];
          },
        ];
      };
      postback_keys: {
        Row: {
          user_id: string;
          key: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          key: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          key?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      postback_log: {
        Row: {
          id: number;
          user_id: string;
          received_at: string;
          params: Json;
          result: string;
        };
        Insert: {
          user_id: string;
          received_at?: string;
          params?: Json;
          result: string;
        };
        Update: {
          user_id?: string;
          received_at?: string;
          params?: Json;
          result?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      get_creative_serving: {
        Args: { p_creative_id: string };
        Returns: Database["private"]["Views"]["creative_serving"]["Row"][];
      };
      // Dashboard analytics: the only read path into creative_event_counters.
      // Scoped to auth.uid() inside the function, hence no arguments (ADR-0008).
      get_creative_overview: {
        Args: Record<string, never>;
        Returns: {
          creative_id: string;
          impressions: number;
          /** VPAID-only (ADR-0012). Always 0 for SIMID — render as "n/a", not zero. */
          viewable: number;
          /** Final call-to-action only; never an intermediate interaction (ADR-0016). */
          clicks: number;
          is_entitled: boolean;
          should_serve: boolean;
        }[];
      };
      // One creative's clicks through `/r` and its conversions per (UTC day,
      // exit field). Owner-checked inside: another account's id yields no rows.
      get_creative_conversions: {
        Args: { p_creative_id: string; p_days?: number };
        Returns: {
          /** YYYY-MM-DD, UTC. */
          day: string;
          field: string;
          clicks: number;
          approved: number;
          pending: number;
          rejected: number;
          /** Approved payout per ISO currency code, e.g. { USD: 12.5 }. */
          revenue: Json;
        }[];
      };
      // The same window and owner check, per goal the network reported
      // (ADR-0027). No clicks: a click has no goal until it converts.
      get_creative_conversion_goals: {
        Args: { p_creative_id: string; p_days?: number };
        Returns: {
          /** '' for conversions that came without a goal. */
          goal: string;
          approved: number;
          pending: number;
          rejected: number;
          /** Approved payout per ISO currency code, e.g. { USD: 12.5 }. */
          revenue: Json;
        }[];
      };
      // The caller's postback key, made on first call (ADR-0023).
      ensure_postback_key: {
        Args: Record<string, never>;
        Returns: string;
      };
      // Replaces the caller's key; the old one stops working at once.
      rotate_postback_key: {
        Args: Record<string, never>;
        Returns: string;
      };
      get_postback_log: {
        Args: { p_limit?: number };
        Returns: {
          received_at: string;
          params: Json;
          result: string;
        }[];
      };
      // The click redirect's only write. Service role only. False when the
      // per-creative, per-minute cap declined the row (the redirect still ran).
      record_click: {
        Args: {
          p_click_id: string;
          p_creative_id: string;
          p_field: string;
          p_country: string | null;
          p_per_minute: number;
        };
        Returns: boolean;
      };
      // Whether the caller has made a postback key yet — read-only, unlike
      // ensure_postback_key(), which creates one.
      has_postback_key: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      // The postback route's only write. Service role only. Returns a result
      // code: 'created' | 'updated' | 'unchanged' on success (see
      // isPostbackSuccess in lib/postback.ts), a rejection code otherwise.
      record_postback: {
        Args: {
          p_key: string;
          p_click_id: string | null;
          p_status: ConversionStatus | null;
          p_payout: number | null;
          p_currency: string | null;
          p_txid: string;
          p_error: string | null;
          p_params: Json;
          /** ADR-0027. Defaulted to '' in SQL, so a caller without it still resolves. */
          p_goal?: string;
        };
        Returns: string;
      };
      // Daily retention for clicks (90 days) and the postback log (7 days).
      purge_tracking_data: {
        Args: { p_click_days?: number; p_log_days?: number };
        Returns: number;
      };
      // The ingest beacon's only write. Service role only.
      increment_creative_event: {
        Args: {
          p_creative_id: string;
          p_event_type: Database["public"]["Enums"]["creative_event_type"];
        };
        Returns: undefined;
      };
      // Collapses hourly buckets older than N days into one per day. Called by
      // the daily cron; returns how many day-buckets it merged.
      rollup_creative_events: {
        Args: { p_older_than_days?: number };
        Returns: number;
      };
    };
    Enums: {
      plan_type: "single" | "all_access";
      subscription_status:
        | "active"
        | "trialing"
        | "past_due"
        | "canceled"
        | "incomplete";
      creative_status: "draft" | "active" | "paused" | "archived";
      creative_event_type:
        | "impression"
        | "start"
        | "q25"
        | "q50"
        | "q75"
        | "complete"
        | "interaction"
        | "click"
        | "viewable";
    };
    CompositeTypes: { [_ in never]: never };
  };
  // Private schema: not exposed via the API. Read by the service role only on the
  // VAST serving hot path. See docs/architecture.md + docs/data-model.md.
  private: {
    Tables: { [_ in never]: never };
    Views: {
      creative_serving: {
        Row: {
          creative_id: string;
          user_id: string;
          template_id: string;
          selected_format: string;
          config_json: Json;
          creative_status: Database["public"]["Enums"]["creative_status"];
          template_type: string;
          runtime_keys: Json;
          supported_standards: string[];
          is_entitled: boolean;
          should_serve: boolean;
          /**
           * Config fields whose value is a click destination, routed through
           * `/r` (ADR-0023). Empty for a preview, which is never tracked.
           */
          click_fields: string[];
        };
        Relationships: [];
      };
    };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

// ----------------------------------------------------------------------------
// Convenience aliases
// ----------------------------------------------------------------------------
type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T];

// Row types
export type Profile = Tables<"profiles">;
export type Template = Tables<"templates">;
export type Creative = Tables<"creatives">;
export type Subscription = Tables<"subscriptions">;
export type CreativeEventCounter = Tables<"creative_event_counters">;
export type CreativeClick = Tables<"creative_clicks">;
export type Conversion = Tables<"conversions">;
export type CreativeServing =
  Database["private"]["Views"]["creative_serving"]["Row"];

// Insert types
export type ProfileInsert = TablesInsert<"profiles">;
export type TemplateInsert = TablesInsert<"templates">;
export type CreativeInsert = TablesInsert<"creatives">;
export type SubscriptionInsert = TablesInsert<"subscriptions">;
export type CreativeEventCounterInsert = TablesInsert<"creative_event_counters">;

// Enum unions
export type PlanType = Enums<"plan_type">;
export type SubscriptionStatus = Enums<"subscription_status">;
export type CreativeStatus = Enums<"creative_status">;
export type CreativeEventType = Enums<"creative_event_type">;

// A text column with a CHECK constraint rather than an enum (ADR-0023): this
// file's history with `alter type ... add value` inside one transaction is the
// reason. Normalized from whatever a partner network sends by lib/postback.ts.
export type ConversionStatus = "approved" | "pending" | "rejected";

// Delivery format is open-ended TEXT in the DB (ADR-0002). This union lists the
// standards we currently ship adapters for; widen it as new adapters are added.
export type DeliveryFormat = "simid" | "vpaid";
