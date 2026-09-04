import type { Category, TimeEntry, CategoryStats, DailyCategoryPoint, Period } from "../types";
import { isoDateOnly, localDateString } from "./format";

function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0 = Sunday, matches weekday().num_days_from_sunday() in db.rs
  const s = new Date(d);
  s.setDate(d.getDate() - day);
  s.setHours(0, 0, 0, 0);
  return s;
}

export function computeCategoryStats(categories: Category[], entries: TimeEntry[]): CategoryStats[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekStart = startOfWeek(today);

  const map = new Map<number, CategoryStats>();
  for (const c of categories) {
    map.set(c.id, { category: c, today_secs: 0, week_secs: 0, all_time_secs: 0 });
  }

  for (const e of entries) {
    const stat = map.get(e.category_id);
    if (!stat) continue;
    const start = new Date(e.start_time);
    const dur = e.duration_secs;

    if (e.end_time !== null) {
      stat.all_time_secs += dur;
      if (start >= weekStart) stat.week_secs += dur;
      if (start >= today) stat.today_secs += dur;
    }
  }

  return Array.from(map.values()).sort((a, b) => a.category.sort_order - b.category.sort_order);
}

export function secsForPeriod(stat: CategoryStats, period: Period): number {
  if (period === "today") return stat.today_secs;
  if (period === "week") return stat.week_secs;
  return stat.all_time_secs;
}

export function computeDailyCategoryPoints(entries: TimeEntry[], days: number): DailyCategoryPoint[] {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (days - 1));

  const map = new Map<string, number>(); // `${date}|${category_id}` -> secs

  for (const e of entries) {
    if (e.end_time === null) continue;
    const start = new Date(e.start_time);
    if (start < cutoff) continue;
    const date = isoDateOnly(e.start_time);
    const key = `${date}|${e.category_id}`;
    map.set(key, (map.get(key) ?? 0) + e.duration_secs);
  }

  const points: DailyCategoryPoint[] = [];
  for (const [key, total_secs] of map.entries()) {
    const [date, catIdStr] = key.split("|");
    points.push({ date, category_id: Number(catIdStr), total_secs });
  }
  return points;
}

export function pivotDailyCategoryPoints(
  categories: Category[],
  points: DailyCategoryPoint[],
  days: number
): { date: string; [categoryId: number]: number | string }[] {
  const dateOrder: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    dateOrder.push(localDateString(d));
  }

  const rows = new Map<string, { date: string; [categoryId: number]: number | string }>();
  for (const date of dateOrder) {
    const row: { date: string; [categoryId: number]: number | string } = { date };
    for (const c of categories) row[c.id] = 0;
    rows.set(date, row);
  }

  for (const p of points) {
    const row = rows.get(p.date);
    if (row) row[p.category_id] = ((row[p.category_id] as number) ?? 0) + p.total_secs;
  }

  return dateOrder.map((d) => rows.get(d)!);
}

export function computeDailyTotals(entries: TimeEntry[], days: number): { date: string; total_secs: number }[] {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cutoffStr = localDateString(cutoff);

  const map = new Map<string, number>();
  const result: { date: string; total_secs: number }[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    map.set(localDateString(d), 0);
  }

  for (const e of entries) {
    if (e.end_time === null) continue;
    const date = isoDateOnly(e.start_time);
    if (date < cutoffStr) continue;
    if (map.has(date)) map.set(date, (map.get(date) ?? 0) + e.duration_secs);
  }

  for (const [date, total_secs] of map.entries()) {
    result.push({ date, total_secs });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}
