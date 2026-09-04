import {
  LayoutGrid,
  TrendingUp,
  CalendarRange,
  Sparkles,
  ListTree,
  Circle,
} from "lucide-react";
import type { RunningTimer } from "../types";
import type { Theme } from "../lib/theme";
import ThemeToggle from "./ThemeToggle";

export type Tab = "overview" | "trends" | "day" | "insights" | "log";

const NAV: { id: Tab; label: string; icon: typeof LayoutGrid }[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "trends", label: "Trends", icon: TrendingUp },
  { id: "day", label: "Day", icon: CalendarRange },
  { id: "insights", label: "Insights", icon: Sparkles },
  { id: "log", label: "Log", icon: ListTree },
];

export default function Sidebar({
  active,
  onChange,
  isLive,
  runningTimer,
  theme,
  onThemeChange,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  isLive: boolean;
  runningTimer: RunningTimer | null;
  theme: Theme;
  onThemeChange: (t: Theme) => void;
}) {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col justify-between border-r border-panel-edge/60 bg-sidebar px-5 py-6">
      <div>
        <div className="mb-9 flex items-center gap-2 px-1">
          <span className="h-2 w-2 rounded-full bg-amber" />
          <span className="font-display text-[15px] font-semibold tracking-tight text-text">
            Time Tracker
          </span>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onChange(item.id)}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                  isActive
                    ? "bg-panel text-text"
                    : "text-text-dim hover:bg-panel/60 hover:text-text"
                }`}
              >
                <Icon
                  size={17}
                  strokeWidth={2}
                  className={isActive ? "text-amber" : "text-text-faint group-hover:text-text-dim"}
                />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col gap-3 px-1">
        {runningTimer && (
          <div className="flex items-center gap-2 rounded-lg border border-panel-edge bg-panel/50 px-3 py-2">
            <span className="relative flex h-2 w-2">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                style={{ backgroundColor: runningTimer.category.color }}
              />
              <span
                className="relative inline-flex h-2 w-2 rounded-full"
                style={{ backgroundColor: runningTimer.category.color }}
              />
            </span>
            <span className="truncate text-xs text-text-dim">
              Running · {runningTimer.category.name}
            </span>
          </div>
        )}
        <div className="flex justify-center">
          <ThemeToggle theme={theme} onChange={onThemeChange} />
        </div>
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-text-faint">
          <Circle
            size={7}
            fill={isLive ? "#9caf88" : "#766a63"}
            strokeWidth={0}
          />
          {isLive ? "Live" : "Preview"}
        </div>
      </div>
    </aside>
  );
}