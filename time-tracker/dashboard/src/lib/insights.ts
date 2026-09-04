import type { Category, TimeEntry } from "../types";
import { localDateString } from "./format";

// Entry timestamps are local-time RFC3339 with an offset (e.g.
// "2026-08-19T16:00:06+05:45"). All date/hour math below deliberately uses the
// recorded local string fields (date prefix + hour) so it agrees with how the
// widget and the DB slice history — no UTC shifting.

export interface DayTotal {
  date: string; // YYYY-MM-DD
  total_secs: number;
}

export function localDateOf(iso: string): string {
  return iso.slice(0, 10);
}

export function localHourOf(iso: string): number {
  const h = Number(iso.slice(11, 13));
  return Number.isFinite(h) ? h : 0;
}

export function localMinuteOf(iso: string): number {
  const m = Number(iso.slice(14, 16));
  return Number.isFinite(m) ? m : 0;
}

export function hourFractionOf(iso: string): number {
  return localHourOf(iso) + localMinuteOf(iso) / 60;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function weekdayLabel(dayIdx: number): string {
  return WEEKDAY_LABELS[dayIdx] ?? "";
}

export function weekdayOf(dateStr: string): number {
  return new Date(dateStr + "T00:00:00").getDay();
}

// ---------- Daily totals (local days) ----------

export function computeDailyTotals(entries: TimeEntry[]): DayTotal[] {
  const totals = new Map<string, number>();
  for (const e of entries) {
    if (e.end_time === null) continue;
    const date = localDateOf(e.start_time);
    totals.set(date, (totals.get(date) ?? 0) + e.duration_secs);
  }
  return Array.from(totals.entries())
    .map(([date, total_secs]) => ({ date, total_secs }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- Hour-of-day distribution ----------

export interface HourBucket {
  hour: number; // 0..23
  secs: number;
  sessions: number;
}

export function computeHourlyTotals(entries: TimeEntry[]): HourBucket[] {
  const secs = new Array(24).fill(0);
  const sessions = new Array(24).fill(0);
  for (const e of entries) {
    if (e.end_time === null || e.duration_secs <= 0) continue;
    const startHour = localHourOf(e.start_time);
    const endHour = e.end_time ? Math.max(startHour, localHourOf(e.end_time)) : startHour;
    // Spread the session across the hours it touches so short spans covering a
    // boundary don't over-concentrate on the start hour.
    const span = Math.max(1, endHour - startHour + 1);
    const perHour = Math.max(0, Math.floor(e.duration_secs / span));
    for (let h = startHour; h <= endHour && h < 24; h++) {
      secs[h] += perHour;
    }
    sessions[startHour] += 1;
  }
  return secs.map((s, hour) => ({ hour, secs: s, sessions: sessions[hour] }));
}

export interface DayHourGridRow {
  dayIdx: number; // 0 = Sunday
  label: string;
  secs: number;
  hours: number[]; // secs per hour, index 0..23
}

export function computeDayHourGrid(entries: TimeEntry[]): DayHourGridRow[] {
  const secs = new Array(7).fill(0).map(() => new Array(24).fill(0));
  for (const e of entries) {
    if (e.end_time === null || e.duration_secs <= 0) continue;
    const dayIdx = weekdayOf(localDateOf(e.start_time));
    const startHour = localHourOf(e.start_time);
    const endHour = e.end_time ? Math.max(startHour, localHourOf(e.end_time)) : startHour;
    const span = Math.max(1, endHour - startHour + 1);
    const perHour = Math.max(0, Math.floor(e.duration_secs / span));
    for (let h = startHour; h <= endHour && h < 24; h++) {
      secs[dayIdx][h] += perHour;
    }
  }
  return secs.map((hours, dayIdx) => ({
    dayIdx,
    label: WEEKDAY_LABELS[dayIdx],
    secs: hours.reduce((a, b) => a + b, 0),
    hours,
  }));
}

// ---------- Weekday patterns ----------

export interface WeekdayStat {
  dayIdx: number;
  label: string;
  secs: number;
  sessions: number;
  activeDays: number; // days of that weekday that had at least one session
}

export function computeWeekdayStats(entries: TimeEntry[]): WeekdayStat[] {
  const secs = new Array(7).fill(0);
  const sessionsArr = new Array(7).fill(0);
  const active = new Array(7).fill(0);
  const seen = new Set<string>();
  for (const e of entries) {
    if (e.end_time === null) continue;
    const date = localDateOf(e.start_time);
    const dayIdx = weekdayOf(date);
    secs[dayIdx] += e.duration_secs;
    sessionsArr[dayIdx] += 1;
    if (!seen.has(`${dayIdx}|${date}`)) {
      seen.add(`${dayIdx}|${date}`);
      active[dayIdx] += 1;
    }
  }
  return secs.map((s, dayIdx) => ({
    dayIdx,
    label: WEEKDAY_LABELS[dayIdx],
    secs: s,
    sessions: sessionsArr[dayIdx],
    activeDays: active[dayIdx],
  }));
}

// ---------- Streaks & consistency ----------

export interface StreakReport {
  currentTrackingStreak: number; // consecutive tracked days ending today or yesterday
  longestTrackingStreak: number;
  currentGoalStreak: number;
  longestGoalStreak: number;
  trackedDays: number;
  firstDate: string | null;
  consistencyPct: number; // tracked days / days since first date
}

export function computeStreaks(daily: DayTotal[], goalPerDaySecs: number): StreakReport {
  if (daily.length === 0) {
    return {
      currentTrackingStreak: 0,
      longestTrackingStreak: 0,
      currentGoalStreak: 0,
      longestGoalStreak: 0,
      trackedDays: 0,
      firstDate: null,
      consistencyPct: 0,
    };
  }

  const byDate = new Map(daily.map((d) => [d.date, d.total_secs]));
  const first = daily[0].date;

  // Expand the timeline from first to today so 0-activity days count as gaps.
  const start = new Date(first + "T00:00:00");
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const days: { date: string; secs: number; goalMet: boolean }[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const date = localDateString(d);
    const secs = byDate.get(date) ?? 0;
    days.push({ date, secs, goalMet: goalPerDaySecs > 0 && secs >= goalPerDaySecs });
  }

  const tracking = days.map((x) => x.secs > 0);
  const goals = days.map((x) => x.goalMet);

  let currentTracking = 0;
  for (let i = tracking.length - 1; i >= 0; i--) {
    if (tracking[i]) currentTracking++;
    else {
      // Ignore a trailing "today with nothing yet" if yesterday was tracked.
      if (i === tracking.length - 1) continue;
      break;
    }
  }
  let longestTracking = 0;
  let run = 0;
  for (const t of tracking) {
    run = t ? run + 1 : 0;
    longestTracking = Math.max(longestTracking, run);
  }

  let currentGoal = 0;
  for (let i = goals.length - 1; i >= 0; i--) {
    if (goals[i]) currentGoal++;
    else {
      if (i === goals.length - 1) continue;
      break;
    }
  }
  let longestGoal = 0;
  run = 0;
  for (const g of goals) {
    run = g ? run + 1 : 0;
    longestGoal = Math.max(longestGoal, run);
  }

  // Consistency: fraction of days since first tracked date (excluding today,
  // which is in progress) that have at least one session.
  const elapsed = Math.max(1, days.length);
  const eligible = days.slice(0, days.length - 1);
  const tracked = eligible.filter((x) => x.secs > 0).length;
  const consistencyPct = Math.round((tracked / elapsed) * 100);

  return {
    currentTrackingStreak: Math.max(0, currentTracking),
    longestTrackingStreak: longestTracking,
    currentGoalStreak: Math.max(0, currentGoal),
    longestGoalStreak: longestGoal,
    trackedDays: daily.length,
    firstDate: first,
    consistencyPct,
  };
}

export function totalDailyGoal(categories: Category[]): number {
  return categories.reduce((sum, c) => sum + Math.max(0, c.daily_goal_secs), 0);
}

// ---------- Goal performance per category ----------

export interface CategoryGoalStat {
  categoryId: number;
  name: string;
  color: string;
  goalSecs: number;
  activeDays: number;
  daysMet: number;
  totalSecs: number;
  avgOnActiveDays: number; // secs per day that the category was used
  attainmentPct: number; // active days where the daily goal was met
}

export function computeGoalPerformance(categories: Category[], entries: TimeEntry[]): CategoryGoalStat[] {
  const perCat = new Map<
    number,
    { goalSecs: number; name: string; color: string; days: Map<string, number> }
  >();
  for (const c of categories) {
    perCat.set(c.id, { goalSecs: c.daily_goal_secs, name: c.name, color: c.color, days: new Map() });
  }

  for (const e of entries) {
    if (e.end_time === null) continue;
    const cat = perCat.get(e.category_id);
    if (!cat) continue;
    const date = localDateOf(e.start_time);
    cat.days.set(date, (cat.days.get(date) ?? 0) + e.duration_secs);
  }

  const result: CategoryGoalStat[] = [];
  for (const [categoryId, cat] of perCat.entries()) {
    let daysMet = 0;
    let totalSecs = 0;
    for (const secs of cat.days.values()) {
      totalSecs += secs;
      if (cat.goalSecs > 0 && secs >= cat.goalSecs) daysMet++;
    }
    const activeDays = cat.days.size;
    result.push({
      categoryId,
      name: cat.name,
      color: cat.color,
      goalSecs: cat.goalSecs,
      activeDays,
      daysMet,
      totalSecs,
      avgOnActiveDays: activeDays > 0 ? Math.round(totalSecs / activeDays) : 0,
      attainmentPct: activeDays > 0 && cat.goalSecs > 0 ? Math.round((daysMet / activeDays) * 100) : 0,
    });
  }
  return result;
}

// ---------- Momentum: this 7 days vs previous 7 ----------

export interface Momentum {
  currentSecs: number;
  previousSecs: number;
  changePct: number | null;
}

export function computeMomentum(daily: DayTotal[]): Momentum {
  const byDate = new Map(daily.map((d) => [d.date, d.total_secs]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dates: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(localDateString(d));
  }

  const currentSecs = dates
    .slice(7)
    .reduce((sum, date) => sum + (byDate.get(date) ?? 0), 0);
  const previousSecs = dates
    .slice(0, 7)
    .reduce((sum, date) => sum + (byDate.get(date) ?? 0), 0);

  const changePct =
    previousSecs > 0 ? Math.round(((currentSecs - previousSecs) / previousSecs) * 100) : null;

  return { currentSecs, previousSecs, changePct };
}

// ---------- Weekly totals (weeks start Sunday) ----------

export interface WeeklyTotal {
  weekStart: string; // YYYY-MM-DD (Sunday)
  label: string; // short month/day of the week start
  secs: number;
}

export function computeWeeklyTotals(entries: TimeEntry[], maxWeeks = 52): WeeklyTotal[] {
  const byWeek = new Map<string, number>();
  let firstDate: string | null = null;
  let lastDate = localDateString(new Date());

  for (const e of entries) {
    if (e.end_time === null) continue;
    const date = localDateOf(e.start_time);
    if (!firstDate || date < firstDate) firstDate = date;
    if (date > lastDate) lastDate = date;

    const d = new Date(date + "T00:00:00");
    const dow = d.getDay();
    const sunday = new Date(d);
    sunday.setDate(d.getDate() - dow);
    const weekStart = localDateString(sunday);
    byWeek.set(weekStart, (byWeek.get(weekStart) ?? 0) + e.duration_secs);
  }

  if (!firstDate || byWeek.size === 0) {
    const today = localDateString(new Date());
    return [{ weekStart: today, label: shortMonthDay(today), secs: 0 }];
  }

  const firstSunday = new Date(new Date(firstDate + "T00:00:00"));
  firstSunday.setDate(firstSunday.getDate() - firstSunday.getDay());
  const start = firstSunday;
  const end = new Date();
  end.setHours(0, 0, 0, 0);

  const weeks: string[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 7)) {
    weeks.push(localDateString(d));
    if (weeks.length >= maxWeeks) break;
  }

  return weeks.map((weekStart) => ({
    weekStart,
    label: shortMonthDay(weekStart),
    secs: byWeek.get(weekStart) ?? 0,
  }));
}

function shortMonthDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ---------- Session analytics ----------

export interface SessionStat {
  sessions: number;
  totalSecs: number;
  avgSecs: number;
  longestSecs: number;
  medianSecs: number;
}

export function summarizeSessions(values: number[]): SessionStat {
  if (values.length === 0) {
    return { sessions: 0, totalSecs: 0, avgSecs: 0, longestSecs: 0, medianSecs: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  const total = values.reduce((a, b) => a + b, 0);
  return {
    sessions: values.length,
    totalSecs: total,
    avgSecs: Math.round(total / values.length),
    longestSecs: Math.max(...values),
    medianSecs: median,
  };
}

export interface SessionAnalytics {
  overall: SessionStat;
  perCategory: (SessionStat & { categoryId: number; name: string; color: string })[];
  deepWorkDays: number; // days with at least one unbroken session >= 90 min
  fragmentedDays: number; // days with >= 6 sessions
  avgSessionsPerActiveDay: number;
}

export function computeSessionAnalytics(
  entries: TimeEntry[],
  categories: Category[]
): SessionAnalytics {
  const perCat = new Map<number, { name: string; color: string; durations: number[] }>();
  for (const c of categories) {
    perCat.set(c.id, { name: c.name, color: c.color, durations: [] });
  }
  const all: number[] = [];
  const sessionsPerDay = new Map<string, number>();
  const dayMaxBlock = new Map<string, number>();

  for (const e of entries) {
    if (e.end_time === null || e.duration_secs <= 0) continue;
    all.push(e.duration_secs);
    const cat = perCat.get(e.category_id);
    if (cat) cat.durations.push(e.duration_secs);
    const date = localDateOf(e.start_time);
    sessionsPerDay.set(date, (sessionsPerDay.get(date) ?? 0) + 1);
    dayMaxBlock.set(date, Math.max(dayMaxBlock.get(date) ?? 0, e.duration_secs));
  }

  let deepWorkDays = 0;
  let fragmentedDays = 0;
  for (const [date, maxBlock] of dayMaxBlock) {
    if (maxBlock >= 90 * 60) deepWorkDays++;
    if ((sessionsPerDay.get(date) ?? 0) >= 6) fragmentedDays++;
  }

  return {
    overall: summarizeSessions(all),
    perCategory: Array.from(perCat.entries()).map(([categoryId, cat]) => ({
      categoryId,
      name: cat.name,
      color: cat.color,
      ...summarizeSessions(cat.durations),
    })),
    deepWorkDays,
    fragmentedDays,
    avgSessionsPerActiveDay: sessionsPerDay.size > 0
      ? Math.round((all.length / sessionsPerDay.size) * 10) / 10
      : 0,
  };
}

// ---------- Focus vs distraction ----------

const DISTRACTION_KEYWORDS = [
  "slag",
  "game",
  "gaming",
  "youtube",
  "social",
  "scroll",
  "phone",
  "netflix",
  "tv",
  "series",
  "movie",
  "film",
  "leisure",
  "fun",
  "rest",
  "nap",
  "break",
];

export function defaultIsDistraction(name: string): boolean {
  const lower = name.toLowerCase();
  return DISTRACTION_KEYWORDS.some((k) => lower.includes(k));
}

export interface FocusCategory {
  categoryId: number;
  name: string;
  color: string;
  isFocus: boolean;
  secs: number;
}

export interface FocusStats {
  focusSecs: number;
  distSecs: number;
  focusPct: number;
  trend: { date: string; focusSecs: number; distSecs: number; focusPct: number }[];
  byCategory: FocusCategory[];
}

export function computeFocusStats(
  entries: TimeEntry[],
  categories: Category[],
  flags: Map<number, boolean>
): FocusStats {
  const isFocusById = new Map<number, boolean>();
  for (const c of categories) {
    const flag = flags.get(c.id);
    isFocusById.set(c.id, flag ?? !defaultIsDistraction(c.name));
  }

  const secsById = new Map<number, number>();
  for (const c of categories) secsById.set(c.id, 0);
  const byDay = new Map<string, { focus: number; dist: number }>();
  for (const e of entries) {
    if (e.end_time === null) continue;
    secsById.set(e.category_id, (secsById.get(e.category_id) ?? 0) + e.duration_secs);
    const date = localDateOf(e.start_time);
    const row = byDay.get(date) ?? { focus: 0, dist: 0 };
    if (isFocusById.get(e.category_id) ?? true) row.focus += e.duration_secs;
    else row.dist += e.duration_secs;
    byDay.set(date, row);
  }

  let focusSecs = 0;
  let distSecs = 0;
  for (const c of categories) {
    const s = secsById.get(c.id) ?? 0;
    if (isFocusById.get(c.id) ?? true) focusSecs += s;
    else distSecs += s;
  }

  const trend = Array.from(byDay.entries())
    .map(([date, row]) => ({
      date,
      focusSecs: row.focus,
      distSecs: row.dist,
      focusPct: row.focus + row.dist > 0
        ? Math.round((row.focus / (row.focus + row.dist)) * 100)
        : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    focusSecs,
    distSecs,
    focusPct: focusSecs + distSecs > 0 ? Math.round((focusSecs / (focusSecs + distSecs)) * 100) : 0,
    trend: trend.slice(-90),
    byCategory: Array.from(secsById.entries()).map(([categoryId, secs]) => ({
      categoryId,
      name: categories.find((c) => c.id === categoryId)?.name ?? "",
      color: categories.find((c) => c.id === categoryId)?.color ?? "#766a63",
      isFocus: isFocusById.get(categoryId) ?? true,
      secs,
    })),
  };
}