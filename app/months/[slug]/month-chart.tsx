"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";

export type ChartTopic = {
  topic: string;
  plan: number;
  actual: number;
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
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md text-sm">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {fmtCurrency(p.value)}
        </p>
      ))}
    </div>
  );
}

export function MonthChart({ data }: { data: ChartTopic[] }) {
  const hasData = data.some((d) => d.plan > 0 || d.actual > 0);
  if (!hasData) return null;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-5">
        Plan vs Actual
      </h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={data}
          margin={{ top: 4, right: 8, left: 16, bottom: 4 }}
          barCategoryGap="30%"
          barGap={4}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="topic"
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => fmtCurrency(v)}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
            width={80}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted)/0.3)" }} />
          <Legend
            wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }}
            formatter={(value) => (
              <span style={{ color: "hsl(var(--foreground))" }}>{value}</span>
            )}
          />
          <Bar dataKey="plan" name="Plan" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={64}>
            {data.map((entry, i) => (
              <Cell key={i} fill="#6366f1" fillOpacity={0.85} />
            ))}
          </Bar>
          <Bar dataKey="actual" name="Actual" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={64}>
            {data.map((entry) => (
              <Cell
                key={entry.topic}
                fill={entry.actual > entry.plan && entry.plan > 0 ? "#ef4444" : "#22c55e"}
                fillOpacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-2 text-xs text-muted-foreground text-center">
        Red actual bar = over budget. Amounts in THB.
      </p>
    </div>
  );
}
