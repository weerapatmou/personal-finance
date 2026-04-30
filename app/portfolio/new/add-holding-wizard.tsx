"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  TrendingUp,
  Zap,
  Star,
  Building2,
  Wallet,
  Shield,
  ChevronRight,
  Loader2,
  Check,
} from "lucide-react";
import {
  addAssetUnits,
  addManualHolding,
} from "@/app/portfolio/actions";
import { AssetSearchInput } from "@/app/portfolio/asset-search-input";
import type { AssetSearchHit } from "@/app/api/asset-search/route";

type CategoryKey = "STOCK" | "CRYPTO" | "GOLD" | "PF" | "CASH" | "EMERGENCY_FUND";

const CATEGORIES: Array<{
  key: CategoryKey;
  label: string;
  description: string;
  isQuantity: boolean;
}> = [
  { key: "STOCK", label: "Stock", description: "Stocks, ETFs, mutual funds (Yahoo Finance)", isQuantity: true },
  { key: "CRYPTO", label: "Cryptocurrency", description: "Bitcoin, Ethereum, etc. (CoinGecko)", isQuantity: true },
  { key: "GOLD", label: "Gold", description: "Thai gold bars (baht weight)", isQuantity: true },
  { key: "PF", label: "Provident Fund", description: "Manual balance tracking", isQuantity: false },
  { key: "CASH", label: "Cash", description: "Cash & savings accounts", isQuantity: false },
  { key: "EMERGENCY_FUND", label: "Emergency Fund", description: "Emergency reserve", isQuantity: false },
];

function CategoryIcon({ k }: { k: CategoryKey }) {
  const cls = "h-5 w-5";
  switch (k) {
    case "STOCK": return <TrendingUp className={cls} />;
    case "CRYPTO": return <Zap className={cls} />;
    case "GOLD": return <Star className={cls} />;
    case "PF": return <Building2 className={cls} />;
    case "CASH": return <Wallet className={cls} />;
    case "EMERGENCY_FUND": return <Shield className={cls} />;
  }
}

const inputCls =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

export function AddHoldingWizard() {
  const router = useRouter();
  const [category, setCategory] = useState<CategoryKey | null>(null);

  function handleBack() {
    if (category) setCategory(null);
    else router.push("/portfolio");
  }

  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {category ? "Change type" : "Portfolio"}
        </button>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">
          {category ? CATEGORIES.find((c) => c.key === category)!.label : "Add holding"}
        </h1>
        {!category && (
          <p className="mt-0.5 text-sm text-muted-foreground">Choose a category</p>
        )}
      </div>

      {!category && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-all hover:border-primary/50 hover:bg-primary/5 hover:shadow-sm"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <CategoryIcon k={c.key} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{c.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{c.description}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      {category === "STOCK" && <StockOrCryptoForm category="STOCK" />}
      {category === "CRYPTO" && <StockOrCryptoForm category="CRYPTO" />}
      {category === "GOLD" && <GoldForm />}
      {(category === "PF" || category === "CASH" || category === "EMERGENCY_FUND") && (
        <ManualForm category={category} />
      )}
    </div>
  );
}

// ─── Stock / Crypto ──────────────────────────────────────────────────────────

function StockOrCryptoForm({ category }: { category: "STOCK" | "CRYPTO" }) {
  const router = useRouter();
  const [picked, setPicked] = useState<AssetSearchHit | null>(null);
  const [units, setUnits] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!picked || !units) return;
    setError(null);
    setSubmitting(true);
    try {
      const source = picked.kind === "stock" ? "YAHOO" : "COINGECKO";
      const currency: "THB" | "USD" =
        picked.kind === "stock" && picked.currency === "THB" ? "THB" : "USD";
      await addAssetUnits({
        category,
        symbol: picked.symbol,
        displayName: picked.name,
        source,
        currency,
        units,
      });
      router.push("/portfolio");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {!picked && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Search {category === "STOCK" ? "stock or ETF" : "cryptocurrency"}
          </label>
          <AssetSearchInput
            category={category === "STOCK" ? "stock" : "crypto"}
            placeholder={category === "STOCK" ? "e.g. AAPL, QQQM" : "e.g. bitcoin, ethereum"}
            onSelect={setPicked}
          />
        </div>
      )}

      {picked && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Check className="h-4 w-4 shrink-0 text-emerald-600" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-800">
                {picked.kind === "crypto" ? picked.ticker.toUpperCase() : picked.symbol}
              </p>
              <p className="truncate text-xs text-emerald-600">{picked.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="ml-3 text-xs text-emerald-700 hover:underline"
          >
            Change
          </button>
        </div>
      )}

      {picked && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Quantity {category === "CRYPTO" ? "(coins)" : "(shares)"}
          </label>
          <input
            type="number"
            step="any"
            min="0"
            value={units}
            onChange={(e) => setUnits(e.target.value)}
            required
            placeholder="0.00"
            className={inputCls}
          />
        </div>
      )}

      {picked && (
        <div className="rounded-xl bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
          Current price will be fetched on save. If you already own this asset,
          this quantity will be added to your existing position.
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {picked && (
        <button
          type="submit"
          disabled={submitting || !units}
          className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </span>
          ) : (
            "Add to portfolio"
          )}
        </button>
      )}
    </form>
  );
}

// ─── Gold ────────────────────────────────────────────────────────────────────

function GoldForm() {
  const router = useRouter();
  const [units, setUnits] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!units) return;
    setError(null);
    setSubmitting(true);
    try {
      await addAssetUnits({
        category: "GOLD",
        symbol: "XAUBAHT",
        displayName: "Gold (Thai 99.9%)",
        source: "GOLDTRADERS_TH",
        currency: "THB",
        units,
      });
      router.push("/portfolio");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
        <p className="font-semibold text-emerald-800">Thai gold bar (99.9% purity)</p>
        <p className="text-xs text-emerald-600">
          Priced in THB per baht weight via goldtraders.or.th
        </p>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Quantity (baht weight)
        </label>
        <input
          type="number"
          step="any"
          min="0"
          value={units}
          onChange={(e) => setUnits(e.target.value)}
          required
          placeholder="e.g. 1.0"
          className={inputCls}
        />
      </div>
      <div className="rounded-xl bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
        Adds to your existing Gold holding if you already own some.
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !units}
        className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving…
          </span>
        ) : (
          "Add to portfolio"
        )}
      </button>
    </form>
  );
}

// ─── Manual: PF / Cash / Emergency Fund ──────────────────────────────────────

function ManualForm({ category }: { category: "PF" | "CASH" | "EMERGENCY_FUND" }) {
  const router = useRouter();
  const [name, setName] = useState(category === "EMERGENCY_FUND" ? "Emergency Fund" : "");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"THB" | "USD">("THB");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !amount) return;
    setError(null);
    setSubmitting(true);
    try {
      await addManualHolding({ category, name, amount, currency });
      router.push("/portfolio");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSubmitting(false);
    }
  }

  const placeholder =
    category === "PF"
      ? "e.g. Krungsri Provident Fund"
      : category === "EMERGENCY_FUND"
        ? "e.g. Emergency Fund"
        : "e.g. SCB Savings";

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder={placeholder}
          className={inputCls}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Amount</label>
        <div className="flex gap-2">
          <input
            type="number"
            step="any"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            placeholder="0.00"
            className={inputCls + " flex-1"}
          />
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as "THB" | "USD")}
            className={inputCls + " w-28"}
          >
            <option value="THB">฿ THB</option>
            <option value="USD">$ USD</option>
          </select>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !name || !amount}
        className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving…
          </span>
        ) : (
          "Add entry"
        )}
      </button>
    </form>
  );
}
