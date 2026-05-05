"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Currency } from "@/lib/money";
import type { ChartMode, SerializedEnriched, Timeframe } from "./dca-types";

type Props = {
  records: SerializedEnriched[];
  mode: ChartMode;
  timeframe: Timeframe;
  displayCurrency: Currency;
};

type SeriesItem = {
  key: string;
  label: string;
  color: string;
  fill: string | undefined;
  dash: string | undefined;
  zero: boolean;
  values: number[];
  rightAxis?: boolean;
};

const SLICE_DAYS: Record<Timeframe, number> = {
  "7D": 7,
  "30D": 30,
  "60D": 60,
  "90D": 90,
  "180D": 180,
  "1Y": 365,
  "2Y": 730,
  "4Y": 1460,
  ALL: Number.POSITIVE_INFINITY,
};

function formatNum(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (abs >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
  return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

function formatFull(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function formatUnitsCompact(n: number): string {
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(8);
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

export function DcaChart({ records, mode, timeframe, displayCurrency }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [dims, setDims] = useState({ w: 800, h: 280 });
  const sym = displayCurrency === "USD" ? "$" : "฿";

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(() => {
      if (!wrapRef.current) return;
      const r = wrapRef.current.getBoundingClientRect();
      setDims({ w: r.width, h: r.height });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const data = useMemo(() => {
    const n = SLICE_DAYS[timeframe];
    return n === Number.POSITIVE_INFINITY ? records : records.slice(-n);
  }, [records, timeframe]);

  const { w, h } = dims;
  const padL = 56;
  const padR = mode === "units" ? 56 : 16;
  const padT = 20;
  const padB = 28;
  const cw = Math.max(0, w - padL - padR);
  const ch = Math.max(0, h - padT - padB);

  const series: SeriesItem[] = useMemo(() => {
    const portfolioValues = data.map((d) => Number(d.portfolioValueDisplay));
    const investedValues = data.map((d) => Number(d.cumFiatDisplay));
    const unrealizedValues = data.map((d) => Number(d.unrealizedDisplay));
    const cumUnits = data.map((d) => Number(d.cumUnits));
    const prices = data.map((d) => Number(d.unitPriceDisplay));

    if (mode === "portfolio") {
      return [
        {
          key: "portfolio",
          label: "Portfolio Value",
          color: "var(--dca-accent)",
          fill: "var(--dca-accent-line)",
          dash: undefined,
          zero: false,
          values: portfolioValues,
        },
        {
          key: "invested",
          label: "Invested",
          color: "var(--dca-fg-2)",
          dash: "4 4",
          fill: undefined,
          zero: false,
          values: investedValues,
        },
      ];
    }
    if (mode === "pnl") {
      return [
        {
          key: "unrealized",
          label: "Unrealized P/L",
          color: "var(--dca-accent)",
          fill: "var(--dca-accent-line)",
          dash: undefined,
          zero: true,
          values: unrealizedValues,
        },
      ];
    }
    if (mode === "units") {
      return [
        {
          key: "units",
          label: "Cumulative units",
          color: "var(--dca-accent)",
          fill: "var(--dca-accent-line)",
          dash: undefined,
          zero: false,
          values: cumUnits,
        },
        {
          key: "portfolio-fiat",
          label: `Portfolio (${sym})`,
          color: "var(--dca-fg)",
          fill: undefined,
          dash: undefined,
          zero: false,
          values: portfolioValues,
          rightAxis: true,
        },
        {
          key: "invested-fiat",
          label: `Invested (${sym})`,
          color: "var(--dca-fg)",
          fill: undefined,
          dash: "4 4",
          zero: false,
          values: investedValues,
          rightAxis: true,
        },
      ];
    }
    if (mode === "entries") {
      return [
        {
          key: "price",
          label: "Asset price",
          color: "var(--dca-muted)",
          fill: undefined,
          dash: undefined,
          zero: false,
          values: prices,
        },
        {
          key: "cost",
          label: "Avg cost basis",
          color: "var(--dca-fg-2)",
          dash: "4 4",
          fill: undefined,
          zero: false,
          values: data.map((_d, i) => {
            const slice = data.slice(0, i + 1);
            const totalUnits = slice.reduce((s, r) => s + Number(r.cumUnits), 0);
            // approx cost basis = cumulative fiat / cumulative units of last slice item
            const last = slice[slice.length - 1]!;
            const u = Number(last.cumUnits);
            return u > 0 ? Number(last.cumFiatDisplay) / u : 0;
          }),
        },
      ];
    }
    return [
      {
        key: "market",
        label: "Market price",
        color: "var(--dca-accent)",
        fill: undefined,
        dash: undefined,
        zero: false,
        values: prices,
      },
      {
        key: "cost",
        label: "Avg cost basis",
        color: "var(--dca-fg-2)",
        dash: "4 4",
        fill: undefined,
        zero: false,
        values: data.map((_d, i) => {
          const last = data[i]!;
          const u = Number(last.cumUnits);
          return u > 0 ? Number(last.cumFiatDisplay) / u : 0;
        }),
      },
    ];
  }, [data, mode, sym]);

  const leftVals = series.filter((s) => !s.rightAxis).flatMap((s) => s.values);
  let yMin = leftVals.length > 0 ? Math.min(...leftVals) : 0;
  let yMax = leftVals.length > 0 ? Math.max(...leftVals) : 1;
  if (series.find((s) => s.zero)) {
    yMin = Math.min(yMin, 0);
    yMax = Math.max(yMax, 0);
  }
  const yRange = yMax - yMin || 1;
  yMin -= yRange * 0.06;
  yMax += yRange * 0.06;

  const rightVals = series.filter((s) => s.rightAxis).flatMap((s) => s.values);
  let yMinR = rightVals.length > 0 ? Math.min(...rightVals) : 0;
  let yMaxR = rightVals.length > 0 ? Math.max(...rightVals) : 1;
  const yRangeR = yMaxR - yMinR || 1;
  yMinR -= yRangeR * 0.06;
  yMaxR += yRangeR * 0.06;

  const x = (i: number) =>
    padL + (data.length <= 1 ? 0 : (i / (data.length - 1)) * cw);
  const y = (v: number) => padT + ch - ((v - yMin) / (yMax - yMin)) * ch;
  const yR = (v: number) => padT + ch - ((v - yMinR) / (yMaxR - yMinR)) * ch;
  const yFn = (s: SeriesItem) => (s.rightAxis ? yR : y);

  const gridLines = 4;
  const grid = Array.from({ length: gridLines + 1 }, (_, i) => {
    const v = yMin + ((yMax - yMin) / gridLines) * i;
    return { v, y: y(v) };
  });
  const gridR = Array.from({ length: gridLines + 1 }, (_, i) => {
    const v = yMinR + ((yMaxR - yMinR) / gridLines) * i;
    return { v, y: yR(v) };
  });

  const zeroY = yMin < 0 && yMax > 0 ? y(0) : null;

  function buildPath(values: number[], withArea: boolean, yFunc: (v: number) => number): string {
    if (values.length === 0) return "";
    let d = `M ${x(0)} ${yFunc(values[0]!)}`;
    for (let i = 1; i < values.length; i++) d += ` L ${x(i)} ${yFunc(values[i]!)}`;
    if (withArea) {
      const baseY = zeroY !== null ? zeroY : padT + ch;
      d += ` L ${x(values.length - 1)} ${baseY} L ${x(0)} ${baseY} Z`;
    }
    return d;
  }

  const xTickCount = Math.min(6, data.length);
  const xTicks = Array.from({ length: xTickCount }, (_, i) => {
    const idx = Math.round((i / (xTickCount - 1 || 1)) * (data.length - 1));
    const entry = data[idx];
    return { idx, x: x(idx), date: entry ? entry.date : undefined };
  });

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    if (mx < padL) {
      setHoverIdx(null);
      return;
    }
    const rel = (mx - padL) / cw;
    const idx = Math.max(0, Math.min(data.length - 1, Math.round(rel * (data.length - 1))));
    setHoverIdx(idx);
  }

  const hovered = hoverIdx !== null ? data[hoverIdx] ?? null : null;

  const tooltipRows: { lbl: string; val: string }[] = [];
  if (hovered && hoverIdx !== null) {
    if (mode === "portfolio") {
      tooltipRows.push(
        { lbl: "Portfolio", val: formatFull(Number(hovered.portfolioValueDisplay)) + " " + sym },
        { lbl: "Invested", val: formatFull(Number(hovered.cumFiatDisplay)) + " " + sym },
        {
          lbl: "Unrealized",
          val:
            (Number(hovered.unrealizedDisplay) >= 0 ? "+" : "") +
            formatFull(Number(hovered.unrealizedDisplay)) +
            " " +
            sym,
        },
      );
    } else if (mode === "pnl") {
      tooltipRows.push(
        {
          lbl: "Unrealized",
          val:
            (Number(hovered.unrealizedDisplay) >= 0 ? "+" : "") +
            formatFull(Number(hovered.unrealizedDisplay)) +
            " " +
            sym,
        },
        { lbl: "%", val: Number(hovered.pctUnrealized).toFixed(2) + "%" },
        { lbl: "Portfolio", val: formatFull(Number(hovered.portfolioValueDisplay)) + " " + sym },
      );
    } else if (mode === "units") {
      tooltipRows.push(
        { lbl: "Cumulative", val: formatUnitsCompact(Number(hovered.cumUnits)) },
        { lbl: "This buy", val: formatUnitsCompact(Number(hovered.units)) },
        { lbl: "Portfolio", val: formatFull(Number(hovered.portfolioValueDisplay)) + " " + sym },
        { lbl: "Invested", val: formatFull(Number(hovered.cumFiatDisplay)) + " " + sym },
      );
    } else if (mode === "entries") {
      tooltipRows.push(
        { lbl: "Asset price", val: formatFull(Number(hovered.unitPriceDisplay)) + " " + sym },
        { lbl: "Bought", val: formatUnitsCompact(Number(hovered.units)) },
        { lbl: "Spent", val: formatFull(Number(hovered.fiatAmountDisplay)) + " " + sym },
      );
    } else {
      const u = Number(hovered.cumUnits);
      const costBasis = u > 0 ? Number(hovered.cumFiatDisplay) / u : 0;
      const price = Number(hovered.unitPriceDisplay);
      const spread = costBasis > 0 ? ((price - costBasis) / costBasis) * 100 : 0;
      tooltipRows.push(
        { lbl: "Market price", val: formatFull(price) + " " + sym },
        { lbl: "Avg cost", val: formatFull(costBasis) + " " + sym },
        { lbl: "Spread", val: spread.toFixed(2) + "%" },
      );
    }
  }

  return (
    <div className="dca-chart-root">
      {records.length === 0 ? (
        <div className="dca-chart-empty">
          <span>Add your first buy to see the chart</span>
        </div>
      ) : (
        <>
          <div className="dca-chart-legend">
            {series.map((s) => (
              <span key={s.key} className="dca-legend-item">
                <span
                  className="dca-legend-swatch"
                  style={{
                    background: s.dash ? "transparent" : s.color,
                    border: s.dash ? `2px dashed ${s.color}` : "none",
                    height: s.dash ? 0 : 10,
                  }}
                />
                {s.label}
              </span>
            ))}
          </div>
          <div ref={wrapRef} className="dca-chart-wrap">
            <svg
              width={w}
              height={h}
              onMouseMove={onMove}
              onMouseLeave={() => setHoverIdx(null)}
            >
              {grid.map((g, i) => (
                <g key={`grid-${i}`}>
                  <line
                    x1={padL}
                    x2={w - padR}
                    y1={g.y}
                    y2={g.y}
                    stroke="var(--dca-divider)"
                    strokeWidth="1"
                  />
                  <text
                    x={padL - 8}
                    y={g.y + 3}
                    textAnchor="end"
                    fontSize="10"
                    fill="var(--dca-muted)"
                    style={{ fontFamily: "ui-monospace, monospace" }}
                  >
                    {mode === "units" ? formatUnitsCompact(g.v) : formatNum(g.v)}
                  </text>
                </g>
              ))}
              {mode === "units" &&
                gridR.map((g, i) => (
                  <text
                    key={`gridr-${i}`}
                    x={w - padR + 8}
                    y={g.y + 3}
                    textAnchor="start"
                    fontSize="10"
                    fill="var(--dca-muted)"
                    style={{ fontFamily: "ui-monospace, monospace" }}
                  >
                    {formatNum(g.v)}
                  </text>
                ))}
              {zeroY !== null && (
                <line
                  x1={padL}
                  x2={w - padR}
                  y1={zeroY}
                  y2={zeroY}
                  stroke="var(--dca-muted)"
                  strokeWidth="1"
                  strokeDasharray="2 3"
                  opacity="0.6"
                />
              )}
              {xTicks.map((t, i) => {
                const anchor = i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle";
                return (
                  <text
                    key={`xt-${i}`}
                    x={t.x}
                    y={h - 8}
                    textAnchor={anchor}
                    fontSize="10"
                    fill="var(--dca-muted)"
                    style={{ fontFamily: "ui-monospace, monospace" }}
                  >
                    {t.date ? formatDateShort(new Date(t.date + "T00:00:00")) : ""}
                  </text>
                );
              })}
              {series.map(
                (s) =>
                  s.fill && (
                    <path
                      key={s.key + "-area"}
                      d={buildPath(s.values, true, yFn(s))}
                      fill={s.fill}
                      stroke="none"
                    />
                  ),
              )}
              {series.map((s) => (
                <path
                  key={s.key + "-line"}
                  d={buildPath(s.values, false, yFn(s))}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="1.75"
                  strokeDasharray={s.dash ?? "none"}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
              {mode === "entries" &&
                data.map((d, i) => (
                  <circle
                    key={`dot-${i}`}
                    cx={x(i)}
                    cy={y(Number(d.unitPriceDisplay))}
                    r="3.5"
                    fill="var(--dca-accent)"
                    opacity="0.75"
                  />
                ))}
              {hoverIdx !== null && (
                <g>
                  <line
                    x1={x(hoverIdx)}
                    x2={x(hoverIdx)}
                    y1={padT}
                    y2={padT + ch}
                    stroke="var(--dca-fg)"
                    strokeWidth="1"
                    strokeDasharray="2 3"
                    opacity="0.5"
                  />
                  {series.map((s) => (
                    <circle
                      key={s.key + "-hd"}
                      cx={x(hoverIdx)}
                      cy={yFn(s)(s.values[hoverIdx] ?? 0)}
                      r="4"
                      fill="var(--dca-surface)"
                      stroke={s.color}
                      strokeWidth="2"
                    />
                  ))}
                </g>
              )}
            </svg>
            {hovered && hoverIdx !== null && (
              <div
                className="dca-tooltip"
                style={{
                  left: x(hoverIdx),
                  top: 0,
                  transform:
                    x(hoverIdx) > padL + cw * 0.65
                      ? "translate(-100%, -100%)"
                      : "translate(-50%, -100%)",
                }}
              >
                <div className="dca-tooltip-date">
                  {formatDate(new Date(hovered.date + "T00:00:00"))} · Day {hovered.dayActive}
                </div>
                {tooltipRows.map((r, i) => (
                  <div className="dca-tooltip-row" key={i}>
                    <span className="dca-tooltip-lbl">{r.lbl}</span>
                    <span>{r.val}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
