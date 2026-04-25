"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2, RefreshCw, Zap, Clock, AlertCircle, Plus } from "lucide-react";
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
  guardrails: { dry_run?: boolean; cooldown_seconds?: number; [k: string]: unknown };
  state?: RuleState;
}

const STATUS_STYLES: Record<string, string> = {
  armed: "bg-green-500/15 text-green-700 border-green-500/30",
  cooling_down: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  disabled: "bg-muted text-muted-foreground border-border",
  paused_by_guardrail: "bg-destructive/10 text-destructive border-destructive/30",
};

const STATUS_LABEL: Record<string, string> = {
  armed: "Armed",
  cooling_down: "Cooling Down",
  disabled: "Disabled",
  paused_by_guardrail: "Paused",
};

const TRIGGER_COLORS: Record<string, string> = {
  price_cross: "bg-blue-500/10 text-blue-700 border-blue-500/25",
  price_move: "bg-indigo-500/10 text-indigo-700 border-indigo-500/25",
  volume_spike: "bg-violet-500/10 text-violet-700 border-violet-500/25",
  orderbook_imbalance: "bg-fuchsia-500/10 text-fuchsia-700 border-fuchsia-500/25",
  time_before_resolution: "bg-sky-500/10 text-sky-700 border-sky-500/25",
  scheduled: "bg-teal-500/10 text-teal-700 border-teal-500/25",
  external_signal: "bg-orange-500/10 text-orange-700 border-orange-500/25",
};

const ACTION_LABEL: Record<string, string> = {
  limit_order: "Limit Order",
  marketable_order: "Mkt Order",
  close_position: "Close Pos",
  cancel_open_orders: "Cancel",
  notify_only: "Notify",
};

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

function RuleCard({
  rule,
  onToggle,
  onDelete,
}: {
  rule: Rule;
  onToggle: (id: string, enabled: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const status = inferStatus(rule);
  const triggerType = rule.trigger?.type ?? "unknown";
  const actionType = rule.action?.type ?? "unknown";

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
    <div
      className={cn(
        "rounded-xl border bg-card p-4 flex flex-col gap-3 transition-opacity",
        deleting && "opacity-50 pointer-events-none"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-snug truncate">{rule.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">{rule.id}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Switch
            checked={rule.enabled}
            onCheckedChange={handleToggle}
            disabled={toggling}
            aria-label="Toggle rule"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={handleDelete}
            aria-label="Delete rule"
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      {rule.notes && (
        <p className="text-xs text-muted-foreground leading-relaxed">{rule.notes}</p>
      )}

      <div className="flex flex-wrap gap-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium",
            STATUS_STYLES[status] ?? STATUS_STYLES.disabled
          )}
        >
          <span className="size-1.5 rounded-full bg-current inline-block" />
          {STATUS_LABEL[status] ?? status}
        </span>
        <span
          className={cn(
            "inline-flex items-center text-xs px-2 py-0.5 rounded-full border font-medium",
            TRIGGER_COLORS[triggerType] ?? "bg-muted text-muted-foreground border-border"
          )}
        >
          {triggerType.replace(/_/g, " ")}
        </span>
        <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full border border-border bg-muted text-muted-foreground font-medium">
          {ACTION_LABEL[actionType] ?? actionType.replace(/_/g, " ")}
        </span>
        {rule.guardrails?.dry_run && (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-amber-500/25 bg-amber-500/10 text-amber-700 font-medium">
            <AlertCircle className="size-2.5" />
            dry run
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 border-t">
        <span className="flex items-center gap-1">
          <Zap className="size-3" />
          {fmtRelative(rule.state?.last_fired_at)}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="size-3" />
          {rule.state?.fires_today ?? 0} today
        </span>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col gap-3">
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

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    setError(null);
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

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const handleToggle = useCallback(async (id: string, enabled: boolean) => {
    try {
      const res = await fetch(`/api/rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRules((prev) =>
        prev.map((r) => (r.id === id ? { ...r, enabled } : r))
      );
    } catch (e) {
      alert(`Toggle failed: ${e instanceof Error ? e.message : e}`);
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/rules/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      alert(`Delete failed: ${e instanceof Error ? e.message : e}`);
    }
  }, []);

  const armed = rules.filter((r) => r.enabled && inferStatus(r) === "armed");
  const disabled = rules.filter((r) => !r.enabled || inferStatus(r) === "disabled");
  const other = rules.filter(
    (r) => r.enabled && inferStatus(r) !== "armed" && inferStatus(r) !== "disabled"
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Rules</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? "Loading…" : `${rules.length} rule${rules.length !== 1 ? "s" : ""} total`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchRules} disabled={loading}>
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
          <Link href="/rules/new">
            <Button size="sm" className="gap-1.5">
              <Plus className="size-3.5" />
              New Rule
            </Button>
          </Link>
        </div>
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
        <div className="text-center py-16 text-muted-foreground text-sm">
          No rules found in <code className="font-mono text-xs">executor/rules/</code>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {[
            { label: "Active", items: armed },
            { label: "Other", items: other },
            { label: "Disabled", items: disabled },
          ]
            .filter((g) => g.items.length > 0)
            .map((group) => (
              <section key={group.label}>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  {group.label} ({group.items.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {group.items.map((rule) => (
                    <RuleCard
                      key={rule.id}
                      rule={rule}
                      onToggle={handleToggle}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}
