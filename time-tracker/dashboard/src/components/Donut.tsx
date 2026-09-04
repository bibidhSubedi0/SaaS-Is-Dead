import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { formatDuration } from "../lib/format";

interface Slice {
  name: string;
  color: string;
  value: number;
}

function DonutTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-lg border border-panel-edge bg-panel px-3 py-2 text-xs shadow-lg">
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.payload.color }} />
        <span className="text-text-dim">{p.name}</span>
      </div>
      <p className="mt-0.5 font-medium text-text">
        {formatDuration(p.value, "short")} · {p.payload.percent}%
      </p>
    </div>
  );
}

export default function Donut({
  slices,
  totalSecs,
}: {
  slices: Slice[];
  totalSecs: number;
}) {
  if (totalSecs <= 0) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-2xl border border-dashed border-panel-edge text-sm text-text-faint">
        No time in this period yet.
      </div>
    );
  }

  return (
    <div className="relative h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius={62}
            outerRadius={90}
            paddingAngle={2}
            stroke="none"
          >
            {slices.map((s) => (
              <Cell key={s.name} fill={s.color} />
            ))}
          </Pie>
          <Tooltip content={<DonutTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="font-display text-lg font-semibold leading-none text-text">
          {formatDuration(totalSecs, "short")}
        </p>
        <p className="mt-1 text-[11px] text-text-faint">total</p>
      </div>
    </div>
  );
}