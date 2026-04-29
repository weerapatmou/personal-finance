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
} from "lucide-react";
import { createHolding } from "@/app/portfolio/actions";

// ─── Types ────────────────────────────────────────────────────────────────────

type AssetTypeKey = "STOCK_ETF" | "CRYPTO" | "GOLD" | "PF" | "CASH" | "EMERGENCY";

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
}

interface Props {
  accounts: Array<{ id: string; name: string }>;
  existingHoldings: ExistingHolding[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

type AssetTypeOption = {
  key: AssetTypeKey;
  label: string;
  description: string;
  assetClasses: string[];
  defaults: {
    assetClass: string;
    unitType: string;
    quoteSource: string;
    nativeCurrency: "USD" | "THB";
    symbol?: string;
    name?: string;
  };
};

const ASSET_TYPE_OPTIONS: AssetTypeOption[] = [
  {
    key: "STOCK_ETF",
    label: "Stock / ETF",
    description: "Individual stocks, ETFs",
    assetClasses: ["STOCK", "ETF"],
    defaults: {
      assetClass: "STOCK",
      unitType: "SHARES",
      quoteSource: "YAHOO",
      nativeCurrency: "USD",
    },
  },
  {
    key: "CRYPTO",
    label: "Cryptocurrency",
    description: "Bitcoin, Ethereum, and more",
    assetClasses: ["CRYPTO"],
    defaults: {
      assetClass: "CRYPTO",
      unitType: "COINS",
      quoteSource: "YAHOO",
      nativeCurrency: "USD",
    },
  },
  {
    key: "GOLD",
    label: "Gold",
    description: "Thai gold bars (baht weight)",
    assetClasses: ["GOLD"],
    defaults: {
      assetClass: "GOLD",
      unitType: "BAHT_WEIGHT",
      quoteSource: "GOLDTRADERS_TH",
      nativeCurrency: "THB",
      symbol: "XAUBAHT",
      name: "Gold",
    },
  },
  {
    key: "PF",
    label: "Provident Fund",
    description: "Employer provident fund",
    assetClasses: ["PF"],
    defaults: {
      assetClass: "PF",
      unitType: "THB",
      quoteSource: "MANUAL_NAV",
      nativeCurrency: "THB",
    },
  },
  {
    key: "CASH",
    label: "Cash",
    description: "Cash & savings accounts",
    assetClasses: ["CASH"],
    defaults: {
      assetClass: "CASH",
      unitType: "THB",
      quoteSource: "NONE",
      nativeCurrency: "THB",
    },
  },
  {
    key: "EMERGENCY",
    label: "Emergency Fund",
    description: "Emergency savings reserve",
    assetClasses: ["CASH"],
    defaults: {
      assetClass: "CASH",
      unitType: "THB",
      quoteSource: "NONE",
      nativeCurrency: "THB",
      name: "Emergency Fund",
    },
  },
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

function TypeIcon({ typeKey }: { typeKey: AssetTypeKey }) {
  const cls = "h-5 w-5";
  switch (typeKey) {
    case "STOCK_ETF":
      return <TrendingUp className={cls} />;
    case "CRYPTO":
      return <Zap className={cls} />;
    case "GOLD":
      return <Star className={cls} />;
    case "PF":
      return <Building2 className={cls} />;
    case "CASH":
      return <Wallet className={cls} />;
    case "EMERGENCY":
      return <Shield className={cls} />;
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function inputCls() {
  return "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";
}

function InfoBox({ text }: { text: string }) {
  return (
    <div className="rounded-xl bg-muted/50 px-4 py-3 text-xs text-muted-foreground">{text}</div>
  );
}

function SubmitButton({ isPending, disabled }: { isPending: boolean; disabled: boolean }) {
  return (
    <button
      type="submit"
      disabled={isPending || disabled}
      className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isPending ? (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Creating…
        </span>
      ) : (
        "Create holding"
      )}
    </button>
  );
}

interface CommonFieldsProps {
  accountId: string;
  accounts: Array<{ id: string; name: string }>;
  notes: string;
  onAccountChange: (v: string) => void;
  onNotesChange: (v: string) => void;
  infoText: string;
}

function CommonFields({
  accountId,
  accounts,
  notes,
  onAccountChange,
  onNotesChange,
  infoText,
}: CommonFieldsProps) {
  return (
    <>
      <Field label="Account">
        <select
          value={accountId}
          onChange={(e) => onAccountChange(e.target.value)}
          required
          className={inputCls()}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Notes (optional)">
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={2}
          className={inputCls()}
        />
      </Field>
      <InfoBox text={infoText} />
    </>
  );
}

interface SymbolSearchProps {
  searchQuery: string;
  isSearching: boolean;
  searchResults: SymbolResult[];
  showDropdown: boolean;
  placeholder: string;
  onQueryChange: (q: string) => void;
  onSelect: (r: SymbolResult) => void;
  onHideDropdown: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function SymbolSearchInput({
  searchQuery,
  isSearching,
  searchResults,
  showDropdown,
  placeholder,
  onQueryChange,
  onSelect,
  onHideDropdown,
  containerRef,
}: SymbolSearchProps) {
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
        value={searchQuery}
        onChange={(e) => onQueryChange(e.target.value)}
        onFocus={() => searchResults.length > 0 && onQueryChange(searchQuery)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      {showDropdown && searchResults.length > 0 && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-border bg-background shadow-lg">
          {searchResults.map((r, idx) => (
            <button
              key={r.symbol}
              type="button"
              onClick={() => {
                onSelect(r);
                onHideDropdown();
              }}
              className={`flex w-full items-center justify-between px-4 py-2.5 text-sm hover:bg-muted ${idx === 0 ? "rounded-t-xl" : ""} ${idx === searchResults.length - 1 ? "rounded-b-xl" : ""}`}
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

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export function NewHoldingWizard({ accounts, existingHoldings }: Props) {
  const router = useRouter();

  const [step, setStep] = useState<1 | 2>(1);
  const [selectedType, setSelectedType] = useState<AssetTypeOption | null>(null);

  // Form fields
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [assetClass, setAssetClass] = useState("STOCK");
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [unitType, setUnitType] = useState("SHARES");
  const [quoteSource, setQuoteSource] = useState("YAHOO");
  const [nativeCurrency, setNativeCurrency] = useState<"USD" | "THB">("USD");

  // Symbol search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SymbolResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState<SymbolResult | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);

  // Reuse-or-create mode (for Gold/PF/Cash/Emergency)
  const [showNewForm, setShowNewForm] = useState(false);

  // Submission
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isSearchType =
    selectedType?.key === "STOCK_ETF" || selectedType?.key === "CRYPTO";

  const relevantHoldings = selectedType
    ? existingHoldings.filter((h) =>
        selectedType.assetClasses.includes(h.assetClass),
      )
    : [];

  // Close dropdown on outside click
  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => {
      document.removeEventListener("mousedown", onOutsideClick);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  function handleSelectType(opt: AssetTypeOption) {
    const isReuse = opt.key !== "STOCK_ETF" && opt.key !== "CRYPTO";
    const relevant = existingHoldings.filter((h) =>
      opt.assetClasses.includes(h.assetClass),
    );
    setSelectedType(opt);
    setAssetClass(opt.defaults.assetClass);
    setUnitType(opt.defaults.unitType);
    setQuoteSource(opt.defaults.quoteSource);
    setNativeCurrency(opt.defaults.nativeCurrency);
    setSymbol(opt.defaults.symbol ?? "");
    setName(opt.defaults.name ?? "");
    setSelectedSymbol(null);
    setSearchQuery("");
    setSearchResults([]);
    setShowDropdown(false);
    setSubmitError(null);
    // Show new-form directly when no existing holdings or not a reuse type
    setShowNewForm(!isReuse || relevant.length === 0);
    setStep(2);
  }

  function handleBack() {
    if (step === 2) {
      setStep(1);
      setSelectedType(null);
      setShowNewForm(false);
      setSubmitError(null);
    } else {
      router.push("/portfolio");
    }
  }

  function handleSearchQueryChange(q: string) {
    setSearchQuery(q);
    if (selectedSymbol) {
      setSelectedSymbol(null);
      setName("");
      setSymbol("");
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (q.length < 1) {
      setSearchResults([]);
      setShowDropdown(false);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/symbol-search?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error("Search failed");
        const data: SymbolResult[] = await res.json();
        setSearchResults(data);
        setShowDropdown(data.length > 0);
      } catch {
        setSearchResults([]);
        setShowDropdown(false);
      } finally {
        setIsSearching(false);
      }
    }, 350);
  }

  function handleSelectSearchResult(r: SymbolResult) {
    setSelectedSymbol(r);
    setSymbol(r.symbol);
    setName(r.name);
    setNativeCurrency(r.currency === "THB" ? "THB" : "USD");
    if (selectedType?.key === "STOCK_ETF") {
      setAssetClass(r.quoteType === "ETF" ? "ETF" : "STOCK");
    }
    setSearchQuery(`${r.symbol} — ${r.name}`);
    setShowDropdown(false);
  }

  function handleSelectCrypto(c: { symbol: string; name: string }) {
    setSelectedSymbol({
      symbol: c.symbol,
      name: c.name,
      exchange: "",
      currency: "USD",
      quoteType: "CRYPTOCURRENCY",
    });
    setSymbol(c.symbol);
    setName(c.name);
    setNativeCurrency("USD");
    setSearchQuery("");
    setSearchResults([]);
    setShowDropdown(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedType || !name.trim()) return;
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await createHolding({
        accountId,
        assetClass,
        symbol: symbol || null,
        name: name.trim(),
        nativeCurrency,
        unitType,
        quoteSource,
        notes: notes.trim() || null,
      });
      router.push("/portfolio/holdings");
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to create holding",
      );
      setIsSubmitting(false);
    }
  }

  const canSubmit = name.trim().length > 0 && accountId.length > 0;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {step === 1 ? "Portfolio" : "Choose type"}
        </button>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">
          {step === 1 ? "Add holding" : `New ${selectedType!.label}`}
        </h1>
        {step === 1 && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            Choose the asset type to track
          </p>
        )}
      </div>

      {/* ── Step 1: Asset type cards ── */}
      {step === 1 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ASSET_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => handleSelectType(opt)}
              className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-all hover:border-primary/50 hover:bg-primary/5 hover:shadow-sm"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <TypeIcon typeKey={opt.key} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{opt.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{opt.description}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      {/* ── Step 2 ── */}
      {step === 2 && selectedType && (
        <div className="space-y-5">

          {/* ── Stock / ETF ── */}
          {selectedType.key === "STOCK_ETF" && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <Field label="Type">
                <div className="flex gap-2">
                  {(["STOCK", "ETF"] as const).map((cls) => (
                    <button
                      key={cls}
                      type="button"
                      onClick={() => setAssetClass(cls)}
                      className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                        assetClass === cls
                          ? "border-primary bg-primary text-white"
                          : "border-border bg-card hover:bg-muted"
                      }`}
                    >
                      {cls}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Search symbol or name">
                <SymbolSearchInput
                  searchQuery={searchQuery}
                  isSearching={isSearching}
                  searchResults={searchResults}
                  showDropdown={showDropdown}
                  placeholder="e.g. AAPL, QQQM, S&P 500"
                  onQueryChange={handleSearchQueryChange}
                  onSelect={handleSelectSearchResult}
                  onHideDropdown={() => setShowDropdown(false)}
                  containerRef={searchContainerRef}
                />
              </Field>

              {selectedSymbol && (
                <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-emerald-800">{selectedSymbol.symbol}</p>
                    <p className="text-xs text-emerald-600 truncate">
                      {selectedSymbol.name}
                      {selectedSymbol.exchange ? ` · ${selectedSymbol.exchange}` : ""}
                    </p>
                  </div>
                </div>
              )}

              <Field label="Display name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Auto-filled when you pick a symbol"
                  className={inputCls()}
                />
              </Field>

              <CommonFields
                accountId={accountId}
                accounts={accounts}
                notes={notes}
                onAccountChange={setAccountId}
                onNotesChange={setNotes}
                infoText="Price will be fetched automatically by the background price sync job."
              />

              {submitError && (
                <p className="text-sm text-destructive">{submitError}</p>
              )}
              <SubmitButton isPending={isSubmitting} disabled={!canSubmit} />
            </form>
          )}

          {/* ── Crypto ── */}
          {selectedType.key === "CRYPTO" && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <Field label="Select cryptocurrency">
                <div className="flex flex-wrap gap-2">
                  {COMMON_CRYPTOS.map((c) => (
                    <button
                      key={c.symbol}
                      type="button"
                      onClick={() => handleSelectCrypto(c)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                        selectedSymbol?.symbol === c.symbol
                          ? "border-primary bg-primary text-white"
                          : "border-border bg-card hover:bg-muted"
                      }`}
                    >
                      {c.symbol}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Or search by name / symbol">
                <SymbolSearchInput
                  searchQuery={searchQuery}
                  isSearching={isSearching}
                  searchResults={searchResults}
                  showDropdown={showDropdown}
                  placeholder="Search crypto…"
                  onQueryChange={handleSearchQueryChange}
                  onSelect={handleSelectSearchResult}
                  onHideDropdown={() => setShowDropdown(false)}
                  containerRef={searchContainerRef}
                />
              </Field>

              {selectedSymbol && (
                <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-emerald-800">{selectedSymbol.symbol}</p>
                    <p className="text-xs text-emerald-600">{selectedSymbol.name}</p>
                  </div>
                </div>
              )}

              <Field label="Display name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Auto-filled when you pick a coin"
                  className={inputCls()}
                />
              </Field>

              <CommonFields
                accountId={accountId}
                accounts={accounts}
                notes={notes}
                onAccountChange={setAccountId}
                onNotesChange={setNotes}
                infoText="Price will be fetched automatically by the background price sync job."
              />

              {submitError && (
                <p className="text-sm text-destructive">{submitError}</p>
              )}
              <SubmitButton isPending={isSubmitting} disabled={!canSubmit} />
            </form>
          )}

          {/* ── Gold / PF / Cash / Emergency: reuse or create ── */}
          {!isSearchType && (
            <>
              {/* List of existing holdings of this type */}
              {!showNewForm && relevantHoldings.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Select an existing holding to open it, or add a new one below.
                  </p>
                  <div className="space-y-2">
                    {relevantHoldings.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => router.push(`/portfolio/holdings/${h.id}`)}
                        className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-left transition-all hover:border-primary/50 hover:bg-primary/5"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{h.name}</p>
                          {h.symbol && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{h.symbol}</p>
                          )}
                        </div>
                        <ChevronRight className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNewForm(true)}
                    className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
                  >
                    <Plus className="h-4 w-4" />
                    Add new {selectedType.label}
                  </button>
                </div>
              )}

              {/* New holding form */}
              {showNewForm && (
                <form onSubmit={handleSubmit} className="space-y-5">
                  {relevantHoldings.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowNewForm(false)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <ArrowLeft className="h-3 w-3" />
                      Back to existing
                    </button>
                  )}

                  <Field label="Display name">
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder={
                        selectedType.key === "GOLD"
                          ? "e.g. Gold"
                          : selectedType.key === "PF"
                            ? "e.g. Krungsri Provident Fund"
                            : selectedType.key === "EMERGENCY"
                              ? "e.g. Emergency Fund"
                              : "e.g. USD Cash"
                      }
                      className={inputCls()}
                    />
                  </Field>

                  {selectedType.key === "PF" && (
                    <Field label="Symbol (optional — used for Manual NAV tracking)">
                      <input
                        value={symbol}
                        onChange={(e) => setSymbol(e.target.value)}
                        placeholder="e.g. KF_PF"
                        className={inputCls()}
                      />
                    </Field>
                  )}

                  <CommonFields
                    accountId={accountId}
                    accounts={accounts}
                    notes={notes}
                    onAccountChange={setAccountId}
                    onNotesChange={setNotes}
                    infoText={
                      selectedType.key === "GOLD"
                        ? "Thai gold bar price (99.9% purity) fetched automatically from goldtraders.or.th."
                        : selectedType.key === "PF"
                          ? "You can enter NAV values manually from the holding detail page."
                          : "Cash holdings track balance via transactions — no automatic price fetch."
                    }
                  />

                  {submitError && (
                    <p className="text-sm text-destructive">{submitError}</p>
                  )}
                  <SubmitButton isPending={isSubmitting} disabled={!canSubmit} />
                </form>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
