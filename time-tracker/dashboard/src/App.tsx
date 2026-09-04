import { useEffect, useState } from "react";
import type {
  Category,
  CategoryFlag,
  ManualEntry,
  RunningTimer,
  TimeEntry,
} from "./types";
import { loadDashboardData, deleteManualEntry } from "./lib/api";
import { useTheme } from "./lib/theme";
import Sidebar, { type Tab } from "./components/Sidebar";
import Overview from "./pages/Overview";
import Trends from "./pages/Trends";
import Day from "./pages/Day";
import Insights from "./pages/Insights";
import Log from "./pages/Log";

export default function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const [categories, setCategories] = useState<Category[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [manualEntries, setManualEntries] = useState<ManualEntry[]>([]);
  const [runningTimer, setRunningTimer] = useState<RunningTimer | null>(null);
  const [categoryFlags, setCategoryFlags] = useState<Map<number, boolean>>(new Map());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useTheme();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const data = await loadDashboardData();
      if (cancelled) return;
      setCategories(data.categories);
      setEntries(data.entries);
      setManualEntries(data.manualEntries);
      setRunningTimer(data.runningTimer);
      setCategoryFlags(data.categoryFlags);
      setIsLive(data.isLive);
      setLoading(false);
    }

    load();
    const interval = setInterval(load, 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const updateFlags = (flag: CategoryFlag) => {
    setCategoryFlags((prev) => {
      const next = new Map(prev);
      next.set(flag.category_id, flag.is_focus);
      return next;
    });
  };

  const openDay = (date: string) => {
    setSelectedDate(date);
    setTab("day");
  };

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg">
        <div className="flex items-center gap-2.5 text-sm text-text-faint">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber" />
          Loading your time data…
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg">
      <Sidebar
        active={tab}
        onChange={setTab}
        isLive={isLive}
        runningTimer={runningTimer}
        theme={theme}
        onThemeChange={setTheme}
      />
      <main className="flex-1 overflow-y-auto">
        {tab === "overview" && (
          <Overview
            categories={categories}
            entries={entries}
            categoryFlags={categoryFlags}
          />
        )}
        {tab === "trends" && (
          <Trends categories={categories} entries={entries} onSelectDay={openDay} />
        )}
        {tab === "day" && (
          <Day
            categories={categories}
            entries={entries}
            manualEntries={manualEntries}
            runningTimer={runningTimer}
            initialDate={selectedDate}
            onManualAdd={(e) => setManualEntries((prev) => [e, ...prev])}
            onManualDelete={(id) =>
              setManualEntries((prev) => prev.filter((m) => m.id !== id))
            }
          />
        )}
        {tab === "insights" && (
          <Insights
            categories={categories}
            entries={entries}
            categoryFlags={categoryFlags}
            onFlagChange={updateFlags}
          />
        )}
        {tab === "log" && (
          <Log
            categories={categories}
            entries={entries}
            onManualDelete={(id) => {
              setManualEntries((prev) => prev.filter((m) => m.id !== id));
              deleteManualEntry(id).catch(() => {});
            }}
          />
        )}
      </main>
    </div>
  );
}