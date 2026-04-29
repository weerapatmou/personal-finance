"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export type ChartTopic = {
  topic: string;
  plan: number;
  actual: number;
};

// Match Excel donut palette: Fix Cost = dark teal, Variable = orange,
// Investment = green, Tax = light blue.
const COLORS: Record<string, string> = {
  "Fix Cost": "#2C7C8C",
  "Variable Cost": "#E07A3C",
  Investment: "#2E7D32",
  Tax: "#5BB6E8",
};

function fmtCurrency(v: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { topic: string } }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md text-sm">
      <p className="font-semibold mb-0.5">{p.payload.topic}</p>
      <p className="font-mono">{fmtCurrency(p.value)}</p>
    </div>
  );
}

// Renders the percentage centered within each slice. Labels are skipped for
// very small slices (<5%) so they don't visually overflow.
function renderSliceLabel(props: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
}) {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props;
  if (
    cx === undefined ||
    cy === undefined ||
    midAngle === undefined ||
    innerRadius === undefined ||
    outerRadius === undefined ||
    percent === undefined ||
    percent < 0.05
  ) {
    return null;
  }
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="#fff"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={12}
      fontWeight={600}
      style={{ pointerEvents: "none", textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}
    >
      {`${(percent * 100).toFixed(1)}%`}
    </text>
  );
}

function Donut({
  title,
  data,
  total,
  accentClass,
}: {
  title: string;
  data: Array<{ topic: string; value: number }>;
  total: number;
  accentClass: string;
}) {
  // Recharts hides slices with value=0 — keep only positive values for the
  // visual ring, but always show every topic in the legend below.
  const chartData = data.filter((d) => d.value > 0);
  const hasData = chartData.length > 0;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className={`px-4 py-2 text-center text-sm font-semibold ${accentClass}`}>
        {title}
      </div>
      <div className="p-4">
        <div className="relative h-64">
          {hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="topic"
                  innerRadius="55%"
                  outerRadius="88%"
                  paddingAngle={1}
                  stroke="hsl(var(--card))"
                  strokeWidth={2}
                  isAnimationActive={false}
                  label={renderSliceLabel}
                  labelLine={false}
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.topic} fill={COLORS[entry.topic] ?? "#888"} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground italic">
              No data
            </div>
          )}
          {hasData && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total
              </p>
              <p className="text-sm font-bold font-mono">{fmtCurrency(total)}</p>
            </div>
          )}
        </div>

        {/* Legend with percentages */}
        <ul className="mt-3 space-y-1.5">
          {data.map((d) => {
            const pct = total > 0 ? (d.value / total) * 100 : 0;
            return (
              <li key={d.topic} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: COLORS[d.topic] ?? "#888" }}
                  />
                  <span className="text-foreground">{d.topic}</span>
                </span>
                <span className="font-mono text-muted-foreground">
                  {fmtCurrency(d.value)}{" "}
                  <span className="ml-1 text-[10px]">{pct.toFixed(1)}%</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function MonthChart({ data }: { data: ChartTopic[] }) {
  const totalPlan = data.reduce((s, d) => s + d.plan, 0);
  const totalActual = data.reduce((s, d) => s + d.actual, 0);

  if (totalPlan === 0 && totalActual === 0) return null;

  const planSeries = data.map((d) => ({ topic: d.topic, value: d.plan }));
  const actualSeries = data.map((d) => ({ topic: d.topic, value: d.actual }));

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-5">
        Plan vs Actual
      </h2>
      <div className="grid gap-5 md:grid-cols-2">
        <Donut
          title="Plan"
          data={planSeries}
          total={totalPlan}
          accentClass="bg-blue-100 text-blue-900"
        />
        <Donut
          title="Actual"
          data={actualSeries}
          total={totalActual}
          accentClass="bg-emerald-100 text-emerald-900"
        />
      </div>
    </div>
  );
}
