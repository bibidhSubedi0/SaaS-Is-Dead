import type { CategoryStats, Period } from "../types";
import { secsForPeriod } from "../lib/stats";
import { formatDuration } from "../lib/format";

function tierClasses(share: number, rank: number): string {
  // Column span out of a 6-col grid, driven by proportion of total time.
  if (rank === 0 && share >= 0.28) return "col-span-6 sm:col-span-4 row-span-2";
  if (share >= 0.22) return "col-span-6 sm:col-span-3 row-span-2";
  if (share >= 0.12) return "col-span-3 sm:col-span-2 row-span-1";
  return "col-span-3 sm:col-span-2 row-span-1";
}

export default function CategoryMosaic({
  stats,
  period,
}: {
  stats: CategoryStats[];
  period: Period;
}) {
  const withSecs = stats
    .map((s) => ({ stat: s, secs: secsForPeriod(s, period) }))
    .filter((x) => x.secs > 0)
    .sort((a, b) => b.secs - a.secs);

  const total = withSecs.reduce((sum, x) => sum + x.secs, 0);

  if (withSecs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-panel-edge px-8 py-14 text-center text-sm text-text-faint">
        Nothing logged for this period yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-6 gap-3">
      {withSecs.map(({ stat, secs }, i) => {
        const share = total > 0 ? secs / total : 0;
        const goal = stat.category.daily_goal_secs;
        const goalPct = goal > 0 ? Math.min(1, secs / goal) : null;
        const big = i === 0 && share >= 0.28;

        return (
          <div
            key={stat.category.id}
            className={`relative flex flex-col justify-between overflow-hidden rounded-2xl border border-panel-edge bg-panel p-5 transition-colors hover:bg-panel-hover ${tierClasses(
              share,
              i
            )}`}
            style={{ minHeight: big ? 176 : 132 }}
          >
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
              style={{ backgroundColor: stat.category.color }}
            />
            <div className="flex items-start justify-between gap-2">
              <span
                className={`font-body font-medium text-text-dim ${
                  big ? "text-[13px]" : "text-[12px]"
                }`}
              >
                {stat.category.name}
              </span>
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: stat.category.color }}
              />
            </div>

            <div>
              <p
                className={`font-display font-semibold tracking-tight text-text ${
                  big ? "text-4xl" : "text-2xl"
                }`}
              >
                {formatDuration(secs, "short")}
              </p>
              {goalPct !== null && (
                <div className="mt-3">
                  <div className="h-[3px] w-full overflow-hidden rounded-full bg-black/25">
                    <div
                      className="h-full rounded-full transition-[width]"
                      style={{
                        width: `${goalPct * 100}%`,
                        backgroundColor: stat.category.color,
                      }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-text-faint">
                    of {formatDuration(goal, "short")} goal
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
