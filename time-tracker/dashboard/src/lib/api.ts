import type {
  Category,
  CategoryFlag,
  DayMeta,
  ManualEntry,
  RunningTimer,
  TimeEntry,
} from "../types";
import { MOCK_CATEGORIES, generateMockEntries } from "./mockData";

// Default to same-origin (the dashboard server serves both API and dashboard assets).
// Set VITE_API_BASE only when running the dashboard through its own Vite dev server
// for hot-reload during UI development.
const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export interface DashboardData {
  categories: Category[];
  entries: TimeEntry[];
  manualEntries: ManualEntry[];
  runningTimer: RunningTimer | null;
  categoryFlags: Map<number, boolean>;
  isLive: boolean; // false = falling back to mock data (server not reachable)
}

async function tryFetch<T>(path: string, timeoutMs = 3000): Promise<T> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`${path} -> ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

async function trySend<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return (await res.json()) as T;
}

function mergeEntries(
  widgetEntries: TimeEntry[],
  manual: ManualEntry[]
): TimeEntry[] {
  const merged: TimeEntry[] = [
    ...widgetEntries,
    ...manual.map((m) => ({ ...m }) as TimeEntry),
  ];
  return merged.sort((a, b) => b.start_time.localeCompare(a.start_time));
}

export async function loadDashboardData(): Promise<DashboardData> {
  try {
    const [categories, widgetEntries, runningTimer, manualEntries, flagRows] =
      await Promise.all([
        tryFetch<Category[]>("/api/categories"),
        tryFetch<TimeEntry[]>("/api/entries"),
        tryFetch<RunningTimer | null>("/api/running-timer").catch(() => null),
        tryFetch<ManualEntry[]>("/api/dashboard/manual-entries").catch(() => []),
        tryFetch<CategoryFlag[]>("/api/dashboard/category-flags").catch(() => []),
      ]);
    const categoryFlags = new Map(
      flagRows.map((f) => [f.category_id, f.is_focus] as [number, boolean])
    );
    return {
      categories,
      entries: mergeEntries(widgetEntries, manualEntries),
      manualEntries,
      runningTimer,
      categoryFlags,
      isLive: true,
    };
  } catch {
    // Server not running — fall back to mock data so the UI is still browsable.
    return {
      categories: MOCK_CATEGORIES,
      entries: generateMockEntries(90),
      manualEntries: [],
      runningTimer: null,
      categoryFlags: new Map(),
      isLive: false,
    };
  }
}

// ---------- Day journal & ratings ----------

export async function getDayMeta(date: string): Promise<DayMeta> {
  return tryFetch<DayMeta>(
    `/api/dashboard/day?date=${encodeURIComponent(date)}`
  );
}

export async function saveDayMeta(meta: DayMeta): Promise<DayMeta> {
  return trySend<DayMeta>("/api/dashboard/day", {
    method: "PUT",
    body: JSON.stringify(meta),
  });
}

// ---------- Manual quick-add entries ----------

export interface ManualEntryInput {
  category_id: number;
  category_name: string;
  category_color: string;
  start_time: string;
  end_time: string;
}

export async function addManualEntry(input: ManualEntryInput): Promise<ManualEntry> {
  return trySend<ManualEntry>("/api/dashboard/manual-entries", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteManualEntry(id: number): Promise<void> {
  await trySend<{ ok: true }>(`/api/dashboard/manual-entries/${id}`, {
    method: "DELETE",
  });
}

// ---------- Focus classification overrides ----------

export async function setCategoryFlag(
  categoryId: number,
  isFocus: boolean
): Promise<CategoryFlag> {
  return trySend<CategoryFlag>("/api/dashboard/category-flags", {
    method: "PUT",
    body: JSON.stringify({ category_id: categoryId, is_focus: isFocus }),
  });
}