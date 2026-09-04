import { useEffect, useState } from "react";
import { Clock, Trash2 } from "lucide-react";
import type { Category, ManualEntry, RunningTimer } from "../types";
import { addManualEntry, type ManualEntryInput } from "../lib/api";
import { datetimelocalToRfc3339, localToday } from "../lib/format";

function roundToNearestMinute(date: Date): Date {
  const d = new Date(date);
  d.setSeconds(0, 0);
  return d;
}

function dateToDatetimeLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function dateFromDatetimeLocal(value: string): Date {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return new Date();
  const [, y, mo, d, h, mi] = m.map(Number);
  return new Date(y, mo - 1, d, h, mi, 0, 0);
}

function defaultStart(date: string): string {
  const now = roundToNearestMinute(new Date());
  if (date === localToday()) return dateToDatetimeLocal(now);
  return `${date}T09:00`;
}

function runningElapsedMin(runningTimer: RunningTimer): number {
  return Math.max(
    1,
    Math.round(
      (new Date().getTime() - new Date(runningTimer.entry.start_time).getTime()) / 60000
    )
  );
}

export default function QuickAdd({
  date,
  categories,
  runningTimer,
  manualForDay,
  onAdded,
  onDelete,
}: {
  date: string;
  categories: Category[];
  runningTimer: RunningTimer | null;
  manualForDay: ManualEntry[];
  onAdded: (e: ManualEntry) => void;
  onDelete: (id: number) => void;
}) {
  const [categoryId, setCategoryId] = useState<number>(0);
  const [start, setStart] = useState<string>(() => defaultStart(date));
  const [duration, setDuration] = useState<number>(30);
  const [saving, setSaving] = useState(false);

  const isToday = date === localToday();

  useEffect(() => {
    setStart(defaultStart(date));
    setCategoryId(categories[0]?.id ?? 0);
    setDuration(30);
  }, [date, categories]);

  const category = categories.find((c) => c.id === categoryId) ?? categories[0];

  async function submit() {
    if (!category || duration <= 0 || !start) return;
    setSaving(true);
    try {
      const startDate = dateFromDatetimeLocal(start);
      const endDate = new Date(startDate.getTime() + duration * 60000);
      const input: ManualEntryInput = {
        category_id: category.id,
        category_name: category.name,
        category_color: category.color,
        start_time: datetimelocalToRfc3339(start),
        end_time: datetimelocalToRfc3339(dateToDatetimeLocal(endDate)),
      };
      const created = await addManualEntry(input);
      onAdded(created);
    } finally {
      setSaving(false);
    }
  }

  function captureRunning() {
    if (!runningTimer) return;
    setCategoryId(runningTimer.category.id);
    const now = roundToNearestMinute(new Date());
    const elapsed = runningElapsedMin(runningTimer);
    const startDate = new Date(now.getTime() - elapsed * 60000);
    setStart(dateToDatetimeLocal(startDate));
    setDuration(elapsed);
  }

  return (
    <div className="rounded-2xl border border-panel-edge bg-panel p-5 shadow-panel">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-medium text-text-dim">Quick add</h3>
        <span className="text-[10.5px] text-text-faint">stored in dashboard.db</span>
      </div>

      <div className="flex flex-col gap-3">
        <select
          value={category?.id ?? 0}
          onChange={(e) => setCategoryId(Number(e.target.value))}
          className="w-full rounded-xl border border-panel-edge bg-bg px-3 py-2 text-[12.5px] text-text outline-none transition-colors focus:border-amber/50"
        >
          {categories.length === 0 && <option value={0}>No categories</option>}
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10.5px] text-text-faint">Start</span>
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full rounded-xl border border-panel-edge bg-bg px-2.5 py-2 text-[12.5px] text-text outline-none transition-colors focus:border-amber/50"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10.5px] text-text-faint">Duration (min)</span>
            <input
              type="number"
              min={1}
              step={5}
              value={duration}
              onChange={(e) => setDuration(Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded-xl border border-panel-edge bg-bg px-2.5 py-2 text-[12.5px] text-text outline-none transition-colors focus:border-amber/50"
            />
          </label>
        </div>

        <button
          onClick={submit}
          disabled={saving || !category || duration <= 0}
          className="w-full rounded-xl bg-amber px-3 py-2 text-[13px] font-semibold text-bg transition-opacity disabled:opacity-40"
        >
          {saving ? "Adding…" : "+ Add entry"}
        </button>

        {isToday && runningTimer && (
          <button
            onClick={captureRunning}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-panel-edge py-2 text-[12px] font-medium text-text-dim transition-colors hover:border-amber/40 hover:text-text"
          >
            <Clock className="h-3.5 w-3.5" />
            Capture running timer · {formatMins(Math.round(runningElapsedMin(runningTimer)))}
          </button>
        )}
      </div>

      {manualForDay.length > 0 && (
        <div className="mt-4 border-t border-panel-edge pt-3">
          <p className="mb-2 text-[10.5px] uppercase tracking-wide text-text-faint">
            Manual on this day
          </p>
          <ul className="flex flex-col gap-1.5">
            {manualForDay.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between rounded-lg bg-bg px-2.5 py-1.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: m.category_color ?? "#766a63" }}
                  />
                  <span className="truncate text-[12px] text-text-dim">
                    {m.category_name ?? "Unknown"}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[11px] text-text-faint">
                    {m.start_time.length >= 16
                      ? `${m.start_time.slice(11, 16)}–${m.end_time ? m.end_time.slice(11, 16) : "now"}`
                      : ""}
                  </span>
                  <button
                    onClick={() => onDelete(m.id)}
                    className="text-text-faint transition-colors hover:text-rose"
                    title="Delete manual entry"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function formatMins(mins: number): string {
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}