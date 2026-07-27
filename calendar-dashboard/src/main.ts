import "./styles.css";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface EventOut {
  id: string;
  calendar_id: string;
  calendar_name: string;
  title: string;
  start: string;
  end: string;
}

interface WeekStats {
  total: number;
  done: number;
  missed: number;
  partial: number;
  pending: number;
  by_calendar: Record<string, unknown>;
}

interface DayStats {
  date: string;
  done: number;
  missed: number;
  partial: number;
  pending: number;
}

interface WeekBundle {
  stats: WeekStats;
  daily_stats: DayStats[];
  days: Record<string, EventOut[]>;
  note: string | null;
}

let currentOpenView: { type: "day"; date: string } | { type: "week" } | null = null;
let fixedExpanded = false;
let weekBundle: WeekBundle | null = null;
let selectedDayDate: string | null = null;

// ---------- Task rendering ----------

function renderTaskRowsInto(container: HTMLElement, events: EventOut[], editable: boolean) {
  container.innerHTML = "";
  const tagged = events.filter((ev) => parseTag(ev.title) !== null);

  if (tagged.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Nothing tagged this day";
    container.appendChild(empty);
    return;
  }

  const list = document.createElement("ul");
  list.className = "task-list";
  for (const ev of tagged) {
    const tag = parseTag(ev.title)!;
    list.appendChild(buildTaskRow(ev, tag, !editable));
  }
  container.appendChild(list);
}

function parseTag(title: string): { status: string; type: string; rest: string } | null {
  const m = title.match(/^\[(DONE|MISS|PART)?\]\[(DO|EXPLORE|FIXED|ADHOC)\]\s*(.*)$/);
  if (!m) return null;
  return { status: m[1] ?? "", type: m[2], rest: m[3] };
}

function statusClass(status: string): string {
  if (status === "DONE") return "status-done";
  if (status === "MISS") return "status-miss";
  if (status === "PART") return "status-part";
  return "";
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(iso: string): string {
  if (!iso) return "";
  if (!iso.includes("T")) return "All day";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function buildTaskRow(ev: EventOut, tag: { status: string; type: string; rest: string }, isFixed: boolean): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "task-item " + statusClass(tag.status);

  let badge = "";
  if (tag.type === "EXPLORE") badge = `<span class="task-badge badge-explore">explore</span>`;
  else if (tag.type === "ADHOC") badge = `<span class="task-badge badge-adhoc">adhoc</span>`;

  const checkClass = tag.status === "DONE" ? "check-done" : tag.status === "PART" ? "check-part" : tag.status === "MISS" ? "check-miss" : "";
  li.innerHTML = `
    ${!isFixed ? `<div class="check ${checkClass}" data-status="${tag.status}"></div>` : ""}
    <span class="task-time">${formatTime(ev.start)}</span>
    <span class="task-title">${escapeHtml(tag.rest || ev.title)}</span>
    ${badge}
  `;

  if (!isFixed) {
    const checkEl = li.querySelector(".check") as HTMLElement;
    checkEl.addEventListener("click", async () => {
      const currentStatus = checkEl.dataset.status || "";
      const nextStatus = currentStatus === "" ? "PART" : currentStatus === "PART" ? "DONE" : "";
      checkEl.className = "check " + (nextStatus === "DONE" ? "check-done" : nextStatus === "PART" ? "check-part" : "");
      checkEl.dataset.status = nextStatus;
      checkEl.style.pointerEvents = "none";
      try {
        const updatedEvents = await invoke<EventOut[]>("mark_event_status", {
          eventId: ev.id,
          calendarId: ev.calendar_id,
          status: nextStatus,
        });
        renderTodayTasks(updatedEvents);
      } catch (err) {
        console.error("Failed to mark event:", err);
        checkEl.className = "check " + (currentStatus === "DONE" ? "check-done" : currentStatus === "PART" ? "check-part" : "");
        checkEl.dataset.status = currentStatus;
      } finally {
        checkEl.style.pointerEvents = "";
      }
    });
  }

  return li;
}

// ---------- Today section ----------

function renderTodayTasks(events: EventOut[]) {
  const taskListEl = document.getElementById("task-list")!;
  const fixedListEl = document.getElementById("fixed-list")!;
  const fixedToggle = document.getElementById("fixed-toggle") as HTMLButtonElement;
  const fixedToggleLabel = document.getElementById("fixed-toggle-label")!;

  taskListEl.innerHTML = "";
  fixedListEl.innerHTML = "";

  const actionable: HTMLLIElement[] = [];
  const fixed: HTMLLIElement[] = [];

  for (const ev of events) {
    const tag = parseTag(ev.title);
    if (!tag) continue;

    if (tag.type === "FIXED") {
      fixed.push(buildTaskRow(ev, tag, true));
    } else {
      actionable.push(buildTaskRow(ev, tag, false));
    }
  }

  if (actionable.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "Nothing on the docket today";
    taskListEl.appendChild(empty);
  } else {
    actionable.forEach((row) => taskListEl.appendChild(row));
  }

  fixed.forEach((row) => fixedListEl.appendChild(row));

  if (fixed.length > 0) {
    fixedToggle.style.display = "flex";
    fixedToggleLabel.textContent = `${fixed.length} fixed`;
  } else {
    fixedToggle.style.display = "none";
  }

  taskListEl.classList.add("fade-refresh");
  setTimeout(() => taskListEl.classList.remove("fade-refresh"), 400);
}

async function loadToday() {
  try {
    const events = await invoke<EventOut[]>("get_today_events");
    renderTodayTasks(events);
  } catch (err) {
    const taskListEl = document.getElementById("task-list")!;
    taskListEl.innerHTML = `<li class="empty-state">Error: ${escapeHtml(String(err))}</li>`;
  }
}

// ---------- Note ----------

function renderNote(note: string | null) {
  const noteEl = document.getElementById("note-text")!;
  const cleaned = note?.replace(/^\[NOTE\]\s*/, "") ?? "";
  noteEl.textContent = cleaned;
}

async function loadNote() {
  try {
    const note = await invoke<string | null>("get_today_note");
    renderNote(note);
  } catch {
    renderNote(null);
  }
}

// ---------- Week grid (day cards) ----------

function renderWeekGrid(dailyStats: DayStats[]) {
  const gridEl = document.getElementById("week-grid")!;
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const todayStr = new Date().toISOString().slice(0, 10);

  gridEl.innerHTML = "";
  dailyStats.forEach((day) => {
    const d = new Date(day.date + "T00:00:00");
    const dayOfWeek = d.getDay();
    const isToday = day.date === todayStr;
    const total = day.done + day.missed + day.partial + day.pending;
    const hasEvents = total > 0;

    const card = document.createElement("div");
    card.className = "day-card" + (isToday ? " today" : "") + (hasEvents ? " has-events" : "") + (selectedDayDate === day.date ? " selected" : "");

    // Day name
    const nameEl = document.createElement("span");
    nameEl.className = "day-card-name";
    nameEl.textContent = dayLabels[dayOfWeek];
    card.appendChild(nameEl);

    // Date number
    const dateEl = document.createElement("span");
    dateEl.className = "day-card-date";
    dateEl.textContent = String(d.getDate());
    card.appendChild(dateEl);

    // Status bar
    if (hasEvents) {
      const bar = document.createElement("div");
      bar.className = "day-card-bar";
      const segments = [
        { cls: "bar-done", count: day.done },
        { cls: "bar-missed", count: day.missed },
        { cls: "bar-partial", count: day.partial },
        { cls: "bar-pending", count: day.pending },
      ];
      for (const seg of segments) {
        if (seg.count > 0) {
          const segEl = document.createElement("div");
          segEl.className = "day-card-bar-seg " + seg.cls;
          segEl.style.width = `${(seg.count / total) * 100}%`;
          bar.appendChild(segEl);
        }
      }
      card.appendChild(bar);
    }

    // Click handler
    card.style.cursor = "pointer";
    card.addEventListener("click", () => {
      const dateNum = d.getDate();
      const month = d.toLocaleDateString(undefined, { month: "short" });
      const dayName = d.toLocaleDateString(undefined, { weekday: "long" });
      const label = isToday ? `${dayName}, ${month} ${dateNum} · Today` : `${dayName}, ${month} ${dateNum}`;
      openDayPanel(day.date, label);
    });

    gridEl.appendChild(card);
  });
}

// ---------- Progress bar ----------

function renderProgressBar(stats: WeekStats) {
  const total = stats.done + stats.missed + stats.partial + stats.pending;
  const pct = total > 0 ? Math.round((stats.done / total) * 100) : 0;

  document.getElementById("chart-center-value")!.textContent = total > 0 ? `${pct}%` : "–";

  const setWidth = (id: string, count: number) => {
    const el = document.getElementById(id) as HTMLElement;
    el.style.width = total > 0 ? `${(count / total) * 100}%` : "0%";
  };

  setWidth("prog-done", stats.done);
  setWidth("prog-missed", stats.missed);
  setWidth("prog-partial", stats.partial);
  setWidth("prog-pending", stats.pending);

  document.getElementById("stat-done")!.textContent = String(stats.done);
  document.getElementById("stat-missed")!.textContent = String(stats.missed);
  document.getElementById("stat-partial")!.textContent = String(stats.partial);
  document.getElementById("stat-pending")!.textContent = String(stats.pending);
}

// ---------- Day panel ----------

function renderWeekOverview() {
  const panel = document.getElementById("day-panel")!;
  const title = document.getElementById("day-panel-title")!;
  const body = document.getElementById("day-panel-body")!;
  const closeBtn = document.getElementById("day-panel-close") as HTMLElement;

  if (!weekBundle) return;

  currentOpenView = null;
  selectedDayDate = null;
  title.textContent = "This Week";
  closeBtn.style.display = "none";
  panel.classList.add("expanded");

  const todayStr = new Date().toISOString().slice(0, 10);
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  body.innerHTML = "";
  const overview = document.createElement("div");
  overview.className = "week-overview";

  for (const day of weekBundle.daily_stats) {
    const d = new Date(day.date + "T00:00:00");
    const isToday = day.date === todayStr;
    const total = day.done + day.missed + day.partial + day.pending;

    const row = document.createElement("div");
    row.className = "week-overview-row" + (isToday ? " today" : "");

    const dayEl = document.createElement("span");
    dayEl.className = "wo-day";
    dayEl.textContent = dayLabels[d.getDay()];

    const dateEl = document.createElement("span");
    dateEl.className = "wo-date";
    dateEl.textContent = String(d.getDate());

    const bar = document.createElement("div");
    bar.className = "wo-bar";
    if (total > 0) {
      const segments = [
        { cls: "bar-done", count: day.done },
        { cls: "bar-missed", count: day.missed },
        { cls: "bar-partial", count: day.partial },
        { cls: "bar-pending", count: day.pending },
      ];
      for (const seg of segments) {
        if (seg.count > 0) {
          const segEl = document.createElement("div");
          segEl.className = "wo-bar-seg " + seg.cls;
          segEl.style.width = `${(seg.count / total) * 100}%`;
          bar.appendChild(segEl);
        }
      }
    }

    const countEl = document.createElement("span");
    countEl.className = "wo-count";
    countEl.textContent = total > 0 ? String(total) : "";

    row.appendChild(dayEl);
    row.appendChild(dateEl);
    row.appendChild(bar);
    row.appendChild(countEl);

    row.addEventListener("click", () => {
      const dateNum = d.getDate();
      const month = d.toLocaleDateString(undefined, { month: "short" });
      const dayName = d.toLocaleDateString(undefined, { weekday: "long" });
      const label = isToday ? `${dayName}, ${month} ${dateNum} · Today` : `${dayName}, ${month} ${dateNum}`;
      openDayPanel(day.date, label);
    });

    overview.appendChild(row);
  }

  body.appendChild(overview);
}

async function openDayPanel(date: string, label: string) {
  const panel = document.getElementById("day-panel")!;
  const title = document.getElementById("day-panel-title")!;
  const body = document.getElementById("day-panel-body")!;
  const closeBtn = document.getElementById("day-panel-close") as HTMLElement;

  if (currentOpenView?.type === "day" && currentOpenView.date === date) {
    renderWeekOverview();
    refreshWeekGridSelection();
    return;
  }

  currentOpenView = { type: "day", date };
  selectedDayDate = date;
  title.textContent = label;
  closeBtn.style.display = "flex";
  panel.classList.add("expanded");
  refreshWeekGridSelection();

  if (weekBundle?.days[date]) {
    const isToday = date === new Date().toISOString().slice(0, 10);
    renderTaskRowsInto(body, weekBundle.days[date], isToday);
    return;
  }

  body.innerHTML = `<p class="empty-state">Loading...</p>`;
  try {
    const events = await invoke<EventOut[]>("get_day_events", { date });
    const isToday = date === new Date().toISOString().slice(0, 10);
    renderTaskRowsInto(body, events, isToday);
  } catch (err) {
    body.innerHTML = `<p class="empty-state">Error: ${escapeHtml(String(err))}</p>`;
  }
}

function refreshWeekGridSelection() {
  if (weekBundle) {
    renderWeekGrid(weekBundle.daily_stats);
  }
}

// ---------- Header ----------

function setDateHeader() {
  const el = document.getElementById("today-date")!;
  el.textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

// ---------- Loading sequence ----------

async function loadTodayFast() {
  await Promise.all([loadToday(), loadNote()]);
}

async function loadWeekBackground() {
  try {
    const bundle = await invoke<WeekBundle>("get_week_bundle");
    weekBundle = bundle;
    renderProgressBar(bundle.stats);
    renderWeekGrid(bundle.daily_stats);
    renderNote(bundle.note);
    renderWeekOverview();
  } catch (err) {
    console.error("Failed to load week bundle:", err);
  }
}

async function refreshAll() {
  weekBundle = null;
  selectedDayDate = null;
  await loadTodayFast();
  loadWeekBackground();
}

// ---------- Init ----------

window.addEventListener("DOMContentLoaded", () => {
  setDateHeader();

  loadTodayFast();
  loadWeekBackground();

  document.getElementById("refresh-btn")!.addEventListener("click", refreshAll);
  document.getElementById("day-panel-close")!.addEventListener("click", () => {
    if (weekBundle) renderWeekOverview();
    refreshWeekGridSelection();
  });
  document.getElementById("close-btn")!.addEventListener("click", () => {
    getCurrentWindow().close();
  });

  const fixedToggle = document.getElementById("fixed-toggle") as HTMLButtonElement;
  const fixedList = document.getElementById("fixed-list")!;
  fixedToggle.addEventListener("click", () => {
    fixedExpanded = !fixedExpanded;
    fixedToggle.classList.toggle("open", fixedExpanded);
    fixedList.classList.toggle("expanded", fixedExpanded);
  });
});
