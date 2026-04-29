"use client";

import { useState, useRef, useEffect } from "react";
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
  Plus,
  Loader2,
  Check,
  Search,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  upsertAssetByQuantity,
  addManualEntry,
  updateManualEntry,
  deleteHolding,
} from "@/app/portfolio/actions";

// ─── Types ────────────────────────────────────────────────────────────────────

type CategoryKey =
  | "STOCK"
  | "CRYPTO"
  | "GOLD"
  | "PF"
  | "CASH"
  | "EMERGENCY_FUND";

type ManualCategoryKey = "PF" | "CASH" | "EMERGENCY_FUND";

type SymbolResult = {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  quoteType: string;
};

interface ExistingHolding {
  id: string;
  name: string;
  assetClass: string;
  symbol: string | null;
  nativeCurrency: string;
  units: string;
}

interface Props {
  accounts: Array<{ id: string; name: string }>;
  existingHoldings: ExistingHolding[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES: Array<{
  key: CategoryKey;
  label: string;
  description: string;
  isQuantity: boolean;
}> = [
  { key: "STOCK", label: "Stock", description: "Stocks, ETFs, funds via Yahoo Finance", isQuantity: true },
  { key: "CRYPTO", label: "Cryptocurrency", description: "Bitcoin, Ethereum, and more", isQuantity: true },
  { key: "GOLD", label: "Gold", description: "Thai gold bars (baht weight)", isQuantity: true },
  { key: "PF", label: "Provident Fund", description: "Manual balance tracking", isQuantity: false },
  { key: "CASH", label: "Cash", description: "Cash & savings", isQuantity: false },
  { key: "EMERGENCY_FUND", label: "Emergency Fund", description: "Emergency reserve", isQuantity: false },
];

const COMMON_CRYPTOS = [
  { symbol: "BTC", name: "Bitcoin" },
  { symbol: "ETH", name: "Ethereum" },
  { symbol: "BNB", name: "BNB" },
  { symbol: "SOL", name: "Solana" },
  { symbol: "ADA", name: "Cardano" },
  { symbol: "XRP", name: "XRP" },
  { symbol: "DOGE", name: "Dogecoin" },
  { symbol: "DOT", name: "Polkadot" },
  { symbol: "AVAX", name: "Avalanche" },
  { symbol: "LINK", name: "Chainlink" },
  { symbol: "MATIC", name: "Polygon" },
  { symbol: "UNI", name: "Uniswap" },
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

// ─── Reusable bits ────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

function PrimaryButton({
  type = "submit",
  isLoading,
  disabled,
  children,
  onClick,
}: {
  type?: "submit" | "button";
  isLoading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isLoading || disabled}
      className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isLoading ? (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Saving…
        </span>
      ) : (
        children
      )}
    </button>
  );
}

// ─── Symbol search input ──────────────────────────────────────────────────────

interface SymbolSearchProps {
  placeholder: string;
  onSelect: (result: SymbolResult) => void;
}

function SymbolSearchInput({ placeholder, onSelect }: SymbolSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SymbolResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("mousedown", onClick);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function onChange(q: string) {
    setQuery(q);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.trim().length < 1) {
      setResults([]);
      setShowDropdown(false);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/symbol-search?q=${encodeURIComponent(q)}`);
        const data: SymbolResult[] = await res.json();
        setResults(data);
        setShowDropdown(data.length > 0);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 350);
  }

  return (
    <div className="relative" ref={containerRef}>
      <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
        {isSearching ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Search className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <input
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => results.length > 0 && setShowDropdown(true)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      {showDropdown && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-border bg-background shadow-lg">
          {results.map((r) => (
            <button
              key={r.symbol}
              type="button"
              onClick={() => {
                onSelect(r);
                setShowDropdown(false);
                setQuery("");
                setResults([]);
              }}
              className="flex w-full items-center justify-between px-4 py-2.5 text-sm hover:bg-muted"
            >
              <div className="min-w-0 text-left">
                <span className="font-medium">{r.symbol}</span>
                <span className="ml-2 truncate text-muted-foreground">{r.name}</span>
              </div>
              <span className="ml-2 shrink-0 text-xs text-muted-foreground">{r.exchange}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Quantity form (Stock/Crypto/Gold) ────────────────────────────────────────

interface QuantityFormProps {
  category: CategoryKey;
  accounts: Array<{ id: string; name: string }>;
  existingHoldings: ExistingHolding[];
  onDone: () => void;
}

function QuantityForm({ category, accounts, existingHoldings, onDone }: QuantityFormProps) {
  const router = useRouter();

  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [picked, setPicked] = useState<SymbolResult | null>(
    category === "GOLD"
      ? { symbol: "XAUBAHT", name: "Gold (Thai 99.9%)", exchange: "GOLDTRADERS_TH", currency: "THB", quoteType: "GOLD" }
      : null,
  );
  const [units, setUnits] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detect when this symbol already exists in the user's portfolio
  const matchAssetClass: string =
    category === "STOCK" ? "STOCK" : category === "CRYPTO" ? "CRYPTO" : "GOLD";
  const existingMatch = picked
    ? existingHoldings.find(
        (h) => h.symbol === picked.symbol && h.assetClass === matchAssetClass,
      )
    : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!picked || !units) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const isGold = category === "GOLD";
      let assetClass: "STOCK" | "ETF" | "CRYPTO" | "GOLD" = "STOCK";
      let unitType: "SHARES" | "COINS" | "BAHT_WEIGHT" = "SHARES";
      let nativeCurrency: "USD" | "THB" = "USD";
      let quoteSource: "YAHOO" | "GOLDTRADERS_TH" = "YAHOO";

      if (category === "STOCK") {
        assetClass = picked.quoteType === "ETF" ? "ETF" : "STOCK";
        unitType = "SHARES";
        nativeCurrency = picked.currency === "THB" ? "THB" : "USD";
        quoteSource = "YAHOO";
      } else if (category === "CRYPTO") {
        assetClass = "CRYPTO";
        unitType = "COINS";
        nativeCurrency = "USD";
        quoteSource = "YAHOO";
      } else if (isGold) {
        assetClass = "GOLD";
        unitType = "BAHT_WEIGHT";
        nativeCurrency = "THB";
        quoteSource = "GOLDTRADERS_TH";
      }

      await upsertAssetByQuantity({
        accountId,
        assetClass,
        symbol: picked.symbol,
        name: picked.name,
        units,
        nativeCurrency,
        unitType,
        quoteSource,
      });
      router.push("/portfolio");
      router.refresh();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Asset selection */}
      {category === "STOCK" && !picked && (
        <Field label="Search stock or ETF">
          <SymbolSearchInput placeholder="e.g. AAPL, QQQM, VOO" onSelect={setPicked} />
        </Field>
      )}

      {category === "CRYPTO" && !picked && (
        <>
          <Field label="Pick a coin">
            <div className="flex flex-wrap gap-2">
              {COMMON_CRYPTOS.map((c) => (
                <button
                  key={c.symbol}
                  type="button"
                  onClick={() =>
                    setPicked({
                      symbol: c.symbol,
                      name: c.name,
                      exchange: "",
                      currency: "USD",
                      quoteType: "CRYPTOCURRENCY",
                    })
                  }
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted"
                >
                  {c.symbol}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Or search">
            <SymbolSearchInput placeholder="Search crypto…" onSelect={setPicked} />
          </Field>
        </>
      )}

      {/* Picked asset confirmation */}
      {picked && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Check className="h-4 w-4 shrink-0 text-emerald-600" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-800">{picked.symbol}</p>
              <p className="truncate text-xs text-emerald-600">{picked.name}</p>
            </div>
          </div>
          {category !== "GOLD" && (
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="ml-3 text-xs text-emerald-700 hover:underline"
            >
              Change
            </button>
          )}
        </div>
      )}

      {/* Existing holding hint */}
      {picked && existingMatch && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-700">
          You already own {existingMatch.units} {existingMatch.symbol}. This will
          be added to that existing holding.
        </div>
      )}

      {/* Quantity input */}
      {picked && (
        <Field
          label={
            category === "GOLD"
              ? "Quantity (baht weight)"
              : category === "CRYPTO"
                ? "Quantity (coins)"
                : "Quantity (shares)"
          }
        >
          <input
            type="number"
            step="any"
            min="0"
            value={units}
            onChange={(e) => setUnits(e.target.value)}
            placeholder="0.00"
            required
            className={inputCls}
          />
        </Field>
      )}

      {/* Account */}
      {picked && (
        <Field label="Account">
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            required
            className={inputCls}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </Field>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {picked && (
        <div className="rounded-xl bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
          Current price will be fetched on save and used as the cost basis.
        </div>
      )}

      {picked && (
        <PrimaryButton isLoading={isSubmitting} disabled={!units || !accountId}>
          {existingMatch ? "Add to existing holding" : "Create holding"}
        </PrimaryButton>
      )}
    </form>
  );
}

// ─── Manual entry list + form (PF/Cash/Emergency) ─────────────────────────────

interface ManualSectionProps {
  category: ManualCategoryKey;
  accounts: Array<{ id: string; name: string }>;
  existingHoldings: ExistingHolding[];
  onDone: () => void;
}

function ManualSection({ category, accounts, existingHoldings, onDone }: ManualSectionProps) {
  const router = useRouter();
  const entries = existingHoldings.filter((h) => h.assetClass === category);

  type Mode =
    | { kind: "list" }
    | { kind: "create" }
    | { kind: "edit"; entry: ExistingHolding };
  const [mode, setMode] = useState<Mode>(
    entries.length === 0 ? { kind: "create" } : { kind: "list" },
  );

  function refresh() {
    router.refresh();
  }

  if (mode.kind === "list") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Manage your {CATEGORIES.find((c) => c.key === category)!.label.toLowerCase()} entries.
        </p>
        <div className="space-y-2">
          {entries.map((h) => (
            <ManualEntryRow
              key={h.id}
              entry={h}
              onEdit={() => setMode({ kind: "edit", entry: h })}
              onDeleted={refresh}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setMode({ kind: "create" })}
          className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
        >
          <Plus className="h-4 w-4" />
          Add new {CATEGORIES.find((c) => c.key === category)!.label}
        </button>
      </div>
    );
  }

  return (
    <ManualEntryForm
      category={category}
      accounts={accounts}
      mode={mode}
      onCancel={() => setMode(entries.length > 0 ? { kind: "list" } : { kind: "create" })}
      onSaved={() => {
        onDone();
        refresh();
        if (entries.length > 0) setMode({ kind: "list" });
      }}
    />
  );
}

function ManualEntryRow({
  entry,
  onEdit,
  onDeleted,
}: {
  entry: ExistingHolding;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete "${entry.name}"? This cannot be undone.`)) return;
    setIsDeleting(true);
    try {
      await deleteHolding(entry.id);
      onDeleted();
    } catch {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{entry.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {Number(entry.units).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {entry.nativeCurrency}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onEdit}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Edit"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10 disabled:opacity-50"
          aria-label="Delete"
        >
          {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

interface ManualEntryFormProps {
  category: ManualCategoryKey;
  accounts: Array<{ id: string; name: string }>;
  mode: { kind: "create" } | { kind: "edit"; entry: ExistingHolding };
  onCancel: () => void;
  onSaved: () => void;
}

function ManualEntryForm({ category, accounts, mode, onCancel, onSaved }: ManualEntryFormProps) {
  const editing = mode.kind === "edit" ? mode.entry : null;

  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [name, setName] = useState(
    editing?.name ?? (category === "EMERGENCY_FUND" ? "Emergency Fund" : ""),
  );
  const [amount, setAmount] = useState(editing?.units ?? "");
  const [currency, setCurrency] = useState<"THB" | "USD">(
    (editing?.nativeCurrency as "THB" | "USD") ?? "THB",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (editing) {
        await updateManualEntry({
          holdingId: editing.id,
          name,
          amount,
          currency,
        });
      } else {
        await addManualEntry({
          accountId,
          assetClass: category,
          name,
          amount,
          currency,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <button
        type="button"
        onClick={onCancel}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        Cancel
      </button>

      <Field label="Name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder={
            category === "PF"
              ? "e.g. Krungsri Provident Fund"
              : category === "EMERGENCY_FUND"
                ? "e.g. Emergency Fund"
                : "e.g. SCB Savings"
          }
          className={inputCls}
        />
      </Field>

      <Field label="Amount">
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
      </Field>

      {!editing && (
        <Field label="Account">
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            required
            className={inputCls}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </Field>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <PrimaryButton isLoading={isSubmitting} disabled={!name || !amount}>
        {editing ? "Save changes" : "Create entry"}
      </PrimaryButton>
    </form>
  );
}

// ─── Top-level wizard ─────────────────────────────────────────────────────────

export function NewHoldingWizard({ accounts, existingHoldings }: Props) {
  const router = useRouter();
  const [category, setCategory] = useState<CategoryKey | null>(null);

  function handleBack() {
    if (category) {
      setCategory(null);
    } else {
      router.push("/portfolio");
    }
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
          <p className="mt-0.5 text-sm text-muted-foreground">
            Choose a category
          </p>
        )}
      </div>

      {/* Step 1 */}
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

      {/* Step 2: quantity-based (Stock/Crypto/Gold) */}
      {category && CATEGORIES.find((c) => c.key === category)!.isQuantity && (
        <QuantityForm
          category={category}
          accounts={accounts}
          existingHoldings={existingHoldings}
          onDone={() => setCategory(null)}
        />
      )}

      {/* Step 2: manual (PF/Cash/Emergency) */}
      {category && !CATEGORIES.find((c) => c.key === category)!.isQuantity && (
        <ManualSection
          category={category as ManualCategoryKey}
          accounts={accounts}
          existingHoldings={existingHoldings}
          onDone={() => setCategory(null)}
        />
      )}
    </div>
  );
}
