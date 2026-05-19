"use client";

/**
 * app/admin/leads/[id]/page.tsx
 * Lead detail page with:
 * - Full lead info + editable fields
 * - Conversation timeline (iMessage style)
 * - Pre-qual checklist
 * - Quick SMS compose
 */

import { useState, useEffect, useCallback, use } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type LeadStage =
  | "new"
  | "contacted"
  | "pre_qual"
  | "shopping"
  | "under_contract"
  | "underwriting"
  | "closing"
  | "closed"
  | "dead";

interface Lead {
  id: string;
  created_at: string;
  updated_at: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone: string;
  loan_purpose?: string;
  estimated_price?: string;
  credit_score?: string;
  state?: string;
  zip?: string;
  property_type?: string;
  down_payment?: string;
  stage: LeadStage;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  prequal_complete?: boolean;
  prequal_zip?: string;
  prequal_employment?: string;
  prequal_income?: string;
  prequal_liabilities?: string;
  prequal_credit_score?: string;
  prequal_full_name?: string;
  prequal_letter_url?: string;
  prequal_completed_at?: string;
  zach_notes?: string;
  agent_notes?: string;
  contact_count?: number;
  last_contacted_at?: string;
  last_contact_channel?: string;
  consent_to_contact_signed_at?: string;
  loan_disclosure_signed_at?: string;
}

interface Conversation {
  id: string;
  created_at: string;
  lead_id: string;
  channel: "sms" | "voice" | "email";
  direction: "inbound" | "outbound";
  body: string;
  ai_generated?: boolean;
}

const STAGES: LeadStage[] = [
  "new",
  "contacted",
  "pre_qual",
  "shopping",
  "under_contract",
  "underwriting",
  "closing",
  "closed",
  "dead",
];

const STAGE_LABELS: Record<LeadStage, string> = {
  new: "New",
  contacted: "Contacted",
  pre_qual: "Pre-Qual",
  shopping: "Shopping",
  under_contract: "Under Contract",
  underwriting: "Underwriting",
  closing: "Closing",
  closed: "Closed ✓",
  dead: "Dead",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ─── Pre-qual checklist ───────────────────────────────────────────────────────

function PrequalChecklist({ lead }: { lead: Lead }) {
  const checks = [
    { label: "Zip / Subject property", value: lead.prequal_zip },
    { label: "Employment history", value: lead.prequal_employment },
    { label: "Annual income", value: lead.prequal_income },
    { label: "Liabilities / debts", value: lead.prequal_liabilities },
    { label: "Confirmed credit score", value: lead.prequal_credit_score },
    { label: "Legal full name", value: lead.prequal_full_name },
  ];
  const complete = checks.filter((c) => c.value).length;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold">Pre-Qual Checklist</h3>
        <span className="text-xs text-zinc-500">
          {complete}/{checks.length} complete
        </span>
      </div>
      <div className="space-y-2">
        {checks.map(({ label, value }) => (
          <div key={label} className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-xs ${
                value
                  ? "bg-green-500/20 text-green-400"
                  : "bg-zinc-800 text-zinc-600"
              }`}
            >
              {value ? "✓" : "○"}
            </span>
            <div className="min-w-0">
              <div className="text-xs text-zinc-500">{label}</div>
              {value && (
                <div className="text-sm text-white truncate">{value}</div>
              )}
            </div>
          </div>
        ))}
      </div>
      {lead.prequal_complete && lead.prequal_completed_at && (
        <div className="mt-4 pt-4 border-t border-zinc-800 text-xs text-green-400">
          ✓ Pre-qual completed {new Date(lead.prequal_completed_at).toLocaleDateString()}
        </div>
      )}
      {lead.prequal_letter_url && (
        <a
          href={lead.prequal_letter_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block text-xs text-amber-400 hover:underline"
        >
          📄 View pre-qual letter →
        </a>
      )}
    </div>
  );
}

// ─── Conversation bubble ──────────────────────────────────────────────────────

function ConversationBubble({ msg }: { msg: Conversation }) {
  const isOutbound = msg.direction === "outbound";
  return (
    <div className={`flex ${isOutbound ? "justify-end" : "justify-start"} mb-3`}>
      <div className={`max-w-[75%] ${isOutbound ? "items-end" : "items-start"} flex flex-col`}>
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
            isOutbound
              ? "bg-amber-400 text-black rounded-br-md"
              : "bg-zinc-800 text-white rounded-bl-md"
          }`}
        >
          {msg.body}
        </div>
        <div className="flex items-center gap-1 mt-1 text-xs text-zinc-600">
          <span>{formatTime(msg.created_at)}</span>
          <span>·</span>
          <span className="capitalize">{msg.channel}</span>
          {msg.ai_generated && (
            <>
              <span>·</span>
              <span className="text-zinc-600">AI</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [lead, setLead] = useState<Lead | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [smsBody, setSmsBody] = useState("");
  const [sending, setSending] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [sendingDoc, setSendingDoc] = useState<string | null>(null);
  const [docSent, setDocSent] = useState<string | null>(null);

  // Editable fields
  const [stage, setStage] = useState<LeadStage>("new");
  const [zachNotes, setZachNotes] = useState("");

  useEffect(() => {
    const key = getCookie("admin_session") ?? "";
    setAdminKey(key);
  }, []);

  const fetchLead = useCallback(async () => {
    if (!adminKey) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${id}`, {
        headers: { "X-Admin-Key": adminKey },
      });
      if (!res.ok) return;
      const data = await res.json();
      setLead(data.lead);
      setConversations(data.conversations ?? []);
      setStage(data.lead.stage);
      setZachNotes(data.lead.zach_notes ?? "");
    } finally {
      setLoading(false);
    }
  }, [id, adminKey]);

  useEffect(() => {
    if (adminKey) fetchLead();
  }, [adminKey, fetchLead]);

  const handleSendDoc = async (docType: string) => {
    if (!lead?.email) return;
    setSendingDoc(docType);
    try {
      const res = await fetch("/api/documents/request", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
        body: JSON.stringify({ lead_id: id, type: docType }),
      });
      if (res.ok) {
        setDocSent(docType);
        setTimeout(() => setDocSent(null), 4000);
        fetchLead();
      }
    } finally {
      setSendingDoc(null);
    }
  };

  const handleSave = async () => {
    if (!lead) return;
    setSaving(true);
    try {
      await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Key": adminKey,
        },
        body: JSON.stringify({ stage, zach_notes: zachNotes }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleSendSms = async () => {
    if (!smsBody.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/agent/sms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Key": adminKey,
        },
        body: JSON.stringify({ action: "manual_send", lead_id: id, message: smsBody }),
      });
      if (res.ok) {
        setSmsBody("");
        fetchLead();
      }
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">
        Loading…
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">
        Lead not found.{" "}
        <a href="/admin" className="text-amber-400 ml-2">
          ← Back
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a
            href="/admin"
            className="text-zinc-400 hover:text-white text-sm transition-colors"
          >
            ← Dashboard
          </a>
          <span className="text-zinc-700">/</span>
          <span className="text-white font-semibold">
            {lead.first_name} {lead.last_name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs px-2.5 py-1 rounded-lg font-medium ${
              lead.stage === "closed"
                ? "bg-emerald-500/20 text-emerald-300"
                : lead.stage === "new"
                ? "bg-amber-500/20 text-amber-300"
                : "bg-zinc-700 text-zinc-300"
            }`}
          >
            {STAGE_LABELS[lead.stage]}
          </span>
        </div>
      </header>

      <div className="p-6 max-w-screen-xl mx-auto">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* ── Left column: lead info + edit ── */}
          <div className="xl:col-span-1 space-y-5">
            {/* Contact info */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-4">Contact</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-zinc-500 block text-xs">Name</span>
                  <span className="text-white">
                    {lead.first_name} {lead.last_name}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-xs">Phone</span>
                  <a
                    href={`tel:${lead.phone}`}
                    className="text-amber-400 hover:underline"
                  >
                    {lead.phone}
                  </a>
                </div>
                {lead.email && (
                  <div>
                    <span className="text-zinc-500 block text-xs">Email</span>
                    <a
                      href={`mailto:${lead.email}`}
                      className="text-amber-400 hover:underline"
                    >
                      {lead.email}
                    </a>
                  </div>
                )}
                <div>
                  <span className="text-zinc-500 block text-xs">Created</span>
                  <span className="text-zinc-300">
                    {new Date(lead.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-xs">Source</span>
                  <span className="text-zinc-300">
                    {lead.utm_source ?? "direct"}
                    {lead.utm_campaign && (
                      <span className="text-zinc-600 ml-1">
                        · {lead.utm_campaign}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Loan scenario */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-4">Loan Scenario</h3>
              <div className="space-y-2 text-sm">
                {[
                  ["Purpose", lead.loan_purpose],
                  ["Price", lead.estimated_price],
                  ["Down payment", lead.down_payment],
                  ["Property type", lead.property_type],
                  ["Credit score", lead.credit_score],
                  ["State", lead.state],
                  ["Zip", lead.zip],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between gap-2">
                    <span className="text-zinc-500 text-xs">{label}</span>
                    <span className="text-zinc-300 text-right text-xs font-medium">
                      {val ?? "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Editable fields */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
              <h3 className="text-white font-semibold">Edit Lead</h3>

              <div>
                <label className="text-zinc-500 text-xs block mb-1.5">
                  Stage
                </label>
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value as LeadStage)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400"
                >
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {STAGE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-zinc-500 text-xs block mb-1.5">
                  Zach&apos;s Notes
                </label>
                <textarea
                  value={zachNotes}
                  onChange={(e) => setZachNotes(e.target.value)}
                  rows={4}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400 resize-none placeholder-zinc-600"
                  placeholder="Private notes visible only in dashboard…"
                />
              </div>

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-2.5 rounded-xl bg-amber-400 text-black font-bold text-sm hover:bg-amber-300 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving…" : saved ? "✓ Saved!" : "Save Changes"}
              </button>
            </div>

            {/* Pre-qual checklist */}
            <PrequalChecklist lead={lead} />

            {/* Documents */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-1">Documents</h3>
              {!lead.email && (
                <p className="text-zinc-600 text-xs mb-3">Add an email address to send documents.</p>
              )}
              <div className="space-y-2 mt-3">
                {([
                  { type: "consent_to_contact", label: "Consent to Contact", signedKey: "consent_to_contact_signed_at" },
                  { type: "loan_disclosure",    label: "Loan Disclosure",    signedKey: "loan_disclosure_signed_at" },
                ] as { type: string; label: string; signedKey: keyof typeof lead }[]).map(({ type, label, signedKey }) => {
                  const signedAt = lead[signedKey] as string | undefined;
                  return (
                    <div key={type} className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm text-white">{label}</div>
                        {signedAt ? (
                          <div className="text-xs text-green-400 mt-0.5">✓ Signed {new Date(signedAt).toLocaleDateString()}</div>
                        ) : (
                          <div className="text-xs text-zinc-600 mt-0.5">Not yet signed</div>
                        )}
                      </div>
                      <button
                        onClick={() => handleSendDoc(type)}
                        disabled={!lead.email || sendingDoc === type}
                        className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:border-amber-400/40 hover:text-white transition-all disabled:opacity-40 flex-shrink-0"
                      >
                        {sendingDoc === type ? "Sending…" : docSent === type ? "✓ Sent!" : signedAt ? "Resend" : "Send"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Right column: conversation + SMS ── */}
          <div className="xl:col-span-2 space-y-5">
            {/* Agent notes */}
            {lead.agent_notes && (
              <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4">
                <h3 className="text-zinc-400 text-xs font-semibold uppercase tracking-wide mb-2">
                  AI Agent Summary
                </h3>
                <p className="text-zinc-300 text-sm leading-relaxed">
                  {lead.agent_notes}
                </p>
              </div>
            )}

            {/* Conversation timeline */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="text-white font-semibold">
                  Conversation
                  <span className="ml-2 text-zinc-600 font-normal text-sm">
                    {conversations.length} messages
                  </span>
                </h3>
                {lead.contact_count != null && lead.contact_count > 0 && (
                  <span className="text-xs text-zinc-500">
                    {lead.contact_count} contacts ·{" "}
                    {lead.last_contact_channel ?? ""}
                    {lead.last_contacted_at &&
                      ` · last ${new Date(lead.last_contacted_at).toLocaleDateString()}`}
                  </span>
                )}
              </div>

              {/* Messages */}
              <div className="p-5 min-h-[300px] max-h-[500px] overflow-y-auto space-y-1">
                {conversations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
                    <span className="text-3xl mb-2">💬</span>
                    <p className="text-sm">No messages yet.</p>
                  </div>
                ) : (
                  conversations.map((msg) => (
                    <ConversationBubble key={msg.id} msg={msg} />
                  ))
                )}
              </div>

              {/* Quick SMS compose */}
              <div className="border-t border-zinc-800 p-4">
                <div className="text-xs text-zinc-500 mb-2 font-medium uppercase tracking-wide">
                  Send SMS
                </div>
                <div className="flex gap-3">
                  <textarea
                    value={smsBody}
                    onChange={(e) => setSmsBody(e.target.value)}
                    rows={2}
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400 resize-none placeholder-zinc-600"
                    placeholder={`Message ${lead.first_name}…`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        handleSendSms();
                      }
                    }}
                  />
                  <button
                    onClick={handleSendSms}
                    disabled={sending || !smsBody.trim()}
                    className="px-4 rounded-xl bg-amber-400 text-black font-bold text-sm hover:bg-amber-300 transition-colors disabled:opacity-40 self-end py-2.5"
                  >
                    {sending ? "…" : "Send"}
                  </button>
                </div>
                <p className="text-xs text-zinc-700 mt-1">⌘+Enter to send</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
