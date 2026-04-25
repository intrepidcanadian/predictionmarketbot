"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

const TAGS = [
  { label: "All", value: "" },
  { label: "Politics", value: "politics" },
  { label: "Elections", value: "elections" },
  { label: "Crypto", value: "crypto" },
  { label: "Sports", value: "sports" },
  { label: "Science", value: "science" },
  { label: "Finance", value: "finance" },
  { label: "Entertainment", value: "entertainment" },
];

interface Market {
  id: string;
  question: string;
  slug: string;
  outcomes: string[] | null;
  outcomePrices: string[] | null;
  endDate: string | null;
  volume: string | null;
  liquidity: string | null;
  active: boolean;
  closed: boolean;
  tags?: { label: string; slug: string }[];
}

function fmtPrice(p: string | null | undefined): string {
  if (!p) return "—";
  const n = parseFloat(p);
  if (isNaN(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

function fmtVolume(v: string | null | undefined): string {
  if (!v) return "—";
  const n = parseFloat(v);
  if (isNaN(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

function MarketCard({ market }: { market: Market }) {
  const yes = market.outcomes?.[0] ?? "Yes";
  const no = market.outcomes?.[1] ?? "No";
  const yesPrice = market.outcomePrices?.[0];
  const noPrice = market.outcomePrices?.[1];

  return (
    <Card size="sm" className="hover:ring-primary/30 transition-all cursor-default">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-snug line-clamp-3">{market.question}</p>
          <Badge
            variant={market.closed ? "outline" : market.active ? "default" : "secondary"}
            className="shrink-0 mt-0.5"
          >
            {market.closed ? "Closed" : market.active ? "Active" : "Inactive"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-0.5">{yes}</p>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-green-500"
                style={{ width: yesPrice ? `${parseFloat(yesPrice) * 100}%` : "50%" }}
              />
            </div>
            <p className="text-sm font-semibold mt-0.5 text-green-600">{fmtPrice(yesPrice)}</p>
          </div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-0.5">{no}</p>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-red-400"
                style={{ width: noPrice ? `${parseFloat(noPrice) * 100}%` : "50%" }}
              />
            </div>
            <p className="text-sm font-semibold mt-0.5 text-red-500">{fmtPrice(noPrice)}</p>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
          <span>Vol: {fmtVolume(market.volume)}</span>
          <span>Liq: {fmtVolume(market.liquidity)}</span>
          <span>Ends: {fmtDate(market.endDate)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl ring-1 ring-foreground/10 p-3 flex flex-col gap-3">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

export default function MarketsPage() {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchMarkets = useCallback(async (q: string, t: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "40" });
      if (q) params.set("q", q);
      if (t) params.set("tag", t);
      const res = await fetch(`/api/markets?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const arr: Market[] = Array.isArray(data) ? data : data.data ?? [];
      setMarkets(arr);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch markets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchMarkets(query, tag), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, tag, fetchMarkets]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold mb-1">Markets</h1>
        <p className="text-sm text-muted-foreground">Browse Polymarket prediction markets.</p>
      </div>

      <div className="flex flex-col gap-4 mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search markets…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TAGS.map(t => (
            <button
              key={t.value}
              onClick={() => setTag(t.value)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                tag === t.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : markets.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">No markets found.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {markets.map(m => <MarketCard key={m.id} market={m} />)}
        </div>
      )}
    </div>
  );
}
