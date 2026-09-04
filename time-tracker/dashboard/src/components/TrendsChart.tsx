import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { Category, DailyCategoryPoint } from "../types";
import { pivotDailyCategoryPoints } from "../lib/stats";
import { formatDuration } from "../lib/format";

function CustomTooltip({ active, payload, label, categories }: any) {
  if (!active || !payload?.length) return null;
  const d = new Date(label + "T00:00:00");
  const dateLabel = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const rows = payload
    .filter((p: any) => p.value > 0)
    .sort((a: any, b: any) => b.value - a.value);

  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg border border-panel-edge bg-panel px-3.5 py-3 text-xs shadow-lg">
      <p className="mb-2 font-medium text-text-dim">{dateLabel}</p>
      <div className="flex flex-col gap-1.5">
        {rows.map((r: any) => {
          const cat = categories.find((c: Category) => c.id === Number(r.dataKey));
          return (
            <div key={r.dataKey} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: r.color }} />
                <span className="text-text-dim">{cat?.name}</span>
              </div>
              <span className="font-medium text-text">{formatDuration(r.value, "short")}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TrendsChart({
  categories,
  points,
  days,
}: {
  categories: Category[];
  points: DailyCategoryPoint[];
  days: number;
}) {
  const data = pivotDailyCategoryPoints(categories, points, days);
  const showEveryNth = days > 45 ? 7 : days > 21 ? 3 : 1;

  return (
    <div className="h-[300px] w-full rounded-2xl border border-panel-edge bg-panel p-5 shadow-panel">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <defs>
            {categories.map((c) => (
              <linearGradient key={c.id} id={`grad-${c.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c.color} stopOpacity={0.55} />
                <stop offset="100%" stopColor={c.color} stopOpacity={0.03} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="rgb(var(--c-panel-edge))" strokeDasharray="3 5" vertical={false} />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            interval={showEveryNth - 1}
            tick={{ fill: "rgb(var(--c-text-faint))", fontSize: 11, fontFamily: "Inter" }}
            tickFormatter={(d) => {
              const dt = new Date(d + "T00:00:00");
              return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
            }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "rgb(var(--c-text-faint))", fontSize: 11, fontFamily: "Inter" }}
            tickFormatter={(v) => `${(v / 3600).toFixed(0)}h`}
            width={32}
          />
          <Tooltip content={<CustomTooltip categories={categories} />} cursor={{ stroke: "rgb(var(--c-panel-edge))" }} />
          {categories.map((c) => (
            <Area
              key={c.id}
              type="monotone"
              dataKey={c.id}
              stackId="1"
              stroke={c.color}
              strokeWidth={1.5}
              fill={`url(#grad-${c.id})`}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
