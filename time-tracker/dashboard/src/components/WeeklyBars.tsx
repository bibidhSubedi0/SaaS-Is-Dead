import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import type { WeeklyTotal } from "../lib/insights";
import { formatDuration } from "../lib/format";

export default function WeeklyBars({ data }: { data: WeeklyTotal[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-2xl border border-dashed border-panel-edge text-sm text-text-faint">
        No data to chart.
      </div>
    );
  }

  return (
    <div className="h-[240px] w-full rounded-2xl border border-panel-edge bg-panel p-5 shadow-panel">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={12}
            tick={{ fill: "rgb(var(--c-text-faint))", fontSize: 10.5 }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "rgb(var(--c-text-faint))", fontSize: 10.5 }}
            tickFormatter={(v) => `${(v / 3600).toFixed(0)}h`}
            width={30}
          />
          <Tooltip
            cursor={{ fill: "rgb(var(--c-panel-hover))" }}
            contentStyle={{
              background: "rgb(var(--c-panel))",
              border: "1px solid rgb(var(--c-panel-edge))",
              borderRadius: 10,
              fontSize: 12,
            }}
            formatter={(v) => [formatDuration(Number(v) || 0, "short"), "Week total"]}
            labelStyle={{ color: "rgb(var(--c-text-dim))" }}
          />
          <ReferenceLine y={0} stroke="rgb(var(--c-panel-edge))" />
          <Bar dataKey="secs" radius={[3, 3, 0, 0]} maxBarSize={26}>
            {data.map((d) => {
              const isCurrent = d.weekStart >= lastSunday();
              return (
                <Cell key={d.weekStart} fill={isCurrent ? "rgb(var(--c-amber))" : "rgb(var(--c-teal))"} opacity={isCurrent ? 1 : 0.55} />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function lastSunday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}