import { useState } from "react";
import type { DayHourGridRow } from "../lib/insights";
import { formatDuration } from "../lib/format";

const SCALE = ["var(--hm-0)", "var(--hm-1)", "var(--hm-2)", "var(--hm-3)", "var(--hm-4)"];
const HOUR_TICKS = [0, 3, 6, 9, 12, 15, 18, 21];

export default function HourHeatmap({ grid }: { grid: DayHourGridRow[] }) {
  const [hover, setHover] = useState<{ dayIdx: number; hour: number; secs: number } | null>(null);

  const max = Math.max(1, ...grid.flatMap((r) => r.hours));
  const total = grid.reduce((s, r) => s + r.secs, 0);

  function colorFor(secs: number): string {
    if (secs <= 0) return SCALE[0];
    const ratio = secs / max;
    if (ratio < 0.2) return SCALE[1];
    if (ratio < 0.45) return SCALE[2];
    if (ratio < 0.75) return SCALE[3];
    return SCALE[4];
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-panel-edge bg-panel p-5 shadow-panel">
      <div className="inline-block min-w-full">
        <div className="flex items-center gap-[3px]">
          <span className="w-9 shrink-0" />
          <div className="grid gap-[3px] text-[9px] leading-[11px] text-text-faint" style={{ gridTemplateColumns: "repeat(24, 11px)" }}>
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="text-center">
                {HOUR_TICKS.includes(h) ? h : ""}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-[3px]">
          {grid.map((row) => (
            <div key={row.dayIdx} className="flex items-center gap-[3px]">
              <span className="w-9 shrink-0 pr-1 text-right text-[10px] text-text-faint">
                {row.label}
              </span>
              {row.hours.map((secs, h) => (
                <button
                  key={h}
                  onMouseEnter={() => setHover({ dayIdx: row.dayIdx, hour: h, secs })}
                  onMouseLeave={() => setHover(null)}
                  title={`${row.label} ${String(h).padStart(2, "0")}:00 — ${formatDuration(secs, "short")}`}
                  className="h-[11px] w-[11px] rounded-[2px] transition-transform hover:scale-110"
                  style={{ backgroundColor: colorFor(secs) }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-[11px] text-text-faint">
          {hover
            ? `${grid[hover.dayIdx]?.label ?? ""} · ${String(hover.hour).padStart(2, "0")}:00 · ${formatDuration(hover.secs, "short")}`
            : `${formatDuration(total, "short")} across all hours`}
        </p>
        <div className="flex items-center gap-1 text-[10px] text-text-faint">
          <span>Less</span>
          {SCALE.map((c) => (
            <span key={c} className="h-[10px] w-[10px] rounded-[2px]" style={{ backgroundColor: c }} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}