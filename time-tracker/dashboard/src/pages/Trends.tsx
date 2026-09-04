import { useMemo, useState } from "react";
import type { Category, TimeEntry } from "../types";
import { computeDailyCategoryPoints, computeDailyTotals } from "../lib/stats";
import { computeDayHourGrid, computeWeeklyTotals } from "../lib/insights";
import TrendsChart from "../components/TrendsChart";
import Heatmap from "../components/Heatmap";
import HourHeatmap from "../components/HourHeatmap";
import WeeklyBars from "../components/WeeklyBars";
import { localDateString } from "../lib/format";

const RANGE_OPTIONS = [
  { days: 14, label: "2 weeks" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

export default function Trends({
  categories,
  entries,
  onSelectDay,
}: {
  categories: Category[];
  entries: TimeEntry[];
  onSelectDay?: (date: string) => void;
}) {
  const [days, setDays] = useState(30);

  const points = useMemo(() => computeDailyCategoryPoints(entries, days), [entries, days]);
  const heatmapDaily = useMemo(() => computeDailyTotals(entries, 119), [entries]);
  const weekTotals = useMemo(() => computeWeeklyTotals(entries, 26), [entries]);
  const hourGrid = useMemo(() => computeDayHourGrid(entries), [entries]);

  // Hour heatmap respects the currently selected range so it adapts.
  const hourGridScoped = useMemo(() => {
    if (days >= 90) return hourGrid;
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - (days - 1));
    const cutoffStr = localDateString(cutoff);
    const scoped = entries.filter((e) => e.end_time !== null && e.start_time.slice(0, 10) >= cutoffStr);
    return computeDayHourGrid(scoped);
  }, [entries, days, hourGrid]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-10 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-text">Trends</h1>
          <p className="mt-1 text-sm text-text-dim">How your habits shift day to day.</p>
        </div>
        <div className="inline-flex rounded-full border border-panel-edge bg-panel/40 p-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              onClick={() => setDays(opt.days)}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                days === opt.days ? "bg-panel text-text shadow-sm" : "text-text-dim hover:text-text"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-[13px] font-medium text-text-dim">Hours by category</h2>
        <TrendsChart categories={categories} points={points} days={days} />
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-1.5 text-[12px] text-text-dim">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
              {c.name}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-[13px] font-medium text-text-dim">
          Week over week
        </h2>
        <WeeklyBars data={weekTotals} />
      </div>

      <div>
        <h2 className="mb-3 text-[13px] font-medium text-text-dim">
          When you focus · hour of day
        </h2>
        <HourHeatmap grid={hourGridScoped} />
      </div>

      <div>
        <h2 className="mb-3 text-[13px] font-medium text-text-dim">
          Last 17 weeks <span className="font-normal text-text-faint">· click a day to open its timeline</span>
        </h2>
        <Heatmap daily={heatmapDaily} onSelectDay={onSelectDay} />
      </div>
    </div>
  );
}