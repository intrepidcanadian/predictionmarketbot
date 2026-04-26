"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Save, Sparkles, Loader2 } from "lucide-react";
import Link from "next/link";

// ── Types ────────────────────────────────────────────────────────────────────

type TriggerType =
  | "price_cross"
  | "price_move"
  | "volume_spike"
  | "orderbook_imbalance"
  | "time_before_resolution"
  | "scheduled"
  | "external_signal";

type ActionType =
  | "limit_order"
  | "marketable_order"
  | "close_position"
  | "cancel_open_orders"
  | "notify_only";

interface FormErrors {
  [key: string]: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DraftRule = Record<string, any>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function validateId(id: string): string | null {
  if (!id) return "ID is required";
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(id) && id.length < 2)
    return "ID must be URL-safe (lowercase, hyphens)";
  if (!/^[a-z0-9-]+$/.test(id)) return "ID may only contain lowercase letters, numbers, hyphens";
  return null;
}

function toStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// ── Section components ───────────────────────────────────────────────────────

function FieldRow({
  label,
  error,
  children,
  hint,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <h2 className="text-base font-semibold">{title}</h2>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

// ── Trigger sub-forms ────────────────────────────────────────────────────────

function TriggerFields({
  type,
  data,
  onChange,
  errors,
}: {
  type: TriggerType;
  data: Record<string, string>;
  onChange: (k: string, v: string) => void;
  errors: FormErrors;
}) {
  const f = (k: string, label: string, hint?: string, placeholder?: string) => (
    <FieldRow key={k} label={label} error={errors[`trigger.${k}`]} hint={hint}>
      <Input
        value={data[k] ?? ""}
        onChange={(e) => onChange(k, e.target.value)}
        placeholder={placeholder}
      />
    </FieldRow>
  );

  switch (type) {
    case "price_cross":
      return (
        <>
          {f("threshold", "Threshold (0–1)", "e.g. 0.55 for 55¢", "0.55")}
          <FieldRow label="Direction" error={errors["trigger.direction"]}>
            <Select value={data.direction ?? ""} onValueChange={(v) => onChange("direction", v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select direction…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="above">Above</SelectItem>
                <SelectItem value="below">Below</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
        </>
      );
    case "price_move":
      return (
        <>
          {f("window_seconds", "Window (seconds)", "Lookback window", "600")}
          {f("delta", "Delta", "Absolute change, e.g. -0.05 = down 5¢", "-0.05")}
          <FieldRow label="Delta kind" error={errors["trigger.delta_kind"]}>
            <Select value={data.delta_kind ?? ""} onValueChange={(v) => onChange("delta_kind", v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select kind…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="absolute">Absolute</SelectItem>
                <SelectItem value="percent">Percent</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
        </>
      );
    case "volume_spike":
      return (
        <>
          {f("window_seconds", "Window (seconds)", "", "300")}
          {f("min_volume_usd", "Min volume (USD)", "", "5000")}
        </>
      );
    case "orderbook_imbalance":
      return (
        <>
          {f("depth_usd", "Depth (USD)", "How deep to sum", "1000")}
          {f("ratio", "Ratio", "bid_size / ask_size threshold", "3.0")}
          <FieldRow label="Direction" error={errors["trigger.direction"]}>
            <Select value={data.direction ?? ""} onValueChange={(v) => onChange("direction", v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select direction…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bid_heavy">Bid heavy</SelectItem>
                <SelectItem value="ask_heavy">Ask heavy</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
        </>
      );
    case "time_before_resolution":
      return <>{f("seconds_before", "Seconds before resolution", "", "3600")}</>;
    case "scheduled":
      return <>{f("cron", "Cron expression", 'e.g. "*/15 * * * *" = every 15 minutes', "*/15 * * * *")}</>;
    case "external_signal":
      return (
        <>
          {f("signal_id", "Signal ID", "Name of the signal in signals.json", "my-signal")}
          <FieldRow label="Edge" error={errors["trigger.edge"]}>
            <Select value={data.edge ?? ""} onValueChange={(v) => onChange("edge", v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select edge…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rising">Rising (false→true)</SelectItem>
                <SelectItem value="high">High (any truthy tick)</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
        </>
      );
    default:
      return null;
  }
}

// ── Action sub-forms ─────────────────────────────────────────────────────────

function ActionFields({
  type,
  data,
  onChange,
  errors,
}: {
  type: ActionType;
  data: Record<string, string>;
  onChange: (k: string, v: string) => void;
  errors: FormErrors;
}) {
  const f = (k: string, label: string, hint?: string, placeholder?: string) => (
    <FieldRow key={k} label={label} error={errors[`action.${k}`]} hint={hint}>
      <Input
        value={data[k] ?? ""}
        onChange={(e) => onChange(k, e.target.value)}
        placeholder={placeholder}
      />
    </FieldRow>
  );

  const sideSelect = (
    <FieldRow label="Side" error={errors["action.side"]}>
      <Select value={data.side ?? ""} onValueChange={(v) => onChange("side", v ?? "")}>
        <SelectTrigger>
          <SelectValue placeholder="Select side…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="BUY">BUY</SelectItem>
          <SelectItem value="SELL">SELL</SelectItem>
        </SelectContent>
      </Select>
    </FieldRow>
  );

  switch (type) {
    case "limit_order":
      return (
        <>
          {sideSelect}
          {f("price", "Price (absolute, 0–1)", "e.g. 0.48", "0.48")}
          {f("size_usd", "Size (USD)", "Order size in dollars", "50")}
          <FieldRow label="Order type" error={errors["action.order_type"]}>
            <Select value={data.order_type ?? ""} onValueChange={(v) => onChange("order_type", v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select type…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GTC">GTC (Good Till Cancelled)</SelectItem>
                <SelectItem value="GTD">GTD (Good Till Date)</SelectItem>
                <SelectItem value="FAK">FAK (Fill and Kill)</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          {data.order_type === "GTD" && f("expiration_seconds", "Expiration (seconds)", "", "3600")}
        </>
      );
    case "marketable_order":
      return (
        <>
          {sideSelect}
          {f("size_usd", "Size (USD)", "", "50")}
          {f("max_slippage", "Max slippage (cents)", "e.g. 0.02 = 2¢", "0.02")}
        </>
      );
    case "close_position":
      return <>{f("max_slippage", "Max slippage", "", "0.03")}</>;
    case "cancel_open_orders":
      return (
        <FieldRow label="Side" error={errors["action.side"]}>
          <Select value={data.side ?? ""} onValueChange={(v) => onChange("side", v ?? "")}>
            <SelectTrigger>
              <SelectValue placeholder="Select side…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BUY">BUY</SelectItem>
              <SelectItem value="SELL">SELL</SelectItem>
              <SelectItem value="ALL">ALL</SelectItem>
            </SelectContent>
          </Select>
        </FieldRow>
      );
    case "notify_only":
      return (
        <>
          {f("channel", "Channel", 'e.g. "telegram:me"', "telegram:me")}
          <FieldRow label="Message template" error={errors["action.message_template"]}>
            <Textarea
              value={data.message_template ?? ""}
              onChange={(e) => onChange("message_template", e.target.value)}
              placeholder="Rule {{name}} fired: mid={{mid}}"
              rows={2}
            />
          </FieldRow>
        </>
      );
    default:
      return null;
  }
}

// ── Main form ─────────────────────────────────────────────────────────────────

export default function NewRulePage() {
  return (
    <Suspense>
      <NewRuleForm />
    </Suspense>
  );
}

function NewRuleForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});

  // Top-level
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [notes, setNotes] = useState("");

  // Target
  const [conditionId, setConditionId] = useState("");
  const [tokenId, setTokenId] = useState("");
  const [marketSlug, setMarketSlug] = useState("");
  const [sideLabel, setSideLabel] = useState<"YES" | "NO">("YES");

  // Trigger
  const [triggerType, setTriggerType] = useState<TriggerType | "">("");
  const [triggerData, setTriggerData] = useState<Record<string, string>>({});

  // Action
  const [actionType, setActionType] = useState<ActionType | "">("");
  const [actionData, setActionData] = useState<Record<string, string>>({});

  // Guardrails
  const [dryRun, setDryRun] = useState(true);
  const [maxPositionUsd, setMaxPositionUsd] = useState("");
  const [maxDailyLossUsd, setMaxDailyLossUsd] = useState("");
  const [cooldownSeconds, setCooldownSeconds] = useState("300");
  const [maxFiresPerDay, setMaxFiresPerDay] = useState("10");
  const [requireManualApproval, setRequireManualApproval] = useState(false);
  const [killIfLiquidityBelow, setKillIfLiquidityBelow] = useState("");
  const [disableAfter, setDisableAfter] = useState("");

  // LLM draft state
  const [draftDescription, setDraftDescription] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftResult, setDraftResult] = useState<DraftRule | null>(null);
  const [showDraftDialog, setShowDraftDialog] = useState(false);

  // Pre-fill from arb scanner
  useEffect(() => {
    if (searchParams.get("from_arb") !== "1") return;
    const question   = searchParams.get("question") ?? "";
    const condId     = searchParams.get("condition_id") ?? "";
    const tokId      = searchParams.get("token_id") ?? "";
    const side       = searchParams.get("side") as "YES" | "NO" | null;
    const price      = searchParams.get("price") ?? "";
    const kalshi     = searchParams.get("kalshi") ?? "";
    const edge       = searchParams.get("edge") ?? "";

    const ruleName = `Arb: ${question.slice(0, 60)}`;
    setName(ruleName);
    setId(slugify(ruleName));
    setNotes(`Arb with Kalshi ${kalshi} · net edge ${edge}%`);
    if (condId) setConditionId(condId);
    if (tokId)  setTokenId(tokId);
    if (side === "YES" || side === "NO") setSideLabel(side);

    setTriggerType("price_cross");
    setTriggerData({ threshold: price, direction: "below" });

    setActionType("limit_order");
    setActionData({ side: "BUY", price, size_usd: "50", order_type: "GTC" });

    setDryRun(true);
    setRequireManualApproval(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-fill ID from name
  const handleNameChange = (v: string) => {
    setName(v);
    if (!id || id === slugify(name)) {
      setId(slugify(v));
    }
  };

  const handleTriggerTypeChange = (v: TriggerType) => {
    setTriggerType(v);
    setTriggerData({});
  };

  const handleActionTypeChange = (v: ActionType) => {
    setActionType(v);
    setActionData({});
  };

  // ── LLM draft ───────────────────────────────────────────────────────────────

  async function handleGenerateDraft() {
    if (!draftDescription.trim()) return;
    setDrafting(true);
    setDraftError(null);
    try {
      const res = await fetch("/api/rules/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: draftDescription.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setDraftResult(body.rule);
      setShowDraftDialog(true);
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setDrafting(false);
    }
  }

  function applyDraft(rule: DraftRule) {
    // Top-level
    if (rule.id) setId(String(rule.id));
    if (rule.name) {
      setName(String(rule.name));
      if (!rule.id) setId(slugify(String(rule.name)));
    }
    if (typeof rule.enabled === "boolean") setEnabled(rule.enabled);
    if (rule.notes) setNotes(String(rule.notes));

    // Target
    const t = rule.target ?? {};
    if (t.condition_id) setConditionId(String(t.condition_id));
    if (t.token_id) setTokenId(String(t.token_id));
    if (t.market_slug) setMarketSlug(String(t.market_slug));
    if (t.side_label === "YES" || t.side_label === "NO") setSideLabel(t.side_label);

    // Trigger
    const tr = rule.trigger ?? {};
    if (tr.type) {
      setTriggerType(tr.type as TriggerType);
      const { type: _t, ...rest } = tr;
      void _t;
      setTriggerData(Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, toStr(v)])));
    }

    // Action
    const ac = rule.action ?? {};
    if (ac.type) {
      setActionType(ac.type as ActionType);
      const { type: _a, price_expr, ...rest } = ac;
      void _a;
      // Flatten price_expr if present (limit_order dynamic pricing → show as JSON string in price field)
      const data = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, toStr(v)]));
      if (price_expr) data.price = toStr(price_expr);
      setActionData(data);
    }

    // Guardrails
    const g = rule.guardrails ?? {};
    if (typeof g.dry_run === "boolean") setDryRun(g.dry_run);
    if (g.max_position_usd != null) setMaxPositionUsd(String(g.max_position_usd));
    if (g.max_daily_loss_usd != null) setMaxDailyLossUsd(String(g.max_daily_loss_usd));
    if (g.cooldown_seconds != null) setCooldownSeconds(String(g.cooldown_seconds));
    if (g.max_fires_per_day != null) setMaxFiresPerDay(String(g.max_fires_per_day));
    if (typeof g.require_manual_approval === "boolean") setRequireManualApproval(g.require_manual_approval);
    if (g.kill_if_liquidity_below_usd != null) setKillIfLiquidityBelow(String(g.kill_if_liquidity_below_usd));
    if (g.disable_after) setDisableAfter(String(g.disable_after));

    setShowDraftDialog(false);
    setDraftResult(null);
    setErrors({});
  }

  // ── Build rule object ────────────────────────────────────────────────────────

  function buildTrigger(): Record<string, unknown> | null {
    if (!triggerType) return null;
    const d: Record<string, unknown> = { type: triggerType };
    const num = (k: string) => {
      const v = triggerData[k];
      if (v === undefined || v === "") return undefined;
      return parseFloat(v);
    };
    const int = (k: string) => {
      const v = triggerData[k];
      if (v === undefined || v === "") return undefined;
      return parseInt(v, 10);
    };
    switch (triggerType) {
      case "price_cross":
        d.threshold = num("threshold");
        d.direction = triggerData.direction;
        break;
      case "price_move":
        d.window_seconds = int("window_seconds");
        d.delta = num("delta");
        d.delta_kind = triggerData.delta_kind;
        break;
      case "volume_spike":
        d.window_seconds = int("window_seconds");
        d.min_volume_usd = num("min_volume_usd");
        break;
      case "orderbook_imbalance":
        d.depth_usd = num("depth_usd");
        d.ratio = num("ratio");
        d.direction = triggerData.direction;
        break;
      case "time_before_resolution":
        d.seconds_before = int("seconds_before");
        break;
      case "scheduled":
        d.cron = triggerData.cron;
        break;
      case "external_signal":
        d.signal_id = triggerData.signal_id;
        d.edge = triggerData.edge;
        break;
    }
    return d;
  }

  function buildAction(): Record<string, unknown> | null {
    if (!actionType) return null;
    const d: Record<string, unknown> = { type: actionType };
    const num = (k: string) => {
      const v = actionData[k];
      if (v === undefined || v === "") return undefined;
      return parseFloat(v);
    };
    switch (actionType) {
      case "limit_order":
        d.side = actionData.side;
        d.price = num("price");
        d.size_usd = num("size_usd");
        d.order_type = actionData.order_type;
        if (actionData.order_type === "GTD") d.expiration_seconds = num("expiration_seconds");
        break;
      case "marketable_order":
        d.side = actionData.side;
        d.size_usd = num("size_usd");
        d.max_slippage = num("max_slippage");
        break;
      case "close_position":
        d.max_slippage = num("max_slippage");
        break;
      case "cancel_open_orders":
        d.side = actionData.side;
        break;
      case "notify_only":
        d.channel = actionData.channel;
        d.message_template = actionData.message_template;
        break;
    }
    return d;
  }

  function buildGuardrails(): Record<string, unknown> {
    const g: Record<string, unknown> = { dry_run: dryRun };
    if (maxPositionUsd) g.max_position_usd = parseFloat(maxPositionUsd);
    if (maxDailyLossUsd) g.max_daily_loss_usd = parseFloat(maxDailyLossUsd);
    if (cooldownSeconds) g.cooldown_seconds = parseInt(cooldownSeconds, 10);
    if (maxFiresPerDay) g.max_fires_per_day = parseInt(maxFiresPerDay, 10);
    if (requireManualApproval) g.require_manual_approval = true;
    if (killIfLiquidityBelow) g.kill_if_liquidity_below_usd = parseFloat(killIfLiquidityBelow);
    if (disableAfter) g.disable_after = disableAfter;
    return g;
  }

  function validate(): FormErrors {
    const errs: FormErrors = {};
    const idErr = validateId(id);
    if (idErr) errs.id = idErr;
    if (!name.trim()) errs.name = "Name is required";
    if (!conditionId.trim()) errs.conditionId = "Condition ID is required";
    if (!tokenId.trim()) errs.tokenId = "Token ID is required";
    if (!triggerType) errs.triggerType = "Select a trigger type";
    if (!actionType) errs.actionType = "Select an action type";

    if (triggerType === "price_cross") {
      const t = parseFloat(triggerData.threshold ?? "");
      if (isNaN(t) || t < 0 || t > 1) errs["trigger.threshold"] = "Must be 0–1";
      if (!triggerData.direction) errs["trigger.direction"] = "Required";
    }
    if (triggerType === "price_move") {
      if (!triggerData.window_seconds) errs["trigger.window_seconds"] = "Required";
      if (!triggerData.delta) errs["trigger.delta"] = "Required";
      if (!triggerData.delta_kind) errs["trigger.delta_kind"] = "Required";
    }
    if (triggerType === "volume_spike") {
      if (!triggerData.window_seconds) errs["trigger.window_seconds"] = "Required";
      if (!triggerData.min_volume_usd) errs["trigger.min_volume_usd"] = "Required";
    }
    if (triggerType === "orderbook_imbalance") {
      if (!triggerData.depth_usd) errs["trigger.depth_usd"] = "Required";
      if (!triggerData.ratio) errs["trigger.ratio"] = "Required";
      if (!triggerData.direction) errs["trigger.direction"] = "Required";
    }
    if (triggerType === "time_before_resolution") {
      if (!triggerData.seconds_before) errs["trigger.seconds_before"] = "Required";
    }
    if (triggerType === "scheduled") {
      if (!triggerData.cron) errs["trigger.cron"] = "Cron expression required";
    }
    if (triggerType === "external_signal") {
      if (!triggerData.signal_id) errs["trigger.signal_id"] = "Signal ID required";
      if (!triggerData.edge) errs["trigger.edge"] = "Edge required";
    }

    if (actionType === "limit_order") {
      if (!actionData.side) errs["action.side"] = "Required";
      const p = parseFloat(actionData.price ?? "");
      if (isNaN(p) || p < 0 || p > 1) errs["action.price"] = "Must be 0–1";
      if (!actionData.size_usd) errs["action.size_usd"] = "Required";
      if (!actionData.order_type) errs["action.order_type"] = "Required";
    }
    if (actionType === "marketable_order") {
      if (!actionData.side) errs["action.side"] = "Required";
      if (!actionData.size_usd) errs["action.size_usd"] = "Required";
    }
    if (actionType === "cancel_open_orders") {
      if (!actionData.side) errs["action.side"] = "Required";
    }

    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const trigger = buildTrigger()!;
    const action = buildAction()!;
    const guardrails = buildGuardrails();
    const now = new Date().toISOString();

    const rule = {
      id,
      name: name.trim(),
      enabled,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      target: {
        condition_id: conditionId.trim(),
        token_id: tokenId.trim(),
        market_slug: marketSlug.trim() || undefined,
        side_label: sideLabel,
      },
      trigger,
      action,
      guardrails,
      state: {
        created_at: now,
        updated_at: now,
        last_fired_at: null,
        fires_today: 0,
        status: enabled ? "armed" : "disabled",
      },
    };

    setSaving(true);
    setServerError(null);
    try {
      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rule),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      router.push("/rules");
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/rules">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Rules
          </Button>
        </Link>
        <h1 className="text-2xl font-semibold">New Rule</h1>
      </div>

      {/* LLM Draft section */}
      <Card className="mb-6 border-dashed border-2">
        <CardHeader className="pb-2">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-500" />
            Draft from description
          </h2>
          <p className="text-xs text-muted-foreground">
            Describe your rule in plain English. Claude will generate a draft — you review it before
            anything is saved.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Textarea
            value={draftDescription}
            onChange={(e) => setDraftDescription(e.target.value)}
            placeholder="e.g. Buy $50 of YES if the price drops below 40 cents, with a 10-minute cooldown and dry-run on"
            rows={3}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGenerateDraft();
            }}
          />
          {draftError && (
            <p className="text-xs text-destructive">{draftError}</p>
          )}
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={handleGenerateDraft}
              disabled={drafting || !draftDescription.trim()}
              className="gap-2"
            >
              {drafting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {drafting ? "Generating…" : "Generate Draft"}
            </Button>
            <span className="text-xs text-muted-foreground">⌘↵ to generate</span>
          </div>
        </CardContent>
      </Card>

      {serverError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-4">
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Top-level */}
        <SectionCard title="General">
          <FieldRow label="Name" error={errors.name}>
            <Input
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Buy dip on Trump debate"
            />
          </FieldRow>
          <FieldRow label="ID (slug)" error={errors.id} hint="URL-safe, auto-filled from name">
            <Input
              value={id}
              onChange={(e) => setId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder="buy-dip-trump-debate"
              className="font-mono text-sm"
            />
          </FieldRow>
          <FieldRow label="Notes (optional)">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional context about this rule"
              rows={2}
            />
          </FieldRow>
          <div className="flex items-center gap-3">
            <Switch checked={enabled} onCheckedChange={setEnabled} id="enabled" />
            <Label htmlFor="enabled" className="cursor-pointer">
              Enabled
            </Label>
          </div>
        </SectionCard>

        {/* Target */}
        <SectionCard title="Target Market">
          <FieldRow
            label="Condition ID"
            error={errors.conditionId}
            hint="From Gamma API (conditionId field)"
          >
            <Input
              value={conditionId}
              onChange={(e) => setConditionId(e.target.value.trim())}
              placeholder="0xabc123..."
              className="font-mono text-xs"
            />
          </FieldRow>
          <FieldRow label="Token ID" error={errors.tokenId} hint="CLOB outcome token ID (YES or NO side)">
            <Input
              value={tokenId}
              onChange={(e) => setTokenId(e.target.value.trim())}
              placeholder="72936..."
              className="font-mono text-xs"
            />
          </FieldRow>
          <div className="grid grid-cols-2 gap-4">
            <FieldRow label="Market slug (informational)">
              <Input
                value={marketSlug}
                onChange={(e) => setMarketSlug(e.target.value.trim())}
                placeholder="will-trump-win-2028"
              />
            </FieldRow>
            <FieldRow label="Side">
              <Select value={sideLabel} onValueChange={(v) => { if (v) setSideLabel(v as "YES" | "NO"); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="YES">YES</SelectItem>
                  <SelectItem value="NO">NO</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>
          </div>
        </SectionCard>

        {/* Trigger */}
        <SectionCard title="Trigger">
          <FieldRow label="Trigger type" error={errors.triggerType}>
            <Select
              value={triggerType}
              onValueChange={(v) => { if (v) handleTriggerTypeChange(v as TriggerType); }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select trigger type…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="price_cross">Price cross</SelectItem>
                <SelectItem value="price_move">Price move</SelectItem>
                <SelectItem value="volume_spike">Volume spike</SelectItem>
                <SelectItem value="orderbook_imbalance">Orderbook imbalance</SelectItem>
                <SelectItem value="time_before_resolution">Time before resolution</SelectItem>
                <SelectItem value="scheduled">Scheduled (cron)</SelectItem>
                <SelectItem value="external_signal">External signal</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          {triggerType && (
            <TriggerFields
              type={triggerType}
              data={triggerData}
              onChange={(k, v) => setTriggerData((p) => ({ ...p, [k]: v }))}
              errors={errors}
            />
          )}
        </SectionCard>

        {/* Action */}
        <SectionCard title="Action">
          <FieldRow label="Action type" error={errors.actionType}>
            <Select
              value={actionType}
              onValueChange={(v) => { if (v) handleActionTypeChange(v as ActionType); }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select action type…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="limit_order">Limit order</SelectItem>
                <SelectItem value="marketable_order">Marketable order</SelectItem>
                <SelectItem value="close_position">Close position</SelectItem>
                <SelectItem value="cancel_open_orders">Cancel open orders</SelectItem>
                <SelectItem value="notify_only">Notify only (no trade)</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          {actionType && (
            <ActionFields
              type={actionType}
              data={actionData}
              onChange={(k, v) => setActionData((p) => ({ ...p, [k]: v }))}
              errors={errors}
            />
          )}
        </SectionCard>

        {/* Guardrails */}
        <SectionCard title="Guardrails">
          <div className="flex items-center gap-3">
            <Switch checked={dryRun} onCheckedChange={setDryRun} id="dry-run" />
            <Label htmlFor="dry-run" className="cursor-pointer">
              Dry run (no real orders)
            </Label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FieldRow label="Max position (USD)" hint="Optional cap">
              <Input
                value={maxPositionUsd}
                onChange={(e) => setMaxPositionUsd(e.target.value)}
                placeholder="500"
                type="number"
                min="0"
              />
            </FieldRow>
            <FieldRow label="Max daily loss (USD)" hint="Optional cap">
              <Input
                value={maxDailyLossUsd}
                onChange={(e) => setMaxDailyLossUsd(e.target.value)}
                placeholder="100"
                type="number"
                min="0"
              />
            </FieldRow>
            <FieldRow label="Cooldown (seconds)">
              <Input
                value={cooldownSeconds}
                onChange={(e) => setCooldownSeconds(e.target.value)}
                placeholder="300"
                type="number"
                min="0"
              />
            </FieldRow>
            <FieldRow label="Max fires per day">
              <Input
                value={maxFiresPerDay}
                onChange={(e) => setMaxFiresPerDay(e.target.value)}
                placeholder="10"
                type="number"
                min="1"
              />
            </FieldRow>
            <FieldRow label="Kill if liquidity below (USD)" hint="Optional">
              <Input
                value={killIfLiquidityBelow}
                onChange={(e) => setKillIfLiquidityBelow(e.target.value)}
                placeholder="1000"
                type="number"
                min="0"
              />
            </FieldRow>
            <FieldRow label="Disable after (ISO date)" hint="Optional auto-expiry">
              <Input
                value={disableAfter}
                onChange={(e) => setDisableAfter(e.target.value)}
                placeholder="2026-11-03T00:00:00Z"
                type="datetime-local"
              />
            </FieldRow>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={requireManualApproval}
              onCheckedChange={setRequireManualApproval}
              id="manual-approval"
            />
            <Label htmlFor="manual-approval" className="cursor-pointer">
              Require manual approval before firing
            </Label>
          </div>
        </SectionCard>

        {/* Submit */}
        <div className="flex items-center gap-3 pb-6">
          <Button type="submit" disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save Rule"}
          </Button>
          {hasErrors && (
            <p className="text-sm text-destructive">
              Fix validation errors above before saving.
            </p>
          )}
          <Link href="/rules" className="ml-auto">
            <Button variant="ghost" type="button">
              Cancel
            </Button>
          </Link>
        </div>
      </form>

      {/* Draft review dialog */}
      <Dialog open={showDraftDialog} onOpenChange={setShowDraftDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              Review Generated Draft
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Review the generated JSON. Click &quot;Use Draft&quot; to pre-fill the form — you can still edit
            before saving. The condition_id and token_id are placeholders you must replace.
          </p>
          <div className="flex-1 overflow-auto rounded-md border bg-muted/30 p-3 min-h-0">
            <pre className="text-xs font-mono whitespace-pre-wrap break-all">
              {draftResult ? JSON.stringify(draftResult, null, 2) : ""}
            </pre>
          </div>
          <DialogFooter className="flex-shrink-0 gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setShowDraftDialog(false);
                setDraftResult(null);
              }}
            >
              Discard
            </Button>
            <Button
              onClick={() => draftResult && applyDraft(draftResult)}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              Use Draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
