"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { Currency } from "@/lib/money";
import {
  ACCENTS,
  type Accent,
  type ChartMode,
  type SerializedEnriched,
  type SerializedEntry,
  type SerializedSettings,
  type SerializedSummary,
  type Timeframe,
} from "./dca-types";
import { DcaChart } from "./dca-chart";
import {
  addDcaEntry,
  deleteDcaEntry,
  editDcaEntry,
  upsertDcaSettings,
} from "../actions";
import "./dca.css";

type Props = {
  entries: SerializedEntry[];
  enriched: SerializedEnriched[];
  summary: SerializedSummary;
  delta24: { delta: string; pct: string } | null;
  priceStale: boolean;
  displayCurrency: Currency;
  settings: SerializedSettings;
  holdingUnits: string;
};

const TIMEFRAMES: Timeframe[] = ["7D", "30D", "60D", "90D", "180D", "1Y", "2Y", "4Y", "ALL"];
const MODES: { key: ChartMode; label: string }[] = [
  { key: "portfolio", label: "Portfolio" },
  { key: "pnl", label: "P/L" },
  { key: "cost", label: "Cost vs Price" },
  { key: "units", label: "Units" },
  { key: "entries", label: "Entries" },
];

function fmt(n: string | number, decimals = 2): string {
  const v = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtUnits(n: string | number): string {
  const v = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(8).replace(/\.?0+$/, "");
}

function fmtPct(n: string | number, decimals = 2): string {
  const v = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(v)) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(decimals) + "%";
}

export function DcaDashboard({
  entries,
  enriched,
  summary,
  delta24,
  priceStale,
  displayCurrency,
  settings,
  holdingUnits,
}: Props) {
  const [theme, setTheme] = useState<"light" | "dark">(settings.theme);
  const [accent, setAccent] = useState<Accent>(
    ACCENTS.find((a) => a.name === settings.accent) ?? ACCENTS[0]!,
  );
  const [timeframe, setTimeframe] = useState<Timeframe>(settings.graphRange);
  const [mode, setMode] = useState<ChartMode>("portfolio");
  const [showAdd, setShowAdd] = useState(false);
  const [showTweaks, setShowTweaks] = useState(false);
  const [editingGoal, setEditingGoal] = useState<"fiat" | "units" | null>(null);
  const [editing, setEditing] = useState<SerializedEntry | null>(null);
  const [, startTransition] = useTransition();

  // Apply theme/accent vars on the dashboard root via inline CSS variables
  // (scoped to .dca-root so the rest of the app is untouched).
  const rootStyle = useMemo<React.CSSProperties>(
    () => ({
      ["--dca-accent" as string]: accent.hex,
      ["--dca-accent-strong" as string]: accent.strong,
      ["--dca-accent-soft" as string]: accent.soft,
      ["--dca-accent-line" as string]: accent.line,
    }),
    [accent],
  );

  function persistSettings(patch: Partial<SerializedSettings>) {
    startTransition(() => {
      void upsertDcaSettings({
        theme: patch.theme ?? theme,
        accent: patch.accent ?? accent.name,
        graphRange: patch.graphRange ?? timeframe,
        ...(patch.goalFiat !== undefined && { goalFiat: patch.goalFiat }),
        ...(patch.goalFiatCurrency !== undefined && {
          goalFiatCurrency: patch.goalFiatCurrency,
        }),
        ...(patch.goalUnits !== undefined && { goalUnits: patch.goalUnits }),
      }).catch(() => {
        /* silent — UI optimistic */
      });
    });
  }

  useEffect(() => {
    persistSettings({ theme });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  useEffect(() => {
    persistSettings({ accent: accent.name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accent]);

  useEffect(() => {
    persistSettings({ graphRange: timeframe });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe]);

  const sym = displayCurrency === "USD" ? "$" : "฿";
  const pnl = Number(summary.pctProfitLoss);
  const unrealized =
    Number(summary.marketValueDisplay) - Number(summary.spendDisplay);

  return (
    <div className={`dca-root ${theme === "dark" ? "dca-dark" : ""}`} style={rootStyle}>
      <div className="dca-shell">
        {/* Topbar */}
        <header className="dca-topbar">
          <div className="dca-brand">
            <div className="dca-brand-mark" style={{ background: accent.hex }}>
              ₿
            </div>
            <div>
              <div className="dca-brand-name">DCA Tracker</div>
              <div className="dca-brand-sub">cost averaging · {displayCurrency}</div>
            </div>
          </div>
          <div className="dca-topbar-actions">
            {priceStale && <span className="dca-stale">no live price</span>}
            <button
              className="dca-btn"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle dark mode"
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>
            <button className="dca-btn" onClick={() => setShowTweaks((v) => !v)}>
              ◐ Theme
            </button>
            <button className="dca-btn dca-btn-primary" onClick={() => setShowAdd(true)}>
              + Add buy
            </button>
          </div>
        </header>

        {/* PNL hero + chart */}
        <div className="dca-hero">
          <div className="dca-pnl-card">
            <div className="dca-pnl-head">
              <span>Portfolio P/L</span>
              {delta24 && (
                <span
                  className={
                    "dca-pnl-delta " + (Number(delta24.delta) >= 0 ? "pos" : "neg")
                  }
                >
                  {fmtPct(delta24.pct)} 24h
                </span>
              )}
            </div>
            <div className="dca-pnl-value">
              <span className={unrealized >= 0 ? "pos" : "neg"}>
                {(unrealized >= 0 ? "+" : "") + fmt(unrealized, 2)} {sym}
              </span>
              <span className="dca-pnl-pct">{fmtPct(summary.pctProfitLoss)}</span>
            </div>
            <div className="dca-pnl-holding">
              <div className="dca-lbl">BTC holding</div>
              <div className="dca-pnl-holding-row">
                <div className="dca-num dca-pnl-holding-val">
                  {fmtUnits(holdingUnits)} <span className="dca-muted-sym">BTC</span>
                </div>
                <div className="dca-num dca-pnl-holding-fiat">
                  {fmt(Number(holdingUnits) * Number(summary.currentPriceDisplay))}{" "}
                  <span className="dca-muted-sym">{sym}</span>
                </div>
              </div>
              {Number(holdingUnits) !== Number(summary.totalUnits) && (
                <div className="dca-pnl-holding-sub">
                  DCA-tracked: {fmtUnits(summary.totalUnits)}
                </div>
              )}
            </div>
            <div className="dca-pnl-grid">
              <div>
                <div className="dca-lbl">Market</div>
                <div className="dca-num">
                  {fmt(summary.marketValueDisplay)} {sym}
                </div>
              </div>
              <div>
                <div className="dca-lbl">Invested</div>
                <div className="dca-num">
                  {fmt(summary.spendDisplay)} {sym}
                </div>
              </div>
              <div>
                <div className="dca-lbl">Avg cost</div>
                <div className="dca-num">
                  {fmt(summary.averageCostDisplay)} {sym}
                </div>
              </div>
              <div>
                <div className="dca-lbl">Current</div>
                <div className="dca-num">
                  {fmt(summary.currentPriceDisplay)} {sym}
                </div>
              </div>
            </div>
          </div>

          <div className="dca-chart-card">
            <div className="dca-chart-controls">
              <div className="dca-modes">
                {MODES.map((m) => (
                  <button
                    key={m.key}
                    className={"dca-mode " + (mode === m.key ? "active" : "")}
                    onClick={() => setMode(m.key)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="dca-timeframes">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf}
                    className={"dca-tf " + (timeframe === tf ? "active" : "")}
                    onClick={() => setTimeframe(tf)}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>
            <div className="dca-chart-body">
              <DcaChart
                records={enriched}
                mode={mode}
                timeframe={timeframe}
                displayCurrency={displayCurrency}
              />
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="dca-stats">
          <Stat label="Total spent" value={`${fmt(summary.spendDisplay)} ${sym}`} />
          <Stat label="Total BTC" value={`${fmtUnits(holdingUnits)} BTC`} />
          <Stat label="Days" value={String(summary.numberOfDays)} />
          <Stat
            label="Max drawdown"
            value={fmtPct(summary.maxDrawdownPct)}
            tone={Number(summary.maxDrawdownPct) < 0 ? "neg" : "neu"}
          />
          <Stat
            label="Best entry"
            value={
              summary.bestEntryDate
                ? `${fmtPct(summary.bestEntryGainPct)} · ${summary.bestEntryDate}`
                : "—"
            }
            tone="pos"
          />
          <Stat
            label="Worst entry"
            value={
              summary.worstEntryDate
                ? `${fmtPct(summary.worstEntryLossPct)} · ${summary.worstEntryDate}`
                : "—"
            }
            tone="neg"
          />
        </div>

        {/* Goals */}
        <div className="dca-goals">
          <div className="dca-goal">
            <div className="dca-goal-head">
              <span>Fiat goal</span>
              <button
                className="dca-num dca-goal-num"
                onClick={() => setEditingGoal("fiat")}
                title="Click to set goal"
              >
                {settings.goalFiat
                  ? `${fmt(settings.goalFiat)} ${settings.goalFiatCurrency}`
                  : "set goal"}
              </button>
            </div>
            <div className="dca-progress">
              <div
                className="dca-progress-fill"
                style={{
                  width: `${Math.min(100, Math.max(0, Number(summary.progressFiatPct)))}%`,
                }}
              />
            </div>
            <div className="dca-goal-pct">{fmt(summary.progressFiatPct, 1)}%</div>
          </div>

          <div className="dca-goal">
            <div className="dca-goal-head">
              <span>Units goal</span>
              <button
                className="dca-num dca-goal-num"
                onClick={() => setEditingGoal("units")}
                title="Click to set goal"
              >
                {settings.goalUnits ? fmtUnits(settings.goalUnits) : "set goal"}
              </button>
            </div>
            <div className="dca-progress">
              <div
                className="dca-progress-fill"
                style={{
                  width: `${Math.min(100, Math.max(0, Number(summary.progressUnitsPct)))}%`,
                }}
              />
            </div>
            <div className="dca-goal-pct">{fmt(summary.progressUnitsPct, 1)}%</div>
          </div>
        </div>

        {/* Records table */}
        <div className="dca-table-wrap">
          <table className="dca-table">
            <thead>
              <tr>
                <th>Date</th>
                <th className="r">Spent</th>
                <th className="r">Price</th>
                <th className="r">Units</th>
                <th className="r">Cum.</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="dca-empty">
                    No buys yet. Click <em>Add buy</em> to start.
                  </td>
                </tr>
              ) : (
                entries
                  .slice()
                  .reverse()
                  .map((e) => {
                    const enr = enriched.find((x) => x.id === e.id);
                    return (
                      <tr key={e.id}>
                        <td>{e.date}</td>
                        <td className="r dca-num">
                          {fmt(e.fiatAmount)} {e.fiatCurrency}
                        </td>
                        <td className="r dca-num">
                          {fmt(e.unitPrice)} {e.fiatCurrency}
                        </td>
                        <td className="r dca-num">{fmtUnits(e.units)}</td>
                        <td className="r dca-num">
                          {enr ? fmtUnits(enr.cumUnits) : "—"}
                        </td>
                        <td className="r">
                          <button className="dca-btn-ghost" onClick={() => setEditing(e)}>
                            edit
                          </button>
                          <button
                            className="dca-btn-ghost dca-btn-danger"
                            onClick={() => {
                              if (confirm("Delete this entry?")) {
                                startTransition(() => {
                                  void deleteDcaEntry(e.id);
                                });
                              }
                            }}
                          >
                            del
                          </button>
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tweaks panel */}
      {showTweaks && (
        <div className="dca-tweaks">
          <div className="dca-tweaks-head">
            <span>Theme</span>
            <button onClick={() => setShowTweaks(false)}>✕</button>
          </div>
          <div className="dca-tweaks-label">Accent color</div>
          <div className="dca-swatches">
            {ACCENTS.map((a) => (
              <button
                key={a.name}
                className={"dca-swatch " + (accent.name === a.name ? "selected" : "")}
                style={{ background: a.hex }}
                title={a.name}
                onClick={() => setAccent(a)}
              />
            ))}
          </div>
          <div className="dca-tweaks-label">Selected · {accent.name}</div>
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <EntryModal
          title="Add buy"
          currentPriceDisplay={summary.currentPriceDisplay}
          displayCurrency={displayCurrency}
          onCancel={() => setShowAdd(false)}
          onSubmit={(payload) => {
            startTransition(() => {
              void addDcaEntry(payload).then(() => setShowAdd(false));
            });
          }}
        />
      )}

      {/* Edit modal */}
      {editing && (
        <EntryModal
          title="Edit buy"
          initial={editing}
          currentPriceDisplay={summary.currentPriceDisplay}
          displayCurrency={displayCurrency}
          onCancel={() => setEditing(null)}
          onSubmit={(payload) => {
            startTransition(() => {
              void editDcaEntry({ id: editing.id, ...payload }).then(() => setEditing(null));
            });
          }}
        />
      )}

      {/* Goal editor */}
      {editingGoal && (
        <GoalModal
          kind={editingGoal}
          settings={settings}
          onCancel={() => setEditingGoal(null)}
          onSubmit={(patch) => {
            startTransition(() => {
              void upsertDcaSettings({
                theme,
                accent: accent.name,
                graphRange: timeframe,
                ...patch,
              }).then(() => setEditingGoal(null));
            });
          }}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg" | "neu";
}) {
  return (
    <div className="dca-stat">
      <div className="dca-lbl">{label}</div>
      <div className={"dca-num dca-stat-val " + (tone === "pos" ? "pos" : tone === "neg" ? "neg" : "")}>
        {value}
      </div>
    </div>
  );
}

function EntryModal({
  title,
  initial,
  currentPriceDisplay,
  displayCurrency,
  onCancel,
  onSubmit,
}: {
  title: string;
  initial?: SerializedEntry;
  currentPriceDisplay: string;
  displayCurrency: Currency;
  onCancel: () => void;
  onSubmit: (payload: {
    date: string;
    fiatAmount: string;
    fiatCurrency: Currency;
    units: string;
    unitPrice: string;
    note?: string | null;
  }) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(initial?.date ?? today);
  const [fiatAmount, setFiatAmount] = useState(initial?.fiatAmount ?? "");
  const [fiatCurrency, setFiatCurrency] = useState<Currency>(
    initial?.fiatCurrency ?? displayCurrency,
  );
  const [unitPrice, setUnitPrice] = useState(
    initial?.unitPrice ?? (Number(currentPriceDisplay) || ""),
  );
  const [note, setNote] = useState(initial?.note ?? "");

  const units = useMemo(() => {
    const f = Number(fiatAmount);
    const p = Number(unitPrice);
    if (!Number.isFinite(f) || !Number.isFinite(p) || p <= 0) return "";
    return (f / p).toFixed(10);
  }, [fiatAmount, unitPrice]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !fiatAmount || !unitPrice || !units) return;
    onSubmit({
      date,
      fiatAmount: String(fiatAmount),
      fiatCurrency,
      unitPrice: String(unitPrice),
      units,
      note: note.trim() ? note.trim() : null,
    });
  }

  return (
    <div className="dca-modal-backdrop" onClick={onCancel}>
      <form className="dca-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="dca-modal-head">
          <span>{title}</span>
          <button type="button" onClick={onCancel}>
            ✕
          </button>
        </div>
        <label>
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>
        <label>
          Spent
          <div className="dca-row">
            <input
              type="number"
              step="0.01"
              min="0"
              value={fiatAmount}
              onChange={(e) => setFiatAmount(e.target.value)}
              required
            />
            <select
              value={fiatCurrency}
              onChange={(e) => setFiatCurrency(e.target.value as Currency)}
            >
              <option value="THB">THB</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </label>
        <label>
          Price per unit ({fiatCurrency})
          <input
            type="number"
            step="0.0001"
            min="0"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            required
          />
        </label>
        <label>
          Units (auto)
          <input value={units} disabled />
        </label>
        <label>
          Note
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="dca-modal-actions">
          <button type="button" className="dca-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="dca-btn dca-btn-primary">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

function GoalModal({
  kind,
  settings,
  onCancel,
  onSubmit,
}: {
  kind: "fiat" | "units";
  settings: SerializedSettings;
  onCancel: () => void;
  onSubmit: (patch: {
    goalFiat?: string | null;
    goalFiatCurrency?: Currency;
    goalUnits?: string | null;
  }) => void;
}) {
  const [value, setValue] = useState(
    kind === "fiat" ? settings.goalFiat ?? "" : settings.goalUnits ?? "",
  );
  const [cur, setCur] = useState<Currency>(settings.goalFiatCurrency);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (kind === "fiat") {
      onSubmit({ goalFiat: value.trim() || null, goalFiatCurrency: cur });
    } else {
      onSubmit({ goalUnits: value.trim() || null });
    }
  }

  return (
    <div className="dca-modal-backdrop" onClick={onCancel}>
      <form className="dca-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="dca-modal-head">
          <span>{kind === "fiat" ? "Fiat goal" : "Units goal"}</span>
          <button type="button" onClick={onCancel}>
            ✕
          </button>
        </div>
        <label>
          Target
          <div className="dca-row">
            <input
              type="number"
              step="0.0001"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            {kind === "fiat" && (
              <select value={cur} onChange={(e) => setCur(e.target.value as Currency)}>
                <option value="THB">THB</option>
                <option value="USD">USD</option>
              </select>
            )}
          </div>
        </label>
        <div className="dca-modal-actions">
          <button type="button" className="dca-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="dca-btn dca-btn-primary">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

