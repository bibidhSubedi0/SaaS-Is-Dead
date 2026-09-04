import { Moon, Sun, Monitor } from "lucide-react";
import type { Theme } from "../lib/theme";

const OPTIONS: { id: Theme; label: string; icon: typeof Sun }[] = [
  { id: "dark", label: "Dark", icon: Moon },
  { id: "light", label: "Light", icon: Sun },
  { id: "system", label: "System", icon: Monitor },
];

export default function ThemeToggle({
  theme,
  onChange,
}: {
  theme: Theme;
  onChange: (t: Theme) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-panel-edge bg-panel/40 p-0.5">
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = theme === opt.id;
        return (
          <button
            key={opt.id}
            title={`${opt.label} theme`}
            aria-label={`${opt.label} theme`}
            onClick={() => onChange(opt.id)}
            className={`flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium transition-colors ${
              active
                ? "bg-panel text-text shadow-sm"
                : "text-text-faint hover:text-text-dim"
            }`}
          >
            <Icon size={13} strokeWidth={2} />
            <span className="hidden sm:inline">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}