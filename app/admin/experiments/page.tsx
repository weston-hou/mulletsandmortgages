"use client";

/**
 * app/admin/experiments/page.tsx
 * A/B Experiment Dashboard — /admin/experiments
 *
 * Shows all experiments with live results:
 *   - Variant A vs B lead counts
 *   - Pre-qual conversion rates
 *   - Statistical significance indicator
 *   - Controls to activate/pause/create experiments
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VariantConfig {
  channel_order: string[];
  script_id:     string;
  timing_min:    number;
  timing_max:    number;
}

interface VariantResults {
  total:        number;
  prequal:      number;
  prequal_rate: number;
  closed:       number;
  dead:         number;
}

interface Experiment {
  id:            string;
  created_at:    string;
  name:          string;
  active:        boolean;
  traffic_split: number;
  variant_a:     VariantConfig;
  variant_b:     VariantConfig;
  results?: {
    a: VariantResults | null;
    b: VariantResults | null;
  };
}

// ─── Stats helpers ────────────────────────────────────────────────────────────

/**
 * Two-proportion z-test for statistical significance.
 * Returns p-value (approx). p < 0.05 = significant.
 */
function zTest(na: number, xa: number, nb: number, xb: number): number | null {
  if (na < 5 || nb < 5) return null;
  const pa  = xa / na;
  const pb  = xb / nb;
  const p   = (xa + xb) / (na + nb);
  const se  = Math.sqrt(p * (1 - p) * (1 / na + 1 / nb));
  if (se === 0) return null;
  const z   = Math.abs((pa - pb) / se);
  // Approximate p-value from z-score
  const p_val = 2 * (1 - normalCDF(z));
  return p_val;
}

function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

function significanceBadge(p: number | null): { label: string; color: string } {
  if (p === null)  return { label: "Need more data", color: "text-zinc-500" };
  if (p < 0.01)    return { label: "Highly significant ✦✦✦", color: "text-green-400" };
  if (p < 0.05)    return { label: "Significant ✦✦", color: "text-green-300" };
  if (p < 0.10)    return { label: "Trending ✦", color: "text-amber-400" };
  return           { label: "Not significant", color: "text-zinc-500" };
}

// ─── Components ───────────────────────────────────────────────────────────────

function StatBar({ label, a, b, aTotal, bTotal }: {
  label: string; a: number; b: number; aTotal: number; bTotal: number;
}) {
  const aRate = aTotal > 0 ? (a / aTotal) * 100 : 0;
  const bRate = bTotal > 0 ? (b / bTotal) * 100 : 0;
  const winner = aRate > bRate ? "a" : bRate > aRate ? "b" : null;

  return (
    <div className="space-y-2">
      <div className="text-xs text-zinc-500 font-medium uppercase tracking-wider">{label}</div>
      {/* Variant A */}
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className={`font-medium ${winner === "a" ? "text-green-400" : "text-zinc-300"}`}>
            Variant A {winner === "a" && "↑"}
          </span>
          <span className={winner === "a" ? "text-green-400" : "text-zinc-400"}>
            {a} / {aTotal} ({aRate.toFixed(1)}%)
          </span>
        </div>
        <div className="w-full bg-zinc-800 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-700 ${winner === "a" ? "bg-green-400" : "bg-zinc-500"}`}
            style={{ width: `${Math.min(aRate, 100)}%` }}
          />
        </div>
      </div>
      {/* Variant B */}
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className={`font-medium ${winner === "b" ? "text-green-400" : "text-zinc-300"}`}>
            Variant B {winner === "b" && "↑"}
          </span>
          <span className={winner === "b" ? "text-green-400" : "text-zinc-400"}>
            {b} / {bTotal} ({bRate.toFixed(1)}%)
          </span>
        </div>
        <div className="w-full bg-zinc-800 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-700 ${winner === "b" ? "bg-amber-400" : "bg-zinc-600"}`}
            style={{ width: `${Math.min(bRate, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function ExperimentCard({
  exp, adminKey, onToggle,
}: {
  exp: Experiment; adminKey: string; onToggle: (id: string, active: boolean) => void;
}) {
  const a = exp.results?.a;
  const b = exp.results?.b;
  const p = (a && b) ? zTest(a.total, a.prequal, b.total, b.prequal) : null;
  const sig = significanceBadge(p);
  const totalLeads = (a?.total ?? 0) + (b?.total ?? 0);

  return (
    <div className={`bg-zinc-900 border rounded-2xl p-6 ${exp.active ? "border-amber-400/30" : "border-zinc-800"}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full ${exp.active ? "bg-green-400" : "bg-zinc-600"}`} />
            <h3 className="text-white font-bold">{exp.name.replace(/_/g, " ")}</h3>
          </div>
          <div className="text-xs text-zinc-500">
            {totalLeads} leads enrolled · {Math.round(exp.traffic_split * 100)}% / {Math.round((1 - exp.traffic_split) * 100)}% split
          </div>
        </div>
        <button
          onClick={() => onToggle(exp.id, !exp.active)}
          className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
            exp.active
              ? "border-red-500/30 text-red-400 hover:bg-red-500/10"
              : "border-green-500/30 text-green-400 hover:bg-green-500/10"
          }`}
        >
          {exp.active ? "Pause" : "Activate"}
        </button>
      </div>

      {/* Variant configs */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {(["a", "b"] as const).map(v => {
          const cfg = v === "a" ? exp.variant_a : exp.variant_b;
          return (
            <div key={v} className="bg-zinc-800/50 rounded-xl p-3">
              <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                Variant {v.toUpperCase()}
              </div>
              <div className="space-y-1 text-xs text-zinc-500">
                <div><span className="text-zinc-400">Script:</span> {cfg.script_id}</div>
                <div><span className="text-zinc-400">Timing:</span> {cfg.timing_min}–{cfg.timing_max} min</div>
                <div><span className="text-zinc-400">Channels:</span> {cfg.channel_order.join(" → ")}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Results */}
      {a && b ? (
        <div className="space-y-4">
          <StatBar
            label="Pre-qual conversion"
            a={a.prequal} aTotal={a.total}
            b={b.prequal} bTotal={b.total}
          />
          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-zinc-800">
            <div className="text-center">
              <div className="text-xs text-zinc-500 mb-1">A Leads</div>
              <div className="text-lg font-bold text-white">{a.total}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-zinc-500 mb-1">B Leads</div>
              <div className="text-lg font-bold text-white">{b.total}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-zinc-500 mb-1">Significance</div>
              <div className={`text-xs font-medium ${sig.color}`}>{sig.label}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-4 text-zinc-600 text-sm">
          No leads enrolled yet
        </div>
      )}
    </div>
  );
}

// ─── New experiment form ──────────────────────────────────────────────────────

function NewExperimentForm({ adminKey, onCreated }: { adminKey: string; onCreated: () => void }) {
  const [open, setOpen]         = useState(false);
  const [saving, setSaving]     = useState(false);
  const [name, setName]         = useState("");
  const [split, setSplit]       = useState("50");
  const [aScript, setAScript]   = useState("intro_v1");
  const [bScript, setBScript]   = useState("intro_v2");
  const [aTiming, setATiming]   = useState("4-9");
  const [bTiming, setBTiming]   = useState("4-9");

  const parseTiming = (s: string) => {
    const [min, max] = s.split("-").map(Number);
    return { min: min || 4, max: max || 9 };
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const at = parseTiming(aTiming);
    const bt = parseTiming(bTiming);
    try {
      await fetch("/api/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
        body: JSON.stringify({
          name:          name.trim().toLowerCase().replace(/\s+/g, "_"),
          active:        false,
          traffic_split: Number(split) / 100,
          variant_a: { channel_order: ["sms", "voice"], script_id: aScript, timing_min: at.min, timing_max: at.max },
          variant_b: { channel_order: ["sms", "voice"], script_id: bScript, timing_min: bt.min, timing_max: bt.max },
        }),
      });
      setOpen(false);
      setName(""); setAScript("intro_v1"); setBScript("intro_v2");
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded-xl bg-amber-400 text-black font-bold text-sm hover:bg-amber-300 transition-colors"
      >
        + New Experiment
      </button>
    );
  }

  return (
    <div className="bg-zinc-900 border border-amber-400/30 rounded-2xl p-6 max-w-2xl">
      <h3 className="text-white font-bold mb-4">New Experiment</h3>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1.5">Name</label>
          <input
            value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. intro script test"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400 placeholder-zinc-600"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1.5">Traffic split — Variant A %</label>
          <input
            type="number" min="10" max="90" value={split} onChange={e => setSplit(e.target.value)}
            className="w-24 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400"
          />
          <span className="text-zinc-500 text-sm ml-2">% to A, {100 - Number(split)}% to B</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Variant A", script: aScript, setScript: setAScript, timing: aTiming, setTiming: setATiming },
            { label: "Variant B", script: bScript, setScript: setBScript, timing: bTiming, setTiming: setBTiming },
          ].map(({ label, script, setScript, timing, setTiming }) => (
            <div key={label} className="bg-zinc-800/50 rounded-xl p-3">
              <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">{label}</div>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Script ID</label>
                  <input value={script} onChange={e => setScript(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Timing (min-max minutes)</label>
                  <input value={timing} onChange={e => setTiming(e.target.value)} placeholder="4-9"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={handleCreate} disabled={saving || !name.trim()}
            className="px-4 py-2 rounded-xl bg-amber-400 text-black font-bold text-sm hover:bg-amber-300 disabled:opacity-40 transition-colors">
            {saving ? "Creating…" : "Create"}
          </button>
          <button onClick={() => setOpen(false)}
            className="px-4 py-2 rounded-xl border border-zinc-700 text-zinc-400 text-sm hover:text-white transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExperimentsPage() {
  const [adminKey, setAdminKey]         = useState<string | null>(null);
  const [pw, setPw]                     = useState("");
  const [experiments, setExperiments]   = useState<Experiment[]>([]);
  const [loading, setLoading]           = useState(false);
  const [toggling, setToggling]         = useState<string | null>(null);

  const fetchExperiments = useCallback(async (key: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/experiments", {
        headers: { "X-Admin-Key": key },
      });
      if (res.ok) {
        const data = await res.json();
        setExperiments(data.experiments ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLogin = async () => {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (res.ok) {
      setAdminKey(pw);
      fetchExperiments(pw);
    }
  };

  const handleToggle = async (id: string, active: boolean) => {
    if (!adminKey) return;
    setToggling(id);
    try {
      await fetch(`/api/experiments?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
        body: JSON.stringify({ active }),
      });
      await fetchExperiments(adminKey);
    } finally {
      setToggling(null);
    }
  };

  // ── Auth gate ──

  if (!adminKey) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 w-full max-w-sm text-center">
          <div className="text-3xl mb-3">🧪</div>
          <h1 className="text-white font-black text-xl mb-1">A/B Experiments</h1>
          <p className="text-zinc-500 text-sm mb-5">Admin access required</p>
          <input
            type="password" value={pw} onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            placeholder="Admin password"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-400 placeholder-zinc-600 mb-3"
          />
          <button onClick={handleLogin}
            className="w-full py-3 rounded-xl bg-amber-400 text-black font-bold text-sm hover:bg-amber-300 transition-colors">
            Enter →
          </button>
        </div>
      </div>
    );
  }

  // ── Dashboard ──

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-zinc-500 hover:text-white text-sm transition-colors">
            ← Dashboard
          </Link>
          <span className="text-zinc-700">/</span>
          <span className="text-white font-bold">A/B Experiments</span>
        </div>
        <button onClick={() => fetchExperiments(adminKey)}
          className="text-xs text-zinc-500 hover:text-white transition-colors">
          ↻ Refresh
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* Summary bar */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total experiments",   value: experiments.length },
            { label: "Active experiments",  value: experiments.filter(e => e.active).length },
            { label: "Total leads enrolled", value: experiments.reduce((sum, e) => sum + (e.results?.a?.total ?? 0) + (e.results?.b?.total ?? 0), 0) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-center">
              <div className="text-2xl font-black text-white">{value}</div>
              <div className="text-xs text-zinc-500 mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* New experiment form */}
        <NewExperimentForm adminKey={adminKey} onCreated={() => fetchExperiments(adminKey)} />

        {/* Experiment cards */}
        {loading ? (
          <div className="text-center py-12 text-zinc-600">Loading experiments…</div>
        ) : experiments.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
            <div className="text-4xl mb-3">🧪</div>
            <p className="text-zinc-500 text-sm">No experiments yet. Create one above to start testing.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {experiments.map(exp => (
              <ExperimentCard
                key={exp.id} exp={exp} adminKey={adminKey}
                onToggle={toggling ? () => {} : handleToggle}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
