import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Category, ManualEntry, RunningTimer, TimeEntry } from "../types";
import { localDateString, localToday } from "../lib/format";
import DayTimeline from "../components/DayTimeline";
import JournalPanel from "../components/JournalPanel";
import QuickAdd from "../components/QuickAdd";

export default function Day({
  categories,
  entries,
  manualEntries,
  runningTimer,
  initialDate,
  onManualAdd,
  onManualDelete,
}: {
  categories: Category[];
  entries: TimeEntry[];
  manualEntries: ManualEntry[];
  runningTimer: RunningTimer | null;
  initialDate: string | null;
  onManualAdd: (e: ManualEntry) => void;
  onManualDelete: (id: number) => void;
}) {
  const [date, setDate] = useState<string>(() => initialDate ?? localToday());

  useEffect(() => {
    if (initialDate) setDate(initialDate);
  }, [initialDate]);

  const dayEntries = useMemo(
    () =>
      entries
        .filter((e) => e.start_time.slice(0, 10) === date)
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [entries, date]
  );

  const manualForDay = useMemo(
    () => manualEntries.filter((m) => m.start_time.slice(0, 10) === date),
    [manualEntries, date]
  );

  const isToday = date === localToday();

  function shiftDate(days: number) {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + days);
    setDate(localDateString(d));
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-10 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-text">Day</h1>
          <p className="mt-1 text-sm text-text-dim">A timeline of one day, start to finish.</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => shiftDate(-1)}
            className="rounded-lg border border-panel-edge p-1.5 text-text-dim transition-colors hover:bg-panel hover:text-text"
            title="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setDate(localToday())}
            className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors ${
              isToday
                ? "border-amber/40 bg-amber/10 text-amber"
                : "border-panel-edge text-text-dim hover:bg-panel hover:text-text"
            }`}
          >
            Today
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-lg border border-panel-edge bg-panel px-3 py-1.5 text-[13px] text-text outline-none transition-colors file:bg-transparent focus:border-amber/50"
          />
          <button
            onClick={() => shiftDate(1)}
            disabled={isToday}
            className="rounded-lg border border-panel-edge p-1.5 text-text-dim transition-colors hover:bg-panel hover:text-text disabled:opacity-30"
            title="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <DayTimeline entries={dayEntries} date={date} isToday={isToday} />
          <QuickAdd
            date={date}
            categories={categories}
            runningTimer={runningTimer}
            manualForDay={manualForDay}
            onAdded={onManualAdd}
            onDelete={onManualDelete}
          />
        </div>
        <div className="flex flex-col gap-6">
          <JournalPanel date={date} />
        </div>
      </div>
    </div>
  );
}