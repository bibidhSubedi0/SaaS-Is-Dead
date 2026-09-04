import { useMemo } from "react";
import type { ReactNode } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { Category, CategoryFlag, TimeEntry } from "../types";
import { setCategoryFlag } from "../lib/api";
import {
  computeDailyTotals,
  computeGoalPerformance,
  computeMomentum,
  computeSessionAnalytics,
  computeStreaks,
  computeWeekdayStats,
  computeFocusStats,
  totalDailyGoal,
} from "../lib/insights";
import { formatDuration } from "../lib/format";
import Sparkline from "../components/Sparkline";

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-2xl border border-panel-edge bg-panel p-5 shadow-panel`}>
      <h2 className="text-[13px] font-medium text-text-dim">{title}</h2>
      {subtitle && <p className="mt-0.5 text-[11.5px] text-text-faint">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10.5px] uppercase tracking-wide text-text-faint">{label}</p>
      <p className="mt-1 font-display text-[22px] font-semibold leading-none text-text">{value}</p>
    </div>
  );
}

export default function Insights({
  categories,
  entries,
  categoryFlags,
  onFlagChange,
}: {
  categories: Category[];
  entries: TimeEntry[];
  categoryFlags: Map<number, boolean>;
  onFlagChange: (flag: CategoryFlag) => void;
}) {
  const daily = useMemo(() => computeDailyTotals(entries), [entries]);
  const goalPerDay = useMemo(() => totalDailyGoal(categories), [categories]);
  const streaks = useMemo(() => computeStreaks(daily, goalPerDay), [daily, goalPerDay]);
  const momentum = useMemo(() => computeMomentum(daily), [daily]);
  const weekdays = useMemo(() => computeWeekdayStats(entries), [entries]);
  const weekdayMax = Math.max(1, ...weekdays.map((w) => w.secs));
  const bestWeekday = useMemo(
    () => weekdays.reduce((best, w) => (w.secs > best.secs ? w : best), weekdays[0]),
    [weekdays]
  );
  const goals = useMemo(
    () => computeGoalPerformance(categories, entries).filter((g) => g.activeDays > 0),
    [categories, entries]
  );
  const sessions = useMemo(() => computeSessionAnalytics(entries, categories), [entries, categories]);
  const focus = useMemo(
    () => computeFocusStats(entries, categories, categoryFlags),
    [entries, categories, categoryFlags]
  );

  const totalSecs = daily.reduce((s, d) => s + d.total_secs, 0);

  async function toggleFocus(categoryId: number, isFocus: boolean) {
    try {
      const flag = await setCategoryFlag(categoryId, isFocus);
      onFlagChange(flag);
    } catch {
      // offline preview — keep local state unchanged
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-10 py-10">
      <div>
        <h1 className="font-display text-xl font-semibold text-text">Insights</h1>
        <p className="mt-1 text-sm text-text-dim">
          Patterns drawn from your tracking history.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-panel-edge bg-panel px-6 py-5 shadow-panel">
        <div className="flex flex-wrap gap-10">
          <Stat label="Tracked" value={formatDuration(totalSecs, "short")} />
          <Stat label="Active days" value={String(daily.length)} />
          <Stat label="Streak" value={`${streaks.currentTrackingStreak}`} />
          <Stat label="Consistency" value={`${streaks.consistencyPct}%`} />
        </div>
        <div className={`rounded-xl px-4 py-2.5 text-right ${
          (momentum.changePct ?? 0) >= 0 ? "bg-sage/10" : "bg-rose/10"
        }`}>
          <p className="flex items-center justify-end gap-1.5 text-[11px] text-text-dim">
            {momentum.changePct !== null && (momentum.changePct >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5 text-sage" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-rose" />
            ))}
            This week vs last
          </p>
          <p className={`mt-0.5 font-display text-[26px] font-semibold leading-none ${
            (momentum.changePct ?? 0) >= 0 ? "text-sage" : "text-rose"
          }`}>
            {momentum.changePct !== null
              ? `${momentum.changePct >= 0 ? "+" : ""}${momentum.changePct}%`
              : "—"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Weekday patterns" subtitle="Where your time concentrates across the week">
          <div className="flex flex-col gap-2">
            {weekdays.map((w) => {
              const pct = w.secs > 0 ? Math.round((w.secs / weekdayMax) * 100) : 0;
              const isBest = bestWeekday && w.dayIdx === bestWeekday.dayIdx && w.secs > 0;
              return (
                <div key={w.dayIdx} className="flex items-center gap-3">
                  <span className={`w-7 text-[11px] font-medium ${isBest ? "text-amber" : "text-text-dim"}`}>
                    {w.label}
                  </span>
                  <div className="h-5 flex-1 overflow-hidden rounded-md bg-bg">
                    <div
                      className={`h-full rounded-md ${isBest ? "bg-amber/70" : "bg-teal/50"}`}
                      style={{ width: `${Math.max(pct, w.activeDays ? 3 : 0)}%` }}
                    />
                  </div>
                  <span className="w-14 text-right text-[11px] text-text-dim">
                    {formatDuration(w.secs, "short")}
                  </span>
                  <span className="w-10 text-right text-[11px] text-text-faint">
                    {w.sessions} ses
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="Streaks & consistency" subtitle="Are you showing up, and showing up regularly?">
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            <Stat
              label="Current tracking streak"
              value={`${streaks.currentTrackingStreak} ${streaks.currentTrackingStreak === 1 ? "day" : "days"}`}
            />
            <Stat label="Longest streak" value={`${streaks.longestTrackingStreak} days`} />
            <Stat
              label="Current goal streak"
              value={`${streaks.currentGoalStreak} ${streaks.currentGoalStreak === 1 ? "day" : "days"}`}
            />
            <Stat label="Longest goal streak" value={`${streaks.longestGoalStreak} days`} />
          </div>
          <div className="mt-5 border-t border-panel-edge pt-4">
            <div className="mb-1.5 flex items-center justify-between text-[11.5px]">
              <span className="text-text-dim">Days tracked vs possible</span>
              <span className="text-text-faint">{streaks.consistencyPct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-bg">
              <div
                className="h-full rounded-full bg-sage"
                style={{ width: `${streaks.consistencyPct}%` }}
              />
            </div>
            <p className="mt-2 text-[11.5px] text-text-faint">
              {streaks.firstDate
                ? `Tracking since ${new Date(streaks.firstDate + "T00:00:00").toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })} · ${streaks.trackedDays} tracked days`
                : "Start tracking to see streak data."}
            </p>
          </div>
        </Card>

        <Card title="Goal performance" subtitle="Per-category attainment of your daily goal">
          {goals.length === 0 ? (
            <p className="text-[12px] text-text-faint">Set a daily goal on a category to see this.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {goals.map((g) => {
                const pct = Math.min(100, Math.round((g.avgOnActiveDays / Math.max(1, g.goalSecs)) * 100));
                return (
                  <div key={g.categoryId}>
                    <div className="mb-1.5 flex items-center justify-between text-[12px]">
                      <span className="flex items-center gap-2 font-medium text-text-dim">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: g.color }} />
                        {g.name}
                      </span>
                      <span className="text-text-faint">
                        {formatDuration(g.avgOnActiveDays, "short")} avg ·{" "}
                        {g.goalSecs > 0 ? `goal ${formatDuration(g.goalSecs, "short")}` : "no goal"}
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-bg">
                      <div
                        className="h-full rounded-full"
                        style={{ backgroundColor: g.color, width: `${Math.max(pct, g.activeDays ? 3 : 0)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-text-faint">
                      {g.goalSecs > 0
                        ? `Met the goal on ${g.daysMet} of ${g.activeDays} active days (${g.attainmentPct}%)`
                        : `${g.activeDays} active days`}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Session shape" subtitle="How long your work blocks tend to be">
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            <Stat label="Total sessions" value={String(sessions.overall.sessions)} />
            <Stat label="Avg session" value={formatDuration(sessions.overall.avgSecs, "short")} />
            <Stat label="Median" value={formatDuration(sessions.overall.medianSecs, "short")} />
            <Stat label="Longest" value={formatDuration(sessions.overall.longestSecs, "short")} />
            <Stat label="Deep-work days" value={String(sessions.deepWorkDays)} />
            <Stat label="Avg / active day" value={String(sessions.avgSessionsPerActiveDay)} />
          </div>
          <div className="mt-4 border-t border-panel-edge pt-3">
            {sessions.perCategory
              .filter((p) => p.sessions > 0)
              .map((p) => (
                <div key={p.categoryId} className="flex items-center justify-between py-1 text-[12px]">
                  <span className="flex items-center gap-2 text-text-dim">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                    {p.name}
                  </span>
                  <span className="text-text-faint">
                    avg {formatDuration(p.avgSecs, "short")} · median {formatDuration(p.medianSecs, "short")}
                  </span>
                </div>
              ))}
          </div>
        </Card>
      </div>

      <Card title="Focus vs distraction" subtitle="Tune which categories count as «focus» — it recomputes instantly">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[280px_1fr]">
          <div className="flex flex-col justify-center gap-2 border-r border-panel-edge pr-8">
            <p className="text-[11px] text-text-faint">Focus ratio · all time</p>
            <p className="font-display text-[44px] font-semibold leading-none text-text">
              {focus.focusPct}%
            </p>
            <div className="flex flex-col gap-0.5 text-[12px] text-text-dim">
              <span>{formatDuration(focus.focusSecs, "short")} focus</span>
              <span>{formatDuration(focus.distSecs, "short")} distraction</span>
            </div>
            <div className="mt-4">
              <Sparkline
                values={focus.trend.slice(-21).map((t) => t.focusPct)}
                color="#9caf88"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {focus.byCategory.map((c) => (
              <div key={c.categoryId} className="flex items-center gap-3">
                <span className="whitespace-nowrap text-[12.5px] text-text-dim">
                  {c.name}
                </span>
                <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-bg">
                  <div className="absolute inset-y-0 left-0 w-1/2 border-r border-bg/60" />
                  <div
                    className="h-full rounded-full"
                    style={{
                      backgroundColor: c.isFocus ? "#9caf88" : "#c97b7b",
                      width: `${Math.max(2, Math.round((c.secs / Math.max(1, focus.focusSecs + focus.distSecs)) * 100))}%`,
                    }}
                  />
                </div>
                <span className="w-11 text-right text-[11.5px] text-text-faint">
                  {formatDuration(c.secs, "short")}
                </span>
                <button
                  onClick={() => toggleFocus(c.categoryId, !c.isFocus)}
                  title={c.isFocus ? "Mark as distraction" : "Mark as focus"}
                  className={`w-16 rounded-full border px-2 py-0.5 text-[10.5px] font-medium transition-colors ${
                    c.isFocus
                      ? "border-sage/40 bg-sage/10 text-sage"
                      : "border-rose/40 bg-rose/10 text-rose"
                  }`}
                >
                  {c.isFocus ? "Focus" : "Distract"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}