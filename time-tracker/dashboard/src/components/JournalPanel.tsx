import { useEffect, useState } from "react";
import type { DayMeta } from "../types";
import { getDayMeta, saveDayMeta } from "../lib/api";

const EMPTY: DayMeta = { date: "", note: "", energy: null, mood: null, focus: null };

function RatingRow({
  label,
  value,
  onChange,
  tint,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  tint: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-text-dim">{label}</span>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => onChange(value === n ? null : n)}
            className={`h-5 w-5 rounded-full border text-[10px] font-semibold transition-all ${
              value !== null && n <= value
                ? `border-transparent text-bg`
                : "border-panel-edge bg-transparent text-text-faint hover:border-text-dim"
            }`}
            style={value !== null && n <= value ? { backgroundColor: tint } : undefined}
            title={`${n} / 5`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function JournalPanel({ date }: { date: string }) {
  const [meta, setMeta] = useState<DayMeta>({ ...EMPTY, date });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadedDate, setLoadedDate] = useState("");

  useEffect(() => {
    setLoadedDate("");
    getDayMeta(date)
      .then((m) => {
        setMeta(m.date ? m : { ...EMPTY, date });
        setLoadedDate(date);
      })
      .catch(() => {
        setMeta({ ...EMPTY, date });
        setLoadedDate(date);
      });
  }, [date]);

  useEffect(() => {
    setSaved(false);
  }, [meta]);

  const dirty = meta.date === date && loadedDate === date;

  async function save() {
    if (!dirty) return;
    setSaving(true);
    try {
      await saveDayMeta({ ...meta, note: meta.note ?? "" });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-panel-edge bg-panel p-5 shadow-panel">
      <h3 className="mb-3 text-[13px] font-medium text-text-dim">Day journal</h3>
      <textarea
        value={meta.note ?? ""}
        onChange={(e) => setMeta((m) => ({ ...m, note: e.target.value }))}
        placeholder="How did this day go? Wins, obstacles, context…"
        rows={3}
        className="w-full resize-none rounded-xl border border-panel-edge bg-bg px-3 py-2 text-[12.5px] leading-relaxed text-text outline-none transition-colors placeholder:text-text-faint focus:border-amber/50"
      />
      <div className="mt-4 flex flex-col gap-2.5">
        <RatingRow
          label="Energy"
          value={meta.energy}
          onChange={(v) => setMeta((m) => ({ ...m, energy: v }))}
          tint="rgb(var(--c-amber))"
        />
        <RatingRow
          label="Mood"
          value={meta.mood}
          onChange={(v) => setMeta((m) => ({ ...m, mood: v }))}
          tint="rgb(var(--c-teal))"
        />
        <RatingRow
          label="Focus"
          value={meta.focus}
          onChange={(v) => setMeta((m) => ({ ...m, focus: v }))}
          tint="rgb(var(--c-rose))"
        />
      </div>
      <button
        onClick={save}
        disabled={!dirty || saving}
        className="mt-4 w-full rounded-xl bg-amber px-3 py-2 text-[13px] font-semibold text-bg transition-opacity disabled:opacity-40"
      >
        {saved ? "Saved ✓" : saving ? "Saving…" : "Save journal"}
      </button>
    </div>
  );
}