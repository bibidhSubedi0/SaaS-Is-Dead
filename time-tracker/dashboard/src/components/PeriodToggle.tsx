import type { Period } from "../types";

const OPTIONS: { id: Period; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "all", label: "All time" },
];

export default function PeriodToggle({
  value,
  onChange,
}: {
  value: Period;
  onChange: (p: Period) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-panel-edge bg-panel/40 p-1">
      {OPTIONS.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
            value === opt.id
              ? "bg-panel text-text shadow-sm"
              : "text-text-dim hover:text-text"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
