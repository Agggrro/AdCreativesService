// ============================================================================
// AdInteract — database types
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
      creative_events: {
        Row: {
          id: number;
          creative_id: string;
          event_type: Database["public"]["Enums"]["creative_event_type"];
          meta: Json;
          occurred_at: string;
        };
        Insert: {
          id?: never;
          creative_id: string;
          event_type: Database["public"]["Enums"]["creative_event_type"];
          meta?: Json;
          occurred_at?: string;
        };
        Update: {
          id?: never;
          creative_id?: string;
          event_type?: Database["public"]["Enums"]["creative_event_type"];
          meta?: Json;
          occurred_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "creative_events_creative_id_fkey";
            columns: ["creative_id"];
            referencedRelation: "creatives";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      get_creative_serving: {
        Args: { p_creative_id: string };
        Returns: Database["private"]["Views"]["creative_serving"]["Row"][];
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
        | "click";
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
export type CreativeEvent = Tables<"creative_events">;
export type CreativeServing =
  Database["private"]["Views"]["creative_serving"]["Row"];

// Insert types
export type ProfileInsert = TablesInsert<"profiles">;
export type TemplateInsert = TablesInsert<"templates">;
export type CreativeInsert = TablesInsert<"creatives">;
export type SubscriptionInsert = TablesInsert<"subscriptions">;
export type CreativeEventInsert = TablesInsert<"creative_events">;

// Enum unions
export type PlanType = Enums<"plan_type">;
export type SubscriptionStatus = Enums<"subscription_status">;
export type CreativeStatus = Enums<"creative_status">;
export type CreativeEventType = Enums<"creative_event_type">;

// Delivery format is open-ended TEXT in the DB (ADR-0002). This union lists the
// standards we currently ship adapters for; widen it as new adapters are added.
export type DeliveryFormat = "simid" | "vpaid";
