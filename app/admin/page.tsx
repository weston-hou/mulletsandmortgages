"use client";

/**
 * app/admin/page.tsx
 * Mullets & Mortgages — Admin Dashboard
 *
 * Protected by ADMIN_PASSWORD env var (cookie-based session).
 * Shows: stats bar, pipeline kanban, leads table, content performance.
 */

import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Lead {
  id: string;
  created_at: string;
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
  prequal_complete?: boolean;
  prequal_zip?: string;
  prequal_employment?: string;
  prequal_income?: string;
  prequal_liabilities?: string;
  prequal_credit_score?: string;
  prequal_full_name?: string;
}

interface ContentClip {
  id: string;
  campaign_slug: string;
  platform: string;
  views?: number;
  clicks?: number;
  leads_generated?: number;
  conversion_rate?: number;
  ai_suggestions?: string;
}

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

const STAGES: LeadStage[] = [
  "new",
  "contacted",
  "pre_qual",
  "shopping",
  "under_contract",
  "underwriting",
  "closing",
  "closed",
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

function daysSince(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  return Math.floor(diff / 86400000);
}

function sourceBadge(source?: string) {
  const map: Record<string, string> = {
    tiktok: "bg-pink-500/20 text-pink-300 border-pink-500/30",
    youtube: "bg-red-500/20 text-red-300 border-red-500/30",
    linkedin: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    twitter: "bg-sky-500/20 text-sky-300 border-sky-500/30",
    instagram: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    direct: "bg-zinc-700/50 text-zinc-400 border-zinc-600/30",
  };
  const key = (source ?? "direct").toLowerCase();
  return map[key] ?? "bg-zinc-700/50 text-zinc-400 border-zinc-600/30";
}

function stageBadge(stage: LeadStage) {
  const map: Record<LeadStage, string> = {
    new: "bg-amber-500/20 text-amber-300",
    contacted: "bg-blue-500/20 text-blue-300",
    pre_qual: "bg-indigo-500/20 text-indigo-300",
    shopping: "bg-teal-500/20 text-teal-300",
    under_contract: "bg-orange-500/20 text-orange-300",
    underwriting: "bg-yellow-500/20 text-yellow-300",
    closing: "bg-green-500/20 text-green-300",
    closed: "bg-emerald-500/20 text-emerald-300",
    dead: "bg-zinc-700/50 text-zinc-500",
  };
  return map[stage] ?? "bg-zinc-700/50 text-zinc-400";
}

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

function setCookie(name: string, value: string, days = 7) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict`;
}

// ─── Login form ───────────────────────────────────────────────────────────────

function LoginForm({ onLogin }: { onLogin: (key: string) => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    // Validate password via dedicated auth endpoint
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (res.ok) {
      setCookie("admin_session", pw);
      onLogin(pw);
    } else {
      setErr("Invalid password");
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-8 card-glow">
        <div className="text-center mb-6">
          <div className="text-3xl mb-2">✂️</div>
          <h1 className="text-xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-zinc-500 text-sm mt-1">Mullets &amp; Mortgages</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            placeholder="Password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400"
          />
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <button
            type="submit"
            className="w-full bg-amber-400 text-black font-bold rounded-xl py-3 hover:bg-amber-300 transition-colors"
          >
            Sign In →
          </button>
        </form>
      </div>
    </main>
  );
}

// ─── Stats card ───────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 card-glow">
      <div className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-1">
        {label}
      </div>
      <div className="text-2xl font-black text-amber-400">{value}</div>
      {sub && <div className="text-zinc-600 text-xs mt-1">{sub}</div>}
    </div>
  );
}

// ─── Kanban card ──────────────────────────────────────────────────────────────

function KanbanCard({ lead }: { lead: Lead }) {
  return (
    <a
      href={`/admin/leads/${lead.id}`}
      className="block bg-zinc-800 border border-zinc-700 rounded-lg p-2 hover:border-amber-400/40 hover:bg-zinc-700/80 transition-all"
    >
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <span className="text-white text-xs font-semibold leading-tight truncate">
          {lead.first_name} {lead.last_name}
        </span>
        <span
          className={`text-[10px] px-1 py-0.5 rounded border flex-shrink-0 ${sourceBadge(
            lead.utm_source
          )}`}
        >
          {lead.utm_source ?? "direct"}
        </span>
      </div>
      <div className="text-zinc-400 text-[11px]">{lead.phone}</div>
      {lead.loan_purpose && (
        <div className="text-zinc-500 text-[11px] mt-0.5 truncate">
          {lead.loan_purpose}
        </div>
      )}
      {lead.estimated_price && (
        <div className="text-zinc-500 text-[11px]">{lead.estimated_price}</div>
      )}
      <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-zinc-700">
        <span className="text-zinc-600 text-[10px]">
          {daysSince(lead.created_at)}d ago
        </span>
        {lead.prequal_complete && (
          <span className="text-[10px] text-green-400">✓ Pre-qual</span>
        )}
      </div>
    </a>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

function Dashboard({ adminKey }: { adminKey: string }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [clips, setClips] = useState<ContentClip[]>([]);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [sortField, setSortField] = useState<string>("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200", sort: sortField, order: sortOrder });
      if (stageFilter) params.set("stage", stageFilter);
      if (sourceFilter) params.set("source", sourceFilter);

      const [leadsRes, clipsRes] = await Promise.all([
        fetch(`/api/leads?${params}`, { headers: { "X-Admin-Key": adminKey } }),
        fetch("/api/content-clips", { headers: { "X-Admin-Key": adminKey } }),
      ]);

      if (leadsRes.ok) {
        const data = await leadsRes.json();
        setLeads(data.leads ?? []);
      }
      if (clipsRes.ok) {
        const data = await clipsRes.json();
        setClips(data.clips ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [adminKey, stageFilter, sourceFilter, sortField, sortOrder]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Stats ──
  const now = Date.now();
  const weekAgo = now - 7 * 86400000;
  const total = leads.length;
  const newThisWeek = leads.filter(
    (l) => new Date(l.created_at).getTime() > weekAgo
  ).length;
  const prequalDone = leads.filter((l) => l.prequal_complete).length;
  const prequalPct =
    total > 0 ? Math.round((prequalDone / total) * 100) + "%" : "0%";

  // Top source
  const sourceCounts: Record<string, number> = {};
  for (const l of leads) {
    const s = l.utm_source ?? "direct";
    sourceCounts[s] = (sourceCounts[s] ?? 0) + 1;
  }
  const topSource =
    Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    "—";

  // ── Kanban grouping ──
  const byStage: Record<LeadStage, Lead[]> = {} as Record<LeadStage, Lead[]>;
  for (const s of STAGES) byStage[s] = [];
  for (const l of leads) {
    if (l.stage in byStage) byStage[l.stage as LeadStage].push(l);
  }

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const SortIcon = ({ field }: { field: string }) =>
    sortField === field ? (
      <span className="ml-1 opacity-70">{sortOrder === "asc" ? "↑" : "↓"}</span>
    ) : (
      <span className="ml-1 opacity-20">↕</span>
    );

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">✂️</span>
          <div>
            <h1 className="text-white font-bold text-lg leading-none">
              Mullets &amp; Mortgages
            </h1>
            <p className="text-zinc-500 text-xs">Admin Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            className="text-zinc-400 hover:text-white text-sm flex items-center gap-1 transition-colors"
          >
            ↻ Refresh
          </button>
          <a
            href="/admin/experiments"
            className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
          >
            🧪 A/B
          </a>
          <a
            href="/"
            className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
          >
            ← Site
          </a>
        </div>
      </header>

      <div className="p-6 space-y-8 max-w-screen-2xl mx-auto">
        {loading && (
          <div className="text-center py-16 text-zinc-500">Loading…</div>
        )}

        {!loading && (
          <>
            {/* ── Stats bar ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Total Leads" value={total} sub="all time" />
              <StatCard label="New This Week" value={newThisWeek} sub="last 7 days" />
              <StatCard
                label="Pre-Qual Complete"
                value={prequalPct}
                sub={`${prequalDone} of ${total}`}
              />
              <StatCard
                label="Top Source"
                value={topSource}
                sub={`${sourceCounts[topSource] ?? 0} leads`}
              />
            </div>

            {/* ── Pipeline Kanban ── */}
            <section>
              <h2 className="text-white font-bold text-lg mb-4">
                Pipeline
                <span className="ml-2 text-zinc-500 font-normal text-sm">
                  {total} leads
                </span>
              </h2>
              <div className="w-full">
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${STAGES.length}, minmax(0, 1fr))` }}>
                  {STAGES.map((stage) => (
                    <div key={stage} className="min-w-0">
                      <div className="flex items-center justify-between mb-2 px-0.5">
                        <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide truncate">
                          {STAGE_LABELS[stage]}
                        </span>
                        <span className="text-[10px] bg-zinc-800 text-zinc-500 rounded-full px-1.5 py-0.5 flex-shrink-0 ml-1">
                          {byStage[stage].length}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {byStage[stage].length === 0 && (
                          <div className="text-zinc-700 text-xs text-center py-4 border border-dashed border-zinc-800 rounded-xl">
                            Empty
                          </div>
                        )}
                        {byStage[stage].map((lead) => (
                          <KanbanCard key={lead.id} lead={lead} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* ── Leads table ── */}
            <section>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="text-white font-bold text-lg">All Leads</h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={stageFilter}
                    onChange={(e) => setStageFilter(e.target.value)}
                    className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-300 text-sm focus:outline-none focus:border-amber-400"
                  >
                    <option value="">All stages</option>
                    {STAGES.map((s) => (
                      <option key={s} value={s}>
                        {STAGE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <select
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value)}
                    className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-300 text-sm focus:outline-none focus:border-amber-400"
                  >
                    <option value="">All sources</option>
                    <option value="tiktok">TikTok</option>
                    <option value="youtube">YouTube</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="twitter">Twitter/X</option>
                    <option value="instagram">Instagram</option>
                    <option value="direct">Direct</option>
                  </select>
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-zinc-800">
                      <tr className="text-zinc-500 text-xs uppercase tracking-wide">
                        <th
                          className="text-left px-4 py-3 font-medium cursor-pointer hover:text-zinc-300"
                          onClick={() => handleSort("first_name")}
                        >
                          Name <SortIcon field="first_name" />
                        </th>
                        <th className="text-left px-4 py-3 font-medium">Phone</th>
                        <th className="text-left px-4 py-3 font-medium">Loan Purpose</th>
                        <th className="text-left px-4 py-3 font-medium">Price</th>
                        <th className="text-left px-4 py-3 font-medium">Credit</th>
                        <th className="text-left px-4 py-3 font-medium">State</th>
                        <th className="text-left px-4 py-3 font-medium">Stage</th>
                        <th className="text-left px-4 py-3 font-medium">Source</th>
                        <th
                          className="text-left px-4 py-3 font-medium cursor-pointer hover:text-zinc-300"
                          onClick={() => handleSort("created_at")}
                        >
                          Created <SortIcon field="created_at" />
                        </th>
                        <th className="text-left px-4 py-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {leads.length === 0 && (
                        <tr>
                          <td
                            colSpan={10}
                            className="text-center py-12 text-zinc-600"
                          >
                            No leads yet — they&apos;ll appear here after the first
                            form submission.
                          </td>
                        </tr>
                      )}
                      {leads.map((lead) => (
                        <tr
                          key={lead.id}
                          className="hover:bg-zinc-800/30 transition-colors"
                        >
                          <td className="px-4 py-3 font-medium text-white whitespace-nowrap">
                            {lead.first_name} {lead.last_name}
                          </td>
                          <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">
                            {lead.phone}
                          </td>
                          <td className="px-4 py-3 text-zinc-400 max-w-[140px] truncate">
                            {lead.loan_purpose ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">
                            {lead.estimated_price ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">
                            {lead.credit_score ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-zinc-400">
                            {lead.state ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-1 rounded-lg text-xs font-medium ${stageBadge(
                                lead.stage
                              )}`}
                            >
                              {STAGE_LABELS[lead.stage]}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded border text-xs ${sourceBadge(
                                lead.utm_source
                              )}`}
                            >
                              {lead.utm_source ?? "direct"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-zinc-500 whitespace-nowrap text-xs">
                            {new Date(lead.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() =>
                                  fetch("/api/agent/sms", {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                      "X-Admin-Key": adminKey,
                                    },
                                    body: JSON.stringify({
                                      lead_id: lead.id,
                                    }),
                                  })
                                }
                                className="text-xs px-2 py-1 rounded-lg bg-amber-400/10 text-amber-400 hover:bg-amber-400/20 transition-colors whitespace-nowrap"
                              >
                                💬 Text
                              </button>
                              <button className="text-xs px-2 py-1 rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors whitespace-nowrap cursor-not-allowed opacity-60">
                                📞 Call
                              </button>
                              <a
                                href={`/admin/leads/${lead.id}`}
                                className="text-xs px-2 py-1 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors whitespace-nowrap"
                              >
                                View →
                              </a>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* ── Content performance ── */}
            <section>
              <h2 className="text-white font-bold text-lg mb-4">
                Content Performance
              </h2>
              {clips.length === 0 ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
                  <div className="text-4xl mb-3">🎬</div>
                  <p className="text-zinc-500">
                    No data yet — clips will appear here after content is posted.
                  </p>
                </div>
              ) : (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-zinc-800">
                        <tr className="text-zinc-500 text-xs uppercase tracking-wide">
                          <th className="text-left px-4 py-3 font-medium">Campaign</th>
                          <th className="text-left px-4 py-3 font-medium">Platform</th>
                          <th className="text-right px-4 py-3 font-medium">Views</th>
                          <th className="text-right px-4 py-3 font-medium">Clicks</th>
                          <th className="text-right px-4 py-3 font-medium">Leads</th>
                          <th className="text-right px-4 py-3 font-medium">CVR</th>
                          <th className="text-left px-4 py-3 font-medium">AI Suggestions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/50">
                        {clips.map((clip) => (
                          <tr key={clip.id} className="hover:bg-zinc-800/30 transition-colors">
                            <td className="px-4 py-3 font-medium text-white font-mono text-xs">
                              {clip.campaign_slug}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded border text-xs ${sourceBadge(clip.platform)}`}>
                                {clip.platform}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-zinc-400">
                              {(clip.views ?? 0).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right text-zinc-400">
                              {(clip.clicks ?? 0).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right text-amber-400 font-medium">
                              {clip.leads_generated ?? 0}
                            </td>
                            <td className="px-4 py-3 text-right text-zinc-400">
                              {clip.conversion_rate
                                ? `${(clip.conversion_rate * 100).toFixed(1)}%`
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-zinc-500 text-xs max-w-xs truncate">
                              {clip.ai_suggestions ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>

            {/* ── Video upload (feeds the Vizard content pipeline) ── */}
            <div className="mt-10">
              <VideoUploadSection adminKey={adminKey} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Video upload section ─────────────────────────────────────────────────────

function VideoUploadSection({ adminKey }: { adminKey: string }) {
  const [slug, setSlug] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ folder_url: string; files: { name: string; url: string }[] } | null>(null);
  const [error, setError] = useState("");

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []).slice(0, 3);
    setFiles(selected);
    setResult(null);
    setError("");
  };

  const handleUpload = async () => {
    if (!files.length || !slug.trim()) return;
    setUploading(true);
    setError("");
    setResult(null);
    try {
      const fd = new FormData();
      files.forEach(f => fd.append("files[]", f));
      fd.append("campaign_slug", slug.trim());
      fd.append("notes", notes.trim());
      const res = await fetch("/api/content/upload", {
        method: "POST",
        headers: { "X-Admin-Key": adminKey },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setResult(data);
      setFiles([]);
      setSlug("");
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <section>
      <h2 className="text-white font-bold text-lg mb-4">Upload Video</h2>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-2xl">
        <p className="text-zinc-500 text-sm mb-5">
          Upload your edited video. It goes straight to the Vizard intake folder in Google Drive, which kicks off clipping and auto-posting. Each file becomes its own clipping run (up to 3).
        </p>

        {/* Slug */}
        <div className="mb-4">
          <label className="block text-xs text-zinc-400 mb-1.5 font-medium">Campaign slug <span className="text-zinc-600">(e.g. ep-12-first-time-buyers)</span></label>
          <input
            type="text"
            value={slug}
            onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
            placeholder="ep-12-first-time-buyers"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400 font-mono"
          />
        </div>

        {/* File picker */}
        <div className="mb-4">
          <label className="block text-xs text-zinc-400 mb-1.5 font-medium">Video files <span className="text-zinc-600">(edited video — up to 3)</span></label>
          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-zinc-700 rounded-xl cursor-pointer hover:border-amber-400/40 transition-colors bg-zinc-800/50">
            <input type="file" multiple accept="video/*" onChange={handleFiles} className="hidden" />
            {files.length === 0 ? (
              <>
                <span className="text-2xl mb-1">🎬</span>
                <span className="text-zinc-400 text-sm">Click to select video files</span>
                <span className="text-zinc-600 text-xs mt-1">MP4, MOV, up to 3 files</span>
              </>
            ) : (
              <div className="text-center px-4">
                {files.map((f, i) => (
                  <div key={i} className="text-sm text-white">
                    📹 Video {i + 1}: <span className="text-zinc-400">{f.name}</span>
                    <span className="text-zinc-600 ml-2">({(f.size / 1024 / 1024).toFixed(1)} MB)</span>
                  </div>
                ))}
              </div>
            )}
          </label>
        </div>

        {/* Notes */}
        <div className="mb-5">
          <label className="block text-xs text-zinc-400 mb-1.5 font-medium">Notes <span className="text-zinc-600">(optional — topic, guest, anything relevant)</span></label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Covered first-time buyer programs, VA loans, down payment assistance..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400 resize-none placeholder-zinc-600"
          />
        </div>

        {/* Error */}
        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        {/* Success */}
        {result && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 mb-4">
            <p className="text-green-400 text-sm font-semibold mb-2">✓ Uploaded successfully</p>
            <div className="space-y-1">
              {result.files.map(f => (
                <a key={f.name} href={f.url} target="_blank" rel="noopener noreferrer"
                  className="block text-xs text-amber-400 hover:underline">
                  📄 {f.name} →
                </a>
              ))}
              <a href={result.folder_url} target="_blank" rel="noopener noreferrer"
                className="block text-xs text-zinc-400 hover:text-white mt-1">
                📂 Open Drive folder →
              </a>
            </div>
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={uploading || !files.length || !slug.trim()}
          className="w-full py-3 rounded-xl bg-amber-400 text-black font-bold text-sm hover:bg-amber-300 transition-colors disabled:opacity-40"
        >
          {uploading ? "Uploading to Drive…" : "Upload to Drive →"}
        </button>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const saved = getCookie("admin_session");
    if (saved) setAdminKey(saved);
    setChecked(true);
  }, []);

  if (!checked) return null;

  if (!adminKey) {
    return <LoginForm onLogin={setAdminKey} />;
  }

  return <Dashboard adminKey={adminKey} />;
}
