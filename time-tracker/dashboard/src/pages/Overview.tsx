import { useMemo, useState } from "react";
import type { Category, TimeEntry, Period } from "../types";
import { computeCategoryStats, secsForPeriod } from "../lib/stats";
import {
  computeDailyTotals,
  computeFocusStats,
  computeStreaks,
  totalDailyGoal,
} from "../lib/insights";
import { formatDuration, localDateString, localToday, isoDateOnly } from "../lib/format";
import PeriodToggle from "../components/PeriodToggle";
import HeroStat from "../components/HeroStat";
import CategoryMosaic from "../components/CategoryMosaic";
import Donut from "../components/Donut";
import Sparkline from "../components/Sparkline";

function weekStartStr(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return localDateString(d);
}

function oomChange(current: number, previous: number): string | null {
  if (previous <= 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}% vs previous`;
}

function StatCard({
  label,
  value,
  sub,
  spark,
  accent,
}: {
  label: string;
  value: string;
  sub?: string | null;
  spark: number[];
  accent: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-panel-edge bg-panel px-5 py-4 shadow-panel">
      <div className="min-w-0">
        <p className="text-[11.5px] font-medium text-text-faint">{label}</p>
        <p className="mt-1 font-display text-[22px] font-semibold leading-none tracking-tight text-text">
          {value}
        </p>
        {sub && <p className="mt-1.5 truncate text-[11px] text-text-dim">{sub}</p>}
      </div>
      <div className="shrink-0">
        <Sparkline values={spark} color={accent} />
      </div>
    </div>
  );
}

export default function Overview({
  categories,
  entries,
  categoryFlags,
}: {
  categories: Category[];
  entries: TimeEntry[];
  categoryFlags: Map<number, boolean>;
}) {
  const [period, setPeriod] = useState<Period>("today");
  const stats = useMemo(() => computeCategoryStats(categories, entries), [categories, entries]);
  const daily = useMemo(() => computeDailyTotals(entries), [entries]);
  const dailyByDate = useMemo(() => new Map(daily.map((d) => [d.date, d.total_secs])), [daily]);
  const focus = useMemo(
    () => computeFocusStats(entries, categories, categoryFlags),
    [entries, categories, categoryFlags]
  );
  const goalPerDay = useMemo(() => totalDailyGoal(categories), [categories]);
  const streaks = useMemo(() => computeStreaks(daily, goalPerDay), [daily, goalPerDay]);

  const todayStr = localToday();
  const weekStart = weekStartStr();

  const periodEntries = useMemo(() => {
    if (period === "today") return entries.filter((e) => isoDateOnly(e.start_time) === todayStr);
    if (period === "week") return entries.filter((e) => isoDateOnly(e.start_time) >= weekStart);
    return entries;
  }, [entries, period, todayStr, weekStart]);

  const periodSecs = periodEntries.reduce((s, e) => s + (e.end_time !== null ? e.duration_secs : 0), 0);
  const periodSessions = periodEntries.filter((e) => e.end_time !== null).length;
  const periodFocus = useMemo(
    () =>
      computeFocusStats(periodEntries, categories, categoryFlags),
    [periodEntries, categories, categoryFlags]
  );

  // Delta vs previous equivalent period
  let delta: string | null = null;
  if (period === "today") {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const ys = localDateString(y);
    delta = oomChange(periodSecs, dailyByDate.get(ys) ?? 0);
  } else if (period === "week") {
    const w = new Date(weekStart + "T00:00:00");
    w.setDate(w.getDate() - 7);
    const prevStart = localDateString(w);
    const prevWeek = daily
      .filter((d) => d.date >= prevStart && d.date < weekStart)
      .reduce((s, d) => s + d.total_secs, 0);
    delta = oomChange(periodSecs, prevWeek);
  } else {
    delta = `${daily.length} tracked ${daily.length === 1 ? "day" : "days"}`;
  }

  const avgSession = periodSessions > 0 ? Math.round(periodSecs / periodSessions) : 0;

  const donutSlices = categories
    .map((c) => {
      const s = stats.find((x) => x.category.id === c.id);
      const value = s ? secsForPeriod(s, period) : 0;
      return { name: c.name, color: c.color, value, percent: 0 };
    })
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
  const donutTotal = donutSlices.reduce((s, x) => s + x.value, 0);
  for (const slice of donutSlices) {
    slice.percent = donutTotal > 0 ? Math.round((slice.value / donutTotal) * 100) : 0;
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-10 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-text">Overview</h1>
          <p className="mt-1 text-sm text-text-dim">How your time is split across categories.</p>
        </div>
        <PeriodToggle value={period} onChange={setPeriod} />
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label={`Logged ${period === "today" ? "today" : period}`}
          value={formatDuration(periodSecs, "short")}
          sub={delta}
          spark={daily.slice(-7).map((d) => d.total_secs)}
          accent="#e8a85c"
        />
        <StatCard
          label="Session average"
          value={formatDuration(avgSession, "short")}
          sub={`${periodSessions} sessions`}
          spark={daily.slice(-7).map((d) => d.total_secs)}
          accent="#7babb0"
        />
        <StatCard
          label="Current streak"
          value={`${streaks.currentTrackingStreak} ${streaks.currentTrackingStreak === 1 ? "day" : "days"}`}
          sub={`best: ${streaks.longestTrackingStreak} · ${streaks.consistencyPct}% consistent`}
          spark={daily.slice(-7).map((d) => (d.total_secs > 0 ? 1 : 0))}
          accent="#9caf88"
        />
        <StatCard
          label="Focus ratio"
          value={`${periodFocus.focusPct}%`}
          sub={`${formatDuration(periodFocus.distSecs, "short")} distracted`}
          spark={focus.trend.slice(-14).map((t) => t.focusPct)}
          accent="#c97b7b"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <HeroStat stats={stats} period={period} />
        <div className="rounded-2xl border border-panel-edge bg-panel p-5 shadow-panel">
          <h2 className="mb-3 text-[13px] font-medium text-text-dim">Breakdown</h2>
          <Donut slices={donutSlices} totalSecs={donutTotal} />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-[13px] font-medium text-text-dim">By category</h2>
        <CategoryMosaic stats={stats} period={period} />
      </div>
    </div>
  );
}