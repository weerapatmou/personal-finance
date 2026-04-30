"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

type Slice = { name: string; value: number; color: string };

export function CategoryPieChart({ data }: { data: Slice[] }) {
  const nonZero = data.filter((d) => d.value > 0);
  if (nonZero.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
        No data yet — add a holding to get started.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={nonZero}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
        >
          {nonZero.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v: number) =>
            new Intl.NumberFormat("th-TH", {
              style: "currency",
              currency: "THB",
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            }).format(v)
          }
        />
        <Legend
          iconType="circle"
          wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
