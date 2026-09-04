// Mirrors the Rust structs in src-tauri/src/db.rs and the TS interfaces in main.ts

export interface Category {
  id: number;
  name: string;
  color: string;
  sort_order: number;
  daily_goal_secs: number;
}

export interface TimeEntry {
  id: number;
  category_id: number;
  category_name: string | null;
  category_color: string | null;
  start_time: string; // RFC3339, local tz offset
  end_time: string | null;
  duration_secs: number;
  is_manual?: boolean; // true = added from the dashboard itself
}

export interface CategoryStats {
  category: Category;
  today_secs: number;
  week_secs: number;
  all_time_secs: number;
}

export interface RunningTimer {
  entry: TimeEntry;
  category: Category;
}

export interface DailyBar {
  date: string;
  day_label: string;
  total_secs: number;
}

export type Period = "today" | "week" | "all";

// New endpoints proposed for the dashboard (see server.rs) — not in the widget today
export interface DailyCategoryPoint {
  date: string; // YYYY-MM-DD
  category_id: number;
  total_secs: number;
}

// ---------- Dashboard-owned data (stored separately in dashboard.db) ----------

export interface DayMeta {
  date: string; // YYYY-MM-DD
  note: string;
  energy: number | null; // 1..5
  mood: number | null; // 1..5
  focus: number | null; // 1..5
}

export interface CategoryFlag {
  category_id: number;
  is_focus: boolean;
}

export type ManualEntry = Omit<TimeEntry, "id" | "is_manual"> & {
  id: number;
  is_manual: true;
};
