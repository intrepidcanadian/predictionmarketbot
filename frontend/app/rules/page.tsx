"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2, RefreshCw, Zap, Clock, AlertCircle, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface RuleState {
  created_at?: string;
  updated_at?: string;
  last_fired_at?: string | null;
  fires_today?: number;
  status?: "armed" | "cooling_down" | "disabled" | "paused_by_guardrail";
}

interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  notes?: string;
  trigger: { type: string; [k: string]: unknown };
  action: { type: string; [k: string]: unknown };
  guardrails: { dry_run?: boolean; require_manual_approval?: boolean; cooldown_seconds?: number; [k: string]: unknown };
  state?: RuleState;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  armed:               "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  cooling_down:        "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  disabled:            "bg-muted text-muted-foreground border-border",
  paused_by_guardrail: "bg-destructive/10 text-destructive border-destructive/30",
};

const STATUS_LABEL: Record<string, string> = {
  armed: "Armed", cooling_down: "Cooling down", disabled: "Disabled", paused_by_guardrail: "Paused",
};

const TRIGGER_COLORS: Record<string, string> = {
  price_cross:            "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/25",
  price_move:             "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/25",
  volume_spike:           "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/25",
  orderbook_imbalance:    "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/25",
  time_before_resolution: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25",
  scheduled:              "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/25",
  external_signal:        "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/25",
};

const ACTION_LABEL: Record<string, string> = {
  limit_order: "Limit", marketable_order: "Market", close_position: "Close",
  cancel_open_orders: "Cancel", notify_only: "Notify",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function inferStatus(rule: Rule): string {
  if (!rule.enabled) return "disabled";
  return rule.state?.status ?? "armed";
}

function triggerSummary(t: Rule["trigger"]): string {
  switch (t.type) {
    case "price_cross":            return `Price ${t.direction} ${((t.threshold as number) * 100).toFixed(0)}¢`;
    case "price_move":             return `±${Math.abs((t.delta as number) * 100).toFixed(1)}¢ in ${(t.window_seconds as number) / 60}m`;
    case "volume_spike":           return `Vol > $${((t.min_volume_usd as number) / 1000).toFixed(1)}k`;
    case "orderbook_imbalance":    return `Book ${String(t.direction).replace("_", " ")} ${(t.ratio as number).toFixed(1)}×`;
    case "time_before_resolution": return `${((t.seconds_before as number) / 3600).toFixed(0)}h before close`;
    case "scheduled":              return `Cron · ${t.cron}`;
    case "external_signal":        return `Signal ${t.signal_id}`;
    default:                       return t.type.replace(/_/g, " ");
  }
}

// ── RuleCard ──────────────────────────────────────────────────────────────────

function RuleCard({
  rule, onToggle, onDelete,
}: {
  rule: Rule;
  onToggle: (id: string, enabled: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const status     = inferStatus(rule);
  const triggerType = rule.trigger?.type ?? "unknown";
  const actionType  = rule.action?.type ?? "unknown";

  const handleToggle = async () => {
    setToggling(true);
    await onToggle(rule.id, !rule.enabled);
    setToggling(false);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete rule "${rule.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    await onDelete(rule.id);
  };

  return (
    <div className={cn(
      "rounded-xl border border-border bg-card p-4 flex flex-col gap-3 hover:border-foreground/20 transition-all",
      deleting && "opacity-50 pointer-events-none"
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-snug truncate">{rule.name}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 font-mono truncate">{rule.id}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Switch checked={rule.enabled} onCheckedChange={handleToggle} disabled={toggling} aria-label="Toggle rule" />
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={handleDelete}>
            <Trash2 />
          </Button>
        </div>
      </div>

      {rule.notes && (
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{rule.notes}</p>
      )}

      <div className="flex flex-wrap gap-1.5">
        <span className={cn("inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium", STATUS_STYLES[status] ?? STATUS_STYLES.disabled)}>
          <span className="size-1.5 rounded-full bg-current" />
          {STATUS_LABEL[status] ?? status}
        </span>
        <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", TRIGGER_COLORS[triggerType] ?? "bg-muted text-muted-foreground border-border")}>
          {triggerSummary(rule.trigger)}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-muted text-muted-foreground font-medium">
          {ACTION_LABEL[actionType] ?? actionType.replace(/_/g, " ")}
        </span>
        {rule.guardrails?.dry_run && (
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium">
            dry run
          </span>
        )}
        {rule.guardrails?.require_manual_approval && (
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300 font-medium">
            approvals gated
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 text-[11px] text-muted-foreground pt-1 border-t border-border">
        <span className="flex items-center gap-1">
          <Zap className="size-3" />
          {fmtRelative(rule.state?.last_fired_at)}
        </span>
        <span className="flex items-center gap-1 tabular-nums">
          <Clock className="size-3" />
          {rule.state?.fires_today ?? 0} today
        </span>
        {rule.guardrails?.cooldown_seconds ? (
          <span className="ml-auto text-[10px]">{rule.guardrails.cooldown_seconds / 60}m cd</span>
        ) : null}
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1.5 flex-1">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        <Skeleton className="h-5 w-9 rounded-full" />
      </div>
      <div className="flex gap-1.5">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <Skeleton className="h-3 w-1/2 mt-1" />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Filter = "all" | "active" | "issues" | "disabled";

export default function RulesPage() {
  const [rules,   setRules]   = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [filter,  setFilter]  = useState<Filter>("all");
  const [search,  setSearch]  = useState("");

  const fetchRules = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/rules");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRules(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch rules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const handleToggle = useCallback(async (id: string, enabled: boolean) => {
    try {
      const res = await fetch(`/api/rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRules(prev => prev.map(r => r.id === id ? { ...r, enabled } : r));
    } catch (e) {
      alert(`Toggle failed: ${e instanceof Error ? e.message : e}`);
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/rules/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      setRules(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      alert(`Delete failed: ${e instanceof Error ? e.message : e}`);
    }
  }, []);

  // Counts based on all rules (not filtered by search/tab)
  const counts = useMemo(() => ({
    all:      rules.length,
    active:   rules.filter(r => r.enabled && inferStatus(r) === "armed").length,
    issues:   rules.filter(r => ["paused_by_guardrail", "cooling_down"].includes(inferStatus(r))).length,
    disabled: rules.filter(r => !r.enabled).length,
  }), [rules]);

  // Apply tab + search filter
  const filtered = useMemo(() => {
    return rules.filter(r => {
      const q = search.toLowerCase();
      if (q && !r.name.toLowerCase().includes(q) && !r.id.toLowerCase().includes(q)) return false;
      const status = inferStatus(r);
      if (filter === "active")   return r.enabled && status === "armed";
      if (filter === "issues")   return ["paused_by_guardrail", "cooling_down"].includes(status);
      if (filter === "disabled") return !r.enabled;
      return true;
    });
  }, [rules, filter, search]);

  const groups = useMemo(() => ({
    armed:    filtered.filter(r => r.enabled && inferStatus(r) === "armed"),
    issues:   filtered.filter(r => r.enabled && ["paused_by_guardrail", "cooling_down"].includes(inferStatus(r))),
    disabled: filtered.filter(r => !r.enabled),
  }), [filtered]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">Rules</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? "Loading…" : `${rules.length} rule${rules.length !== 1 ? "s" : ""} · ${counts.active} armed · ${counts.issues} need attention`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search rules…"
              className="h-8 w-48 pl-8 pr-3 rounded-md border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <Button variant="outline" size="sm" onClick={fetchRules} disabled={loading}>
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          </Button>
          <Link href="/rules/new">
            <Button size="sm" className="gap-1.5">
              <Plus className="size-3.5" />
              New Rule
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter pills */}
      <div className="inline-flex rounded-md border border-border bg-card p-0.5 mb-6">
        {([
          { id: "all",      label: "All",     accent: "" },
          { id: "active",   label: "Armed",   accent: "" },
          { id: "issues",   label: "Issues",  accent: counts.issues > 0 ? "text-amber-600 dark:text-amber-400" : "" },
          { id: "disabled", label: "Disabled", accent: "" },
        ] as { id: Filter; label: string; accent: string }[]).map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={cn(
              "flex items-center gap-1.5 h-7 px-3 rounded text-xs font-medium transition-colors",
              filter === f.id ? "bg-foreground text-background" : `text-muted-foreground hover:text-foreground ${f.accent}`
            )}>
            {f.label}
            <span className={cn("text-[10px] tabular-nums", filter === f.id ? "opacity-70" : "opacity-60")}>
              {counts[f.id]}
            </span>
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-6">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : rules.length === 0 ? (
        <div className="text-center py-20 text-sm text-muted-foreground border border-dashed border-border rounded-xl">
          No rules in <code className="font-mono text-xs">executor/rules/</code>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {[
            { label: "Armed",          items: groups.armed },
            { label: "Need attention", items: groups.issues },
            { label: "Disabled",       items: groups.disabled },
          ].filter(g => g.items.length > 0).map(group => (
            <section key={group.label}>
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-3">
                {group.label}
                <span className="text-muted-foreground/60"> · {group.items.length}</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {group.items.map(rule => (
                  <RuleCard key={rule.id} rule={rule} onToggle={handleToggle} onDelete={handleDelete} />
                ))}
              </div>
            </section>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-16 text-sm text-muted-foreground border border-dashed border-border rounded-xl">
              No rules match these filters.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
