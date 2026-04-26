"use client";

import { useCallback, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ActionData {
  side?: string;
  type?: string;
  size_usd?: number;
  price?: number;
  order_type?: string;
  max_slippage?: number;
}

interface ContextData {
  top_bid?: number;
  mid?: number;
  top_ask?: number;
}

interface TargetData {
  market_slug?: string;
}

interface ItemPayload {
  action?: ActionData;
  context?: ContextData;
  target?: TargetData;
  [k: string]: unknown;
}

interface PendingItem {
  id: string;
  file?: string;
  rule_id?: string;
  rule_name?: string;
  queued_at?: string;
  why?: string;
  data: ItemPayload;
}

function fmtRel(iso?: string): string {
  if (!iso) return "—";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function ApprovalCard({
  item,
  onApprove,
  onReject,
  expanded,
  onToggle,
}: {
  item: PendingItem;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);

  const handle = (kind: "approve" | "reject") => async (e: React.MouseEvent) => {
    e.stopPropagation();
    setActing(kind);
    await new Promise((r) => setTimeout(r, 350));
    if (kind === "approve") await onApprove(item.id);
    else await onReject(item.id);
  };

  const a      = item.data?.action;
  const ctx    = item.data?.context;
  const target = item.data?.target;

  const sideClr = a?.side === "BUY"
    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
    : a?.side === "SELL"
    ? "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30"
    : "bg-muted text-muted-foreground border-border";

  const displaySide = a?.side ?? (a?.type ? "ORDER" : null);
  const displayName = item.rule_name ?? item.id;
  const displayRuleId = item.rule_id ?? item.file ?? "";
  const hasCtx = ctx && (ctx.top_bid != null || ctx.mid != null || ctx.top_ask != null);

  return (
    <div className={cn(
      "rounded-xl border border-border bg-card overflow-hidden transition-opacity",
      acting && "opacity-50 pointer-events-none"
    )}>
      <button onClick={onToggle} className="w-full text-left p-4 flex flex-col gap-3 hover:bg-accent/40 transition-colors">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {displaySide && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold tracking-wider ${sideClr}`}>
                  {displaySide}
                </span>
              )}
              <span className="text-sm font-semibold truncate">{displayName}</span>
            </div>
            {displayRuleId && (
              <p className="text-[11px] text-muted-foreground font-mono mt-1 truncate">
                rule: {displayRuleId}
              </p>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
            queued {fmtRel(item.queued_at)}
          </span>
        </div>

        {/* Action summary line */}
        {(a || target) && (
          <div className="flex items-center gap-2 flex-wrap text-xs">
            {target?.market_slug && (
              <code className="font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {target.market_slug}
              </code>
            )}
            {a?.type === "limit_order" && a.side && a.size_usd != null && a.price != null && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="font-medium">{a.side} ${a.size_usd}</span>
                <span className="text-muted-foreground">@</span>
                <span className="font-mono tabular-nums font-semibold">{(a.price * 100).toFixed(0)}¢</span>
                {a.order_type && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-mono">{a.order_type}</span>
                )}
              </>
            )}
            {a?.type === "marketable_order" && a.side && a.size_usd != null && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="font-medium">{a.side} ${a.size_usd} mkt</span>
                {a.max_slippage != null && (
                  <span className="text-muted-foreground text-[11px]">slip ≤ {(a.max_slippage * 100).toFixed(1)}¢</span>
                )}
              </>
            )}
          </div>
        )}

        {/* Why callout */}
        {item.why && (
          <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-foreground/80 border-l-2 border-blue-500/50">
            {item.why}
          </div>
        )}

        {/* Order book context strip */}
        {hasCtx && (
          <div className="flex items-stretch gap-0.5 text-[11px]">
            <div className="flex-1 px-3 py-2 bg-rose-500/5 rounded-l-md">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Top bid</div>
              <div className="font-mono tabular-nums font-semibold">
                {ctx!.top_bid != null ? `${(ctx!.top_bid * 100).toFixed(1)}¢` : "—"}
              </div>
            </div>
            <div className="flex-1 px-3 py-2 bg-muted/40 text-center">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Mid</div>
              <div className="font-mono tabular-nums font-semibold">
                {ctx!.mid != null ? `${(ctx!.mid * 100).toFixed(1)}¢` : "—"}
              </div>
            </div>
            <div className="flex-1 px-3 py-2 bg-emerald-500/5 rounded-r-md text-right">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Top ask</div>
              <div className="font-mono tabular-nums font-semibold">
                {ctx!.top_ask != null ? `${(ctx!.top_ask * 100).toFixed(1)}¢` : "—"}
              </div>
            </div>
          </div>
        )}

        {/* Expanded JSON detail */}
        {expanded && (
          <pre className="rounded-md bg-muted/40 p-3 text-[10px] font-mono whitespace-pre-wrap break-all text-foreground/70 border border-border">
            {JSON.stringify(item.data, null, 2)}
          </pre>
        )}
      </button>

      {/* Action buttons */}
      <div className="flex items-stretch border-t border-border">
        <button
          onClick={handle("reject")}
          className="flex-1 py-2.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center justify-center gap-1.5"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
          Reject
        </button>
        <div className="w-px bg-border"/>
        <button
          onClick={handle("approve")}
          className="flex-1 py-2.5 text-xs font-semibold text-background bg-foreground hover:bg-foreground/90 transition-colors flex items-center justify-center gap-1.5"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
            <path d="m20 6-11 11-5-5"/>
          </svg>
          Approve &amp; execute
        </button>
      </div>
    </div>
  );
}

export default function ApprovalsPage() {
  const [items,      setItems]      = useState<PendingItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/approvals");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch approvals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleApprove = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/approvals/${id}`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      alert(`Approve failed: ${e instanceof Error ? e.message : e}`);
    }
  }, []);

  const handleReject = useCallback(async (id: string) => {
    if (!confirm(`Reject and delete approval "${id}"?`)) return;
    try {
      const res = await fetch(`/api/approvals/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      alert(`Reject failed: ${e instanceof Error ? e.message : e}`);
    }
  }, []);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
            {!loading && items.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold tracking-wider">
                {items.length} PENDING
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Actions queued by rules with manual approval gates. Click to expand JSON.
          </p>
        </div>
        <button
          onClick={fetchItems}
          disabled={loading}
          className="h-8 px-3 rounded-md border text-xs font-medium flex items-center gap-1.5 bg-background text-muted-foreground border-border hover:text-foreground transition-colors disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
               className={cn("size-3.5", loading && "animate-spin")}>
            <path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>
          </svg>
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-4 flex flex-col gap-3">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-40"/>
                <Skeleton className="h-4 w-24"/>
              </div>
              <Skeleton className="h-8 rounded-md"/>
              <Skeleton className="h-10 rounded-md"/>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-xl">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
               className="size-10 mx-auto mb-3 text-muted-foreground/40">
            <path d="m20 6-11 11-5-5"/>
          </svg>
          <p className="text-sm text-muted-foreground">All caught up.</p>
          <p className="text-[11px] text-muted-foreground/70 mt-1 font-mono">
            executor/approvals/pending/ is empty
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <ApprovalCard
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}
        </div>
      )}
    </div>
  );
}
