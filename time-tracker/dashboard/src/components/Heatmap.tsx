import { useMemo, useState } from "react";
import { formatDuration } from "../lib/format";

interface DayTotal {
  date: string;
  total_secs: number;
}

const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const CELL_COLORS = ["var(--hm-0)", "var(--hm-1)", "var(--hm-2)", "var(--hm-3)", "var(--hm-4)"];

export default function Heatmap({
  daily,
  onSelectDay,
}: {
  daily: DayTotal[];
  onSelectDay?: (date: string) => void;
}) {
  const [hover, setHover] = useState<DayTotal | null>(null);

  const { weeks, max, monthLabels } = useMemo(() => {
    // Pad the front so the first column starts on a Sunday
    const first = new Date(daily[0]?.date + "T00:00:00");
    const pad = first.getDay();
    const padded: (DayTotal | null)[] = Array(pad).fill(null);
    for (const d of daily) padded.push(d);

    const weeks: (DayTotal | null)[][] = [];
    for (let i = 0; i < padded.length; i += 7) {
      weeks.push(padded.slice(i, i + 7));
    }

    const max = Math.max(1, ...daily.map((d) => d.total_secs));

    const monthLabels: { weekIdx: number; label: string }[] = [];
    let lastMonth = -1;
    weeks.forEach((w, i) => {
      const firstDay = w.find((d) => d !== null);
      if (!firstDay) return;
      const m = new Date(firstDay.date + "T00:00:00").getMonth();
      if (m !== lastMonth) {
        monthLabels.push({
          weekIdx: i,
          label: new Date(firstDay.date + "T00:00:00").toLocaleDateString(undefined, {
            month: "short",
          }),
        });
        lastMonth = m;
      }
    });

    return { weeks, max, monthLabels };
  }, [daily]);

  function colorFor(secs: number): string {
    if (secs <= 0) return CELL_COLORS[0];
    const ratio = secs / max;
    if (ratio < 0.2) return CELL_COLORS[1];
    if (ratio < 0.45) return CELL_COLORS[2];
    if (ratio < 0.75) return CELL_COLORS[3];
    return CELL_COLORS[4];
  }

  return (
    <div className="rounded-2xl border border-panel-edge bg-panel p-5 shadow-panel">
      <div className="flex items-start gap-3 overflow-x-auto">
        <div className="flex flex-col gap-[3px] pt-[30px] text-[10px] text-text-faint">
          {WEEKDAY_LABELS.map((l, i) => (
            <span key={i} className="h-[11px] leading-[11px]">
              {l}
            </span>
          ))}
        </div>

        <div className="min-w-0">
          <div className="relative mb-1 h-[14px] w-full min-w-[504px] text-[10px] text-text-faint">
            {monthLabels.map((m) => (
              <span
                key={m.weekIdx}
                className="absolute"
                style={{ left: `${m.weekIdx * 14}px` }}
              >
                {m.label}
              </span>
            ))}
          </div>
          <div className="flex gap-[3px]">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.map((day, di) =>
                  day ? (
                    <button
                      key={di}
                      onMouseEnter={() => setHover(day)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => onSelectDay?.(day.date)}
                      title={`${day.date} — ${formatDuration(day.total_secs, "short")}`}
                      className="h-[11px] w-[11px] rounded-[2px] transition-transform hover:scale-110"
                      style={{ backgroundColor: colorFor(day.total_secs) }}
                    />
                  ) : (
                    <span key={di} className="h-[11px] w-[11px]" />
                  )
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-[11px] text-text-faint">
          {hover
            ? `${new Date(hover.date + "T00:00:00").toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })} · ${formatDuration(hover.total_secs, "short")}`
            : "Hover a day for detail, click to open its timeline"}
        </p>
        <div className="flex items-center gap-1 text-[10px] text-text-faint">
          <span>Less</span>
          {CELL_COLORS.map((c) => (
            <span key={c} className="h-[10px] w-[10px] rounded-[2px]" style={{ backgroundColor: c }} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}