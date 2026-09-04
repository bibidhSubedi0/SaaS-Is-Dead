import type { Category, TimeEntry } from "../types";

// Matches db.rs default seed + main.ts PALETTE exactly
export const MOCK_CATEGORIES: Category[] = [
  { id: 1, name: "Getting Cracked", color: "#e8a85c", sort_order: 0, daily_goal_secs: 7200 },
  { id: 2, name: "Books and Movies", color: "#7babb0", sort_order: 1, daily_goal_secs: 3600 },
  { id: 3, name: "Academics", color: "#9caf88", sort_order: 2, daily_goal_secs: 21600 },
  { id: 4, name: "School Projects", color: "#d99a6c", sort_order: 3, daily_goal_secs: 7200 },
  { id: 5, name: "Other Productive Work", color: "#c97b7b", sort_order: 4, daily_goal_secs: 3600 },
  { id: 6, name: "Video Games", color: "#a78bfa", sort_order: 5, daily_goal_secs: 3600 },
  { id: 7, name: "Guitar", color: "#f472b6", sort_order: 6, daily_goal_secs: 1800 },
  { id: 8, name: "Slagging", color: "#5a4f4a", sort_order: 7, daily_goal_secs: 0 },
];

function tzOffset(): string {
  const offsetMin = -new Date().getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// Deterministic mock data so the UI looks the same across reloads during dev
export function generateMockEntries(days = 60): TimeEntry[] {
  const entries: TimeEntry[] = [];
  const offset = tzOffset();
  let id = 1;
  const rand = seededRandom(42);

  for (let dayIdx = 0; dayIdx < days; dayIdx++) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - dayIdx);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;

    // Each category has a rough probability/duration profile per day
    for (const cat of MOCK_CATEGORIES) {
      const activityChance = cat.name === "Slagging" ? 0.5 : isWeekend ? 0.55 : 0.75;
      if (rand() > activityChance) continue;

      const sessionCount = 1 + Math.floor(rand() * 2);
      let cursorHour = 8 + rand() * 3;

      for (let s = 0; s < sessionCount; s++) {
        const durMin = 15 + Math.floor(rand() * 90);
        const startHour = Math.min(cursorHour, 22);
        const start = new Date(date);
        start.setHours(Math.floor(startHour), Math.floor((startHour % 1) * 60), 0, 0);
        const end = new Date(start.getTime() + durMin * 60000);

        // Skip incomplete "today" entries randomly to simulate a running timer
        const isRunning = dayIdx === 0 && s === sessionCount - 1 && cat.id === 3 && rand() > 0.5;

        entries.push({
          id: id++,
          category_id: cat.id,
          category_name: cat.name,
          category_color: cat.color,
          start_time: start.toISOString().slice(0, 19) + offset,
          end_time: isRunning ? null : end.toISOString().slice(0, 19) + offset,
          duration_secs: isRunning ? 0 : durMin * 60,
        });

        cursorHour = startHour + durMin / 60 + rand() * 2;
      }
    }
  }

  return entries.sort((a, b) => a.start_time.localeCompare(b.start_time));
}
