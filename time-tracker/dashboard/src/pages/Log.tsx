import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import type { Category, TimeEntry } from "../types";
import { formatClock, formatDayLabel, formatDuration, isoDateOnly } from "../lib/format";

export default function Log({
  categories,
  entries,
  onManualDelete,
}: {
  categories: Category[];
  entries: TimeEntry[];
  onManualDelete?: (id: number) => void;
}) {
  const [filterId, setFilterId] = useState<number | "all">("all");

  const grouped = useMemo(() => {
    const filtered = entries
      .filter((e) => filterId === "all" || e.category_id === filterId)
      .filter((e) => e.end_time !== null)
      .slice()
      .sort((a, b) => b.start_time.localeCompare(a.start_time));

    const map = new Map<string, TimeEntry[]>();
    for (const e of filtered) {
      const day = isoDateOnly(e.start_time);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(e);
    }
    return Array.from(map.entries()).slice(0, 60); // cap for perf
  }, [entries, filterId]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-10 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-text">Session log</h1>
          <p className="mt-1 text-sm text-text-dim">Every completed session, most recent first.</p>
        </div>
        <select
          value={filterId}
          onChange={(e) => setFilterId(e.target.value === "all" ? "all" : Number(e.target.value))}
          className="rounded-full border border-panel-edge bg-panel px-3.5 py-1.5 text-[13px] text-text-dim outline-none focus:text-text"
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-6">
        {grouped.length === 0 && (
          <p className="rounded-2xl border border-dashed border-panel-edge px-8 py-14 text-center text-sm text-text-faint">
            No sessions to show.
          </p>
        )}

        {grouped.map(([day, dayEntries]) => {
          const dayTotal = dayEntries.reduce((s, e) => s + e.duration_secs, 0);
          return (
            <div key={day}>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h3 className="text-[13px] font-medium text-text-dim">{formatDayLabel(day)}</h3>
                <span className="text-[12px] text-text-faint">{formatDuration(dayTotal, "short")}</span>
              </div>
              <div className="overflow-hidden rounded-2xl border border-panel-edge bg-panel shadow-panel">
                {dayEntries.map((e, i) => (
                  <div
                    key={e.id}
                    className={`flex items-center justify-between gap-4 px-5 py-3.5 ${
                      i !== 0 ? "border-t border-panel-edge/60" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: e.category_color ?? "#766a63" }}
                      />
                      <div>
                        <p className="text-[13.5px] text-text">
                          {e.category_name ?? "Unknown"}
                          {e.is_manual && (
                            <span className="ml-2 rounded-full border border-panel-edge px-1.5 py-px text-[10px] font-medium text-text-faint">
                              manual
                            </span>
                          )}
                        </p>
                        <p className="text-[12px] text-text-faint">
                          {formatClock(e.start_time)}
                          {e.end_time && ` – ${formatClock(e.end_time)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="shrink-0 font-display text-[13.5px] font-medium text-text-dim">
                        {formatDuration(e.duration_secs, "short")}
                      </span>
                      {e.is_manual && onManualDelete && (
                        <button
                          onClick={() => onManualDelete(e.id)}
                          className="shrink-0 text-text-faint transition-colors hover:text-rose"
                          title="Delete manual entry"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
