"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface AuditRecord {
  rule_id: string;
  ts: string;
  trigger_matched: boolean;
  conditions_failed?: string[];
  guardrail_trips?: string[];
  action_built?: { type: string; side?: string; size_usd?: number; price?: number } | null;
  action_result?: { status: string; [k: string]: unknown };
  [k: string]: unknown;
}

const RESULT_STYLE: Record<string, { label: string; cls: string }> = {
  submitted:        { label: "Submitted", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
  dry_run:          { label: "Dry run",   cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30" },
  blocked:          { label: "Blocked",   cls: "bg-muted text-muted-foreground border-border" },
  pending_approval: { label: "Pending",   cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  no_match:         { label: "No match",  cls: "bg-muted/50 text-muted-foreground border-border/50" },
  guardrail:        { label: "Guardrail", cls: "bg-destructive/15 text-destructive border-destructive/30" },
};

function recordKind(r: AuditRecord): string {
  if (!r.trigger_matched) return "no_match";
  if (r.guardrail_trips?.length) return "guardrail";
  return r.action_result?.status ?? "submitted";
}

function fmtTs(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
  } catch {
    return iso;
  }
}

function AuditRow({
  record,
  expanded,
  onToggle,
}: {
  record: AuditRecord;
  expanded: boolean;
  onToggle: () => void;
}) {
  const kind = recordKind(record);
  const meta = RESULT_STYLE[kind] ?? RESULT_STYLE.submitted;
  const ab = record.action_built as { type: string; side?: string; size_usd?: number; price?: number } | null | undefined;

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full grid grid-cols-[80px_180px_1fr_auto_auto] gap-3 items-center px-4 py-2.5 text-left hover:bg-accent/40 transition-colors"
      >
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{fmtTs(record.ts)}</span>
        <span className="text-xs font-medium truncate">{record.rule_id}</span>
        <span className="text-[11px] text-muted-foreground truncate">
          {record.trigger_matched ? (
            record.guardrail_trips?.length ? (
              <span className="text-destructive">⛔ {record.guardrail_trips[0]}</span>
            ) : ab ? (
              <>
                {ab.type.replace(/_/g, " ")}
                {ab.side ? ` · ${ab.side}` : ""}
                {ab.size_usd ? ` $${ab.size_usd}` : ""}
                {ab.price ? ` @ ${(ab.price * 100).toFixed(0)}¢` : ""}
              </>
            ) : "matched"
          ) : (
            record.conditions_failed?.[0] ?? "no match"
          )}
        </span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium tracking-wide whitespace-nowrap ${meta.cls}`}>
          {meta.label}
        </span>
        <svg
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`size-3.5 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
        >
          <path d="m9 18 6-6-6-6"/>
        </svg>
      </button>
      {expanded && (
        <div className="bg-muted/30 px-4 py-3 border-t border-border">
          <pre className="text-[10px] font-mono whitespace-pre-wrap break-all text-foreground/75 leading-relaxed">
            {JSON.stringify(record, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function AuditPage() {
  const [records,     setRecords]     = useState<AuditRecord[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filter,      setFilter]      = useState("all");
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const fetchAudit = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/audit?limit=100");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRecords(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch audit log");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAudit(); }, [fetchAudit]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchAudit, 5000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchAudit]);

  const counts = useMemo(() => ({
    all:      records.length,
    fired:    records.filter((r) => r.trigger_matched && recordKind(r) === "submitted").length,
    dry_run:  records.filter((r) => recordKind(r) === "dry_run").length,
    blocked:  records.filter((r) => r.trigger_matched && ["blocked", "guardrail"].includes(recordKind(r))).length,
    no_match: records.filter((r) => !r.trigger_matched).length,
  }), [records]);

  const filtered = useMemo(() => records.filter((r) => {
    const kind = recordKind(r);
    if (filter === "fired")    return r.trigger_matched && kind === "submitted";
    if (filter === "blocked")  return r.trigger_matched && ["blocked", "guardrail"].includes(kind);
    if (filter === "no_match") return !r.trigger_matched;
    if (filter === "dry_run")  return kind === "dry_run";
    return true;
  }), [records, filter]);

  return (
    <div className="p-6 max-w-[1100px] mx-auto">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-semibold tracking-tight">Audit feed</h1>
            {autoRefresh && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-bold tracking-wider flex items-center gap-1">
                <span className="size-1 rounded-full bg-emerald-500 animate-pulse"/>
                LIVE
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {loading ? "Loading…" : `${records.length} rule evaluations · last 100 · `}
            <span className="font-mono text-[11px]">executor/audit.jsonl</span>
          </p>
        </div>
        <button
          onClick={() => setAutoRefresh((p) => !p)}
          className={`h-8 px-3 rounded-md border text-xs font-medium flex items-center gap-1.5 transition-colors ${
            autoRefresh
              ? "bg-foreground text-background border-foreground"
              : "bg-background text-muted-foreground border-border hover:text-foreground"
          }`}
        >
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`size-3.5 ${autoRefresh ? "animate-spin" : ""}`}
            style={{ animationDuration: "3s" }}
          >
            <path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>
          </svg>
          {autoRefresh ? "Live" : "Paused"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-4">
          {error}
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-5">
        {[
          { id: "all",      label: "All",       value: counts.all,      cls: "" },
          { id: "fired",    label: "Submitted", value: counts.fired,    cls: "text-emerald-600 dark:text-emerald-400" },
          { id: "dry_run",  label: "Dry run",   value: counts.dry_run,  cls: "text-blue-600 dark:text-blue-400" },
          { id: "blocked",  label: "Blocked",   value: counts.blocked,  cls: "text-destructive" },
          { id: "no_match", label: "No match",  value: counts.no_match, cls: "text-muted-foreground" },
        ].map((s) => (
          <button
            key={s.id}
            onClick={() => { setFilter(s.id); setExpandedIdx(null); }}
            className={`rounded-xl border p-3 text-left transition-colors ${
              filter === s.id ? "border-foreground bg-card" : "border-border bg-card hover:border-foreground/30"
            }`}
          >
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</div>
            <div className={`text-xl font-semibold font-mono mt-0.5 tabular-nums ${s.cls}`}>{s.value}</div>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-lg border px-4 py-3 grid grid-cols-[80px_180px_1fr_auto] gap-3 items-center">
              <Skeleton className="h-3 w-14"/>
              <Skeleton className="h-3 w-28"/>
              <Skeleton className="h-3 w-full"/>
              <Skeleton className="h-5 w-16 rounded"/>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-[80px_180px_1fr_auto_auto] gap-3 items-center px-4 py-2 bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            <span>Time</span>
            <span>Rule</span>
            <span>Detail</span>
            <span>Result</span>
            <span className="w-3.5"/>
          </div>
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              {records.length === 0
                ? <>No audit records yet. Executor writes to <code className="font-mono text-xs">executor/audit.jsonl</code> when rules fire.</>
                : "No records match this filter."}
            </div>
          ) : (
            filtered.map((r, i) => (
              <AuditRow
                key={`${r.rule_id}-${r.ts}-${i}`}
                record={r}
                expanded={expandedIdx === i}
                onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
