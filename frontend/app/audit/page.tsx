"use client";

import { useCallback, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AuditRecord {
  rule_id: string;
  ts: string;
  trigger_matched: boolean;
  conditions_passed?: string[];
  conditions_failed?: string[];
  guardrail_trips?: string[];
  action_built?: unknown;
  action_result?: { status: string; [k: string]: unknown };
  [k: string]: unknown;
}

function fmtTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function statusBadge(record: AuditRecord) {
  const result = record.action_result?.status;
  if (record.guardrail_trips?.length) {
    return <Badge variant="destructive" className="text-xs">Guardrail</Badge>;
  }
  if (result === "dry_run") {
    return <Badge variant="secondary" className="text-xs">Dry run</Badge>;
  }
  if (result === "submitted") {
    return <Badge className="text-xs bg-green-500 hover:bg-green-600">Submitted</Badge>;
  }
  if (result === "blocked") {
    return <Badge variant="outline" className="text-xs">Blocked</Badge>;
  }
  return null;
}

function AuditRow({ record }: { record: AuditRecord }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="font-mono text-xs text-muted-foreground w-40 shrink-0">
          {fmtTs(record.ts)}
        </span>
        <span className="text-sm font-medium flex-1 truncate">{record.rule_id}</span>
        <div className="flex items-center gap-2 shrink-0">
          {record.conditions_failed?.length ? (
            <span className="text-xs text-muted-foreground">
              {record.conditions_failed.length} cond failed
            </span>
          ) : null}
          {statusBadge(record)}
          <span
            className={cn(
              "size-2 rounded-full",
              record.trigger_matched ? "bg-green-500" : "bg-muted-foreground/40"
            )}
            title={record.trigger_matched ? "Trigger matched" : "No match"}
          />
        </div>
      </button>
      {expanded && (
        <div className="border-t bg-muted/30 px-4 py-3">
          <pre className="text-xs font-mono whitespace-pre-wrap break-all text-foreground/80">
            {JSON.stringify(record, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="border rounded-lg px-4 py-3 flex items-center gap-3">
      <Skeleton className="size-4 rounded" />
      <Skeleton className="h-3 w-32" />
      <Skeleton className="h-3 flex-1" />
      <Skeleton className="h-5 w-16 rounded-full" />
    </div>
  );
}

export default function AuditPage() {
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

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

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchAudit, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchAudit]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Audit Feed</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? "Loading…" : `${records.length} record${records.length !== 1 ? "s" : ""} — newest first`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh((p) => !p)}
          >
            <RefreshCw className={cn("size-3.5", autoRefresh && "animate-spin")} />
            {autoRefresh ? "Live" : "Paused"}
          </Button>
          <Button variant="outline" size="sm" onClick={fetchAudit}>
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          No audit records yet. Executor writes to{" "}
          <code className="font-mono text-xs">executor/audit.jsonl</code> when rules fire.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {records.map((r, i) => (
            <AuditRow key={`${r.rule_id}-${r.ts}-${i}`} record={r} />
          ))}
        </div>
      )}
    </div>
  );
}
