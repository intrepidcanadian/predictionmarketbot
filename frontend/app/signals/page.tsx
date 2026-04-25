"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Save, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type SignalValue = boolean | string | number;

interface SignalRow {
  key: string;
  value: SignalValue;
  editing: boolean;
}

function parseValue(raw: string): SignalValue {
  if (raw === "true") return true;
  if (raw === "false") return false;
  const n = Number(raw);
  if (!isNaN(n) && raw.trim() !== "") return n;
  return raw;
}

function displayValue(v: SignalValue): string {
  return String(v);
}

export default function SignalsPage() {
  const [rows, setRows] = useState<SignalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("false");
  const [dirty, setDirty] = useState(false);

  const fetchSignals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/signals");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Record<string, SignalValue> = await res.json();
      setRows(
        Object.entries(data).map(([key, value]) => ({ key, value, editing: false }))
      );
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch signals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSignals(); }, [fetchSignals]);

  const handleValueChange = (i: number, raw: string) => {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, value: parseValue(raw) } : r));
    setDirty(true);
  };

  const handleBoolToggle = (i: number, v: boolean) => {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, value: v } : r));
    setDirty(true);
  };

  const handleDelete = (i: number) => {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
    setDirty(true);
  };

  const handleAdd = () => {
    if (!newKey.trim()) return;
    if (rows.some((r) => r.key === newKey.trim())) {
      alert(`Key "${newKey.trim()}" already exists`);
      return;
    }
    setRows((prev) => [...prev, { key: newKey.trim(), value: parseValue(newValue), editing: false }]);
    setNewKey("");
    setNewValue("false");
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const obj = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      const res = await fetch("/api/signals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(obj),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Signals</h1>
          <p className="text-sm text-muted-foreground">
            Key/value pairs in <code className="font-mono text-xs">executor/signals.json</code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchSignals} disabled={loading || saving}>
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="gap-1.5"
          >
            <Save className="size-3.5" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-4">
          {error}
        </div>
      )}

      {dirty && (
        <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-sm text-amber-700 mb-4">
          Unsaved changes — click Save to write to disk.
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-8 flex-1" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {/* Header */}
          <div className="flex items-center gap-3 px-2 pb-1 border-b">
            <span className="text-xs font-medium text-muted-foreground w-48">Key</span>
            <span className="text-xs font-medium text-muted-foreground flex-1">Value</span>
            <span className="w-8" />
          </div>

          {/* Rows */}
          {rows.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">
              No signals. Add one below.
            </p>
          ) : (
            rows.map((row, i) => (
              <div key={row.key} className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-muted/30">
                <span className="font-mono text-sm w-48 truncate" title={row.key}>{row.key}</span>
                {typeof row.value === "boolean" ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Switch
                      checked={row.value}
                      onCheckedChange={(v) => handleBoolToggle(i, v)}
                    />
                    <span className="text-sm text-muted-foreground">
                      {row.value ? "true" : "false"}
                    </span>
                  </div>
                ) : (
                  <Input
                    className="flex-1 h-7 text-sm font-mono"
                    value={displayValue(row.value)}
                    onChange={(e) => handleValueChange(i, e.target.value)}
                  />
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => handleDelete(i)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))
          )}

          {/* Add row */}
          <div className="flex items-center gap-3 px-2 py-2 mt-2 border-t">
            <Input
              className="w-48 h-7 text-sm font-mono"
              placeholder="new-key"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            />
            <Input
              className="flex-1 h-7 text-sm font-mono"
              placeholder="true / false / text"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            />
            <Button
              variant="outline"
              size="icon"
              className="size-7 shrink-0"
              onClick={handleAdd}
              disabled={!newKey.trim()}
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
