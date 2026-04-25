"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, Trash2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface PendingItem {
  id: string;
  file: string;
  data: unknown;
}

function ApprovalCard({
  item,
  onApprove,
  onReject,
}: {
  item: PendingItem;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
}) {
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);

  const handle = (action: "approve" | "reject") => async () => {
    setActing(action);
    if (action === "approve") await onApprove(item.id);
    else await onReject(item.id);
  };

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 flex flex-col gap-3 transition-opacity",
        acting && "opacity-50 pointer-events-none"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{item.id}</p>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">{item.file}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            size="sm"
            onClick={handle("approve")}
            disabled={!!acting}
            className="gap-1.5 bg-green-600 hover:bg-green-700"
          >
            <CheckCircle className="size-3.5" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handle("reject")}
            disabled={!!acting}
            className="gap-1.5 text-destructive hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
            Reject
          </Button>
        </div>
      </div>
      <div className="rounded-md bg-muted/50 p-3 overflow-auto max-h-48">
        <pre className="text-xs font-mono whitespace-pre-wrap break-all">
          {JSON.stringify(item.data, null, 2)}
        </pre>
      </div>
    </div>
  );
}

export default function ApprovalsPage() {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Approvals</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? "Loading…" : `${items.length} pending approval${items.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchItems} disabled={loading}>
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
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
                <Skeleton className="h-4 w-40" />
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-24 rounded-md" />
                  <Skeleton className="h-8 w-20 rounded-md" />
                </div>
              </div>
              <Skeleton className="h-20 rounded-md" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          No pending approvals.{" "}
          <span className="font-mono text-xs">executor/approvals/pending/</span> is empty.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((item) => (
            <ApprovalCard
              key={item.id}
              item={item}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}
        </div>
      )}
    </div>
  );
}
