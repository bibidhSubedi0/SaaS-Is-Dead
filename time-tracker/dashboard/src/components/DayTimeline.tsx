import { useMemo } from "react";
import type { TimeEntry } from "../types";
import { formatClock, formatDuration } from "../lib/format";
import { hourFractionOf } from "../lib/insights";

const HOUR_TICKS = Array.from({ length: 13 }, (_, i) => i * 2);

export default function DayTimeline({
  entries,
  date,
  isToday,
}: {
  entries: TimeEntry[];
  date: string;
  isToday: boolean;
}) {
  const sorted = useMemo(
    () => [...entries].sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [entries]
  );

  const nowFrac = useMemo(() => {
    if (!isToday) return null;
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60;
  }, [isToday]);

  const total = sorted
    .filter((e) => e.end_time !== null)
    .reduce((s, e) => s + e.duration_secs, 0);

  if (sorted.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-2xl border border-dashed border-panel-edge text-sm text-text-faint">
        Nothing tracked this day yet.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-panel-edge bg-panel p-5 shadow-panel">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-[13px] font-medium text-text-dim">
          {new Date(date + "T00:00:00").toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </h3>
        <span className="text-[12px] text-text-faint">{formatDuration(total, "short")} tracked</span>
      </div>

      <div className="relative h-[220px]">
        {/* hour grid lines */}
        <div className="absolute inset-0">
          {HOUR_TICKS.map((h) => (
            <div
              key={h}
              className="absolute top-0 h-full border-l border-panel-edge/50"
              style={{ left: `${(h / 24) * 100}%` }}
            />
          ))}
        </div>

        {/* blocks */}
        <div className="absolute inset-0 flex flex-col gap-1.5 py-1">
          {sorted.map((e) => {
            const start = hourFractionOf(e.start_time);
            const end = e.end_time
              ? hourFractionOf(e.end_time)
              : Math.max(start + 0.02, Math.min(nowFrac ?? start + 0.05, 24));
            const left = Math.max(0, (start / 24) * 100);
            const width = Math.max(1.2, ((end - start) / 24) * 100);
            const color = e.category_color ?? "#766a63";
            const manual = e.is_manual;
            const label = `${e.category_name ?? "Unknown"} · ${formatClock(e.start_time)}`;
            return (
              <div key={e.id} className="relative h-8 shrink-0">
                <div
                  className="absolute flex h-full min-w-0 items-center overflow-hidden rounded-md px-2 transition-[filter] hover:brightness-110"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    backgroundColor: color,
                    opacity: manual ? 0.5 : 0.22,
                    boxShadow: `inset 0 0 0 1.5px ${color}`,
                  }}
                  title={`${e.category_name ?? "Unknown"} · ${formatClock(e.start_time)}${
                    e.end_time ? ` – ${formatClock(e.end_time)}` : " – now"
                  } · ${formatDuration(e.duration_secs, "long")}${manual ? " · added manually" : ""}`}
                >
                  <span
                    className="truncate text-[11px] font-medium"
                    style={{ color }}
                  >
                    {label}
                    {manual ? " ·manual" : ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* now line */}
        {nowFrac !== null && (
          <div
            className="absolute inset-y-0 z-10 w-px bg-amber"
            style={{ left: `${(nowFrac / 24) * 100}%` }}
          >
            <span className="absolute -top-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-amber" />
          </div>
        )}
      </div>

      {/* axis */}
      <div className="relative mt-2 h-4">
        {HOUR_TICKS.map((h) => (
          <span
            key={h}
            className="absolute text-[10px] text-text-faint"
            style={{ left: `${(h / 24) * 100}%`, transform: "translateX(-50%)" }}
          >
            {h === 0 ? "12am" : h === 12 ? "12pm" : h === 24 ? "" : `${h % 12 || 12}${h < 12 ? "am" : "pm"}`}
          </span>
        ))}
      </div>
    </div>
  );
}