"use client";

import { useCallback, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type SignalValue = boolean | string | number;

function parseValue(raw: string): SignalValue {
  if (raw === "true") return true;
  if (raw === "false") return false;
  const n = Number(raw);
  if (!isNaN(n) && raw.trim() !== "") return n;
  return raw;
}

const USED_BY: Record<string, string[]> = {
  trading_enabled:        ["all rules"],
  kill_switch:            ["all rules (overrides)"],
  eth_etf_divergence:     ["kalshi-divergence-arb"],
  fomc_window_active:     ["fed-cut-imbalance"],
  max_total_exposure_usd: ["btc-dip-buy", "kalshi-divergence-arb"],
  preferred_venue:        ["arb scanner"],
  claude_advisor_mode:    ["new rule wizard"],
};

function SignalRow({
  sigKey,
  value,
  onChange,
  onDelete,
}: {
  sigKey: string;
  value: SignalValue;
  onChange: (v: SignalValue) => void;
  onDelete: () => void;
}) {
  const isBool = typeof value === "boolean";
  const isNum  = typeof value === "number";

  return (
    <div className="grid grid-cols-[1fr_1.2fr_auto] gap-3 items-center px-3 py-2 rounded-md hover:bg-accent/40 transition-colors group">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`size-1.5 rounded-full shrink-0 ${
          isBool ? (value ? "bg-emerald-500" : "bg-muted-foreground/40")
                 : isNum ? "bg-blue-500" : "bg-purple-500"
        }`}/>
        <span className="font-mono text-xs truncate" title={sigKey}>{sigKey}</span>
        <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wider shrink-0">
          {isBool ? "bool" : isNum ? "num" : "str"}
        </span>
      </div>

      {isBool ? (
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onChange(!value)}
            className={`relative h-5 w-9 rounded-full transition-colors shrink-0 ${value ? "bg-emerald-500" : "bg-muted-foreground/30"}`}
          >
            <span className={`absolute top-0.5 size-4 rounded-full bg-background transition-transform ${value ? "translate-x-[18px]" : "translate-x-0.5"}`}/>
          </button>
          <span className={`text-xs font-mono ${value ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-muted-foreground"}`}>
            {String(value)}
          </span>
        </div>
      ) : (
        <input
          value={String(value)}
          onChange={(e) => onChange(isNum ? (Number(e.target.value) || 0) : e.target.value)}
          className="h-7 px-2 rounded-md border border-border bg-background text-xs font-mono"
        />
      )}

      <button
        onClick={onDelete}
        className="size-7 rounded-md grid place-items-center text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
        </svg>
      </button>
    </div>
  );
}

export default function SignalsPage() {
  const [signals,  setSignals]  = useState<Record<string, SignalValue>>({});
  const [original, setOriginal] = useState<Record<string, SignalValue>>({});
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [savedAt,  setSavedAt]  = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [newKey,   setNewKey]   = useState("");
  const [newVal,   setNewVal]   = useState("false");

  const dirty = JSON.stringify(signals) !== JSON.stringify(original);

  const fetchSignals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/signals");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Record<string, SignalValue> = await res.json();
      setSignals(data);
      setOriginal(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch signals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSignals(); }, [fetchSignals]);

  const setKey = (k: string, v: SignalValue) =>
    setSignals((p) => ({ ...p, [k]: v }));

  const delKey = (k: string) =>
    setSignals((p) => { const n = { ...p }; delete n[k]; return n; });

  const addKey = () => {
    const k = newKey.trim();
    if (!k || k in signals) return;
    setKey(k, parseValue(newVal));
    setNewKey("");
    setNewVal("false");
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/signals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signals),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setOriginal(signals);
      setSavedAt(new Date().toLocaleTimeString());
      setTimeout(() => setSavedAt(null), 2200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // Sort: bools first, then strings, then numbers
  const entries = Object.entries(signals).sort(([, a], [, b]) => {
    const order = (v: SignalValue) => typeof v === "boolean" ? 0 : typeof v === "string" ? 1 : 2;
    return order(a) - order(b);
  });

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">Signals</h1>
          <p className="text-sm text-muted-foreground">
            Live state flags backing rule conditions · <span className="font-mono text-[11px]">executor/signals.json</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savedAt && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Saved at {savedAt}</span>
          )}
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className={`h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
              dirty && !saving
                ? "bg-foreground text-background hover:bg-foreground/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
              <path d="M5 12l5 5L20 7"/>
            </svg>
            {saving ? "Saving…" : "Save to signals.json"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-4">
          {error}
        </div>
      )}

      {/* Kill switch callout */}
      {!loading && (
        <div className={`rounded-xl border p-4 mb-5 flex items-start gap-3 transition-colors ${
          signals.kill_switch
            ? "border-destructive/40 bg-destructive/5"
            : "border-border bg-card"
        }`}>
          <div className={`size-8 rounded-md grid place-items-center shrink-0 ${
            signals.kill_switch ? "bg-destructive/20 text-destructive" : "bg-muted text-muted-foreground"
          }`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
              <circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">
              {signals.kill_switch ? "Kill switch ENGAGED" : "Kill switch is off"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {signals.kill_switch
                ? "All rules are blocked from firing. Toggle off to resume."
                : "Flip on to immediately halt every rule from submitting orders."}
            </p>
          </div>
          <button
            onClick={() => setKey("kill_switch", !signals.kill_switch)}
            className={`shrink-0 h-8 px-3 rounded-md text-xs font-bold tracking-wider ${
              signals.kill_switch
                ? "bg-destructive text-background"
                : "border border-destructive/40 text-destructive hover:bg-destructive/10"
            }`}
          >
            {signals.kill_switch ? "DISARM" : "ENGAGE"}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-2">
              <Skeleton className="h-4 w-32"/>
              <Skeleton className="h-8 flex-1"/>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-[1fr_1.2fr_auto] gap-3 px-3 py-2 bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            <span>Key</span>
            <span>Value</span>
            <span className="w-7"/>
          </div>
          <div className="p-1">
            {entries.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">No signals. Add one below.</p>
            ) : (
              entries.map(([k, v]) => (
                <div key={k}>
                  <SignalRow
                    sigKey={k}
                    value={v}
                    onChange={(nv) => setKey(k, nv)}
                    onDelete={() => delKey(k)}
                  />
                  {USED_BY[k] && (
                    <div className="px-3 -mt-0.5 mb-0.5">
                      <span className="text-[10px] text-muted-foreground/60">used by: </span>
                      {USED_BY[k].map((u, i) => (
                        <span key={u} className="text-[10px] font-mono text-muted-foreground">
                          {i > 0 && ", "}{u}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Add row */}
          <div className="border-t border-border p-2 bg-muted/30">
            <div className="grid grid-cols-[1fr_1.2fr_auto] gap-3 items-center">
              <input
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addKey()}
                placeholder="new_signal_key"
                className="h-7 px-2 rounded-md border border-border bg-background text-xs font-mono"
              />
              <input
                value={newVal}
                onChange={(e) => setNewVal(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addKey()}
                placeholder="true / false / number / text"
                className="h-7 px-2 rounded-md border border-border bg-background text-xs font-mono"
              />
              <button
                onClick={addKey}
                disabled={!newKey.trim()}
                className="size-7 rounded-md bg-foreground text-background grid place-items-center disabled:opacity-30"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-3.5">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground text-center mt-4 font-mono">
        Bool changes propagate to evaluator on next tick (~1s). Numbers cached for 5s.
      </p>
    </div>
  );
}
