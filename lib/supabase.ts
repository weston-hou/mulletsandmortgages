/**
 * lib/supabase.ts
 * Server-side Supabase REST client using fetch() directly.
 * No @supabase/supabase-js dependency required.
 *
 * Uses NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type LeadStage =
  | "new"
  | "contacted"
  | "pre_qual"
  | "shopping"
  | "under_contract"
  | "underwriting"
  | "closing"
  | "closed"
  | "dead";

export interface Lead {
  id: string;
  created_at: string;
  updated_at: string;
  // Contact
  first_name: string;
  last_name: string;
  email?: string;
  phone: string | null;
  // Loan scenario
  loan_purpose?: string;
  estimated_price?: string;
  credit_score?: string;
  state?: string;
  zip?: string;
  property_type?: string;
  down_payment?: string;
  // Pre-qual
  prequal_zip?: string;
  prequal_employment?: string;
  prequal_income?: string;
  prequal_liabilities?: string;
  prequal_credit_score?: string;
  prequal_full_name?: string;
  prequal_complete?: boolean;
  prequal_letter_url?: string;
  prequal_completed_at?: string;
  // Pipeline
  stage: LeadStage;
  // Attribution
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  clicked_at?: number;
  landed_at?: number;
  referrer?: string;
  posthog_id?: string;
  // Agent tracking
  last_contacted_at?: string;
  last_contact_channel?: string;
  contact_count?: number;
  next_followup_at?: string;
  agent_notes?: string;
  // Zach
  zach_notes?: string;
  assigned_to?: string;
  preferred_contact?: "email" | "sms" | "voice";
  // A/B experiment
  experiment_id?: string;
  variant?: string;
  sms_opted_out?: boolean;
  sms_opted_out_at?: string;
  // Document signatures
  consent_to_contact_signed_at?: string;
  consent_to_contact_sign_ip?: string;
  loan_disclosure_signed_at?: string;
  loan_disclosure_sign_ip?: string;
}

export interface Conversation {
  id: string;
  created_at: string;
  lead_id: string;
  channel: "sms" | "voice" | "email" | "system";
  direction: "inbound" | "outbound";
  body: string;
  ai_generated?: boolean;
  metadata?: Record<string, unknown>;
}

export interface Experiment {
  id: string;
  created_at: string;
  name: string;
  active: boolean;
  variant_a: {
    channel_order: string[];
    script_id: string;
    timing_min: number;
    timing_max: number;
  };
  variant_b: {
    channel_order: string[];
    script_id: string;
    timing_min: number;
    timing_max: number;
  };
  traffic_split: number;
}

export interface FollowupSchedule {
  id: string;
  created_at: string;
  lead_id: string;
  scheduled_at: string;
  channel: "sms" | "voice";
  stage: string;
  message_hint?: string;
  sent: boolean;
  sent_at?: string;
  cancelled: boolean;
  // A/B experiment fields
  script_id?: string;
  experiment_id?: string;
  variant?: string;
}

export interface ContentClip {
  id: string;
  created_at: string;
  campaign_slug: string;
  platform: string;
  format?: string;
  posted_at?: string;
  vizard_clip_id?: string;
  views?: number;
  clicks?: number;
  leads_generated?: number;
  conversion_rate?: number;
  transcript?: string;
  ai_topics?: string[];
  ai_tone?: string;
  ai_hook?: string;
  ai_suggestions?: string;
  avg_loan_range?: string;
  top_states?: string[];
  top_purposes?: string[];
  // Creatomate render URLs (populated via webhook)
  render_tiktok_url?: string;
  render_instagram_url?: string;
  render_youtube_url?: string;
  render_linkedin_url?: string;
}

// ─── Client ──────────────────────────────────────────────────────────────────

export function getConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing Supabase config: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return { url: url.replace(/\/$/, ""), key };
}

function headers(key: string) {
  return {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${key}`,
    Prefer: "return=representation",
  };
}

// Generic REST helpers

async function sbGet<T>(
  table: string,
  params: Record<string, string> = {}
): Promise<T[]> {
  const { url, key } = getConfig();
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(
    `${url}/rest/v1/${table}${qs ? `?${qs}` : ""}`,
    { headers: headers(key), cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Supabase GET ${table}: ${await res.text()}`);
  return res.json();
}

async function sbPost<T>(table: string, body: Partial<T>): Promise<T> {
  const { url, key } = getConfig();
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase POST ${table}: ${await res.text()}`);
  const rows: T[] = await res.json();
  return rows[0];
}

async function sbPatch<T>(
  table: string,
  id: string,
  body: Partial<T>
): Promise<T> {
  const { url, key } = getConfig();
  const res = await fetch(
    `${url}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: headers(key),
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) throw new Error(`Supabase PATCH ${table}: ${await res.text()}`);
  const rows: T[] = await res.json();
  return rows[0];
}

// ─── Typed exports ────────────────────────────────────────────────────────────

export const db = {
  leads: {
    insert: (data: Omit<Lead, "id" | "created_at" | "updated_at">) =>
      sbPost<Lead>("leads", data),

    getById: async (id: string): Promise<Lead | null> => {
      const rows = await sbGet<Lead>("leads", {
        id: `eq.${id}`,
        select: "*",
        limit: "1",
      });
      return rows[0] ?? null;
    },

    list: (params: Record<string, string> = {}) =>
      sbGet<Lead>("leads", { select: "*", ...params }),

    update: (id: string, data: Partial<Lead>) =>
      sbPatch<Lead>("leads", id, data),
  },

  conversations: {
    forLead: (leadId: string) =>
      sbGet<Conversation>("conversations", {
        lead_id: `eq.${leadId}`,
        select: "*",
        order: "created_at.asc",
      }),

    insert: (data: Omit<Conversation, "id" | "created_at">) =>
      sbPost<Conversation>("conversations", data),
  },

  contentClips: {
    list: () => sbGet<ContentClip>("content_clips", { select: "*", order: "created_at.desc" }),
    insert: (data: Omit<ContentClip, "id" | "created_at">) =>
      sbPost<ContentClip>("content_clips", data),
    update: (id: string, patch: Partial<ContentClip>) =>
      sbPatch<ContentClip>("content_clips", id, patch),
  },

  experiments: {
    getActive: async (): Promise<Experiment | null> => {
      const rows = await sbGet<Experiment>("experiments", {
        active: "eq.true",
        select: "*",
        order: "created_at.asc",
        limit: "1",
      });
      return rows[0] ?? null;
    },
    list: () => sbGet<Experiment>("experiments", { select: "*", order: "created_at.desc" }),
    insert: (data: Omit<Experiment, "id" | "created_at">) => sbPost<Experiment>("experiments", data),
    update: (id: string, patch: Partial<Experiment>) => sbPatch<Experiment>("experiments", id, patch),
  },

  followupSchedule: {
    insert: (data: Omit<FollowupSchedule, "id" | "created_at">) =>
      sbPost<FollowupSchedule>("followup_schedule", data),

    markSent: (id: string) =>
      sbPatch<FollowupSchedule>("followup_schedule", id, {
        sent: true,
        sent_at: new Date().toISOString(),
      }),

    getDue: async (): Promise<FollowupSchedule[]> => {
      return sbGet<FollowupSchedule>("followup_schedule", {
        select: "*",
        scheduled_at: `lte.${new Date().toISOString()}`,
        sent: "eq.false",
        cancelled: "eq.false",
        order: "scheduled_at.asc",
        limit: "50",
      });
    },
  },
};
