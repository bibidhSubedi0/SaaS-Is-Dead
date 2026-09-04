import type { CategoryStats, Period } from "../types";
import { secsForPeriod } from "../lib/stats";
import { formatDuration } from "../lib/format";

const PERIOD_COPY: Record<Period, string> = {
  today: "logged today",
  week: "logged this week",
  all: "logged in total",
};

export default function HeroStat({
  stats,
  period,
}: {
  stats: CategoryStats[];
  period: Period;
}) {
  const total = stats.reduce((sum, s) => sum + secsForPeriod(s, period), 0);
  const goalsMet =
    period !== "all"
      ? stats.filter((s) => {
          const secs = secsForPeriod(s, period);
          return s.category.daily_goal_secs > 0 && secs >= s.category.daily_goal_secs;
        }).length
      : null;
  const goalsSet = stats.filter((s) => s.category.daily_goal_secs > 0).length;

  const top = [...stats].sort(
    (a, b) => secsForPeriod(b, period) - secsForPeriod(a, period)
  )[0];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-panel-edge bg-panel px-8 py-9 shadow-panel">
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-[0.16] blur-3xl"
        style={{ background: top ? top.category.color : "#e8a85c" }}
      />
      <p className="relative text-[13px] font-medium text-text-dim">{PERIOD_COPY[period]}</p>
      <p className="relative mt-2 font-display text-[56px] font-semibold leading-none tracking-tight text-text">
        {formatDuration(total)}
      </p>

      <div className="relative mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-text-dim">
        {top && total > 0 && (
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: top.category.color }}
            />
            <span>
              Most time on <span className="text-text">{top.category.name}</span>
            </span>
          </div>
        )}
        {goalsMet !== null && goalsSet > 0 && (
          <div>
            <span className="text-text">{goalsMet}</span> of {goalsSet} goals met
          </div>
        )}
      </div>
    </div>
  );
}
