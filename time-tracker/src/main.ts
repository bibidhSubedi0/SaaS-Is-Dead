import "./styles.css";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Chart, DoughnutController, ArcElement, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from "chart.js";

Chart.register(DoughnutController, ArcElement, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

// ---------- Types ----------

interface Category {
  id: number;
  name: string;
  color: string;
  sort_order: number;
}

interface TimeEntry {
  id: number;
  category_id: number;
  category_name: string | null;
  category_color: string | null;
  start_time: string;
  end_time: string | null;
  duration_secs: number;
}

interface CategoryStats {
  category: Category;
  today_secs: number;
  week_secs: number;
  all_time_secs: number;
}

interface RunningTimer {
  entry: TimeEntry;
  category: Category;
}



// ---------- State ----------

let categories: Category[] = [];
let stats: CategoryStats[] = [];
let runningTimer: RunningTimer | null = null;
let timerInterval: number | null = null;
let timerStartEpoch: number = 0;
let currentView: "categories" | "timer" | "stats" = "categories";
let currentPeriod: "today" | "week" | "alltime" = "today";
let chart: Chart | null = null;

const PALETTE = [
  "#e8a85c", "#7babb0", "#9caf88", "#d99a6c",
  "#c97b7b", "#a78bfa", "#f472b6", "#5a4f4a",
  "#60a5fa", "#34d399", "#fbbf24", "#f87171",
];

// ---------- Helpers ----------

function formatDuration(secs: number): string {
  const h = Math.floor(Math.abs(secs) / 3600);
  const m = Math.floor((Math.abs(secs) % 3600) / 60);
  const s = Math.abs(secs) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatDurationShort(secs: number): string {
  if (secs <= 0) return "0m";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${secs}s`;
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- View switching ----------

function showView(view: "categories" | "timer" | "stats") {
  currentView = view;
  const catView = document.getElementById("view-categories")!;
  const timerView = document.getElementById("view-timer")!;
  const statsView = document.getElementById("view-stats")!;
  const statsBtn = document.getElementById("stats-btn") as HTMLElement;

  catView.style.display = view === "categories" ? "" : "none";
  timerView.style.display = view === "timer" ? "" : "none";
  statsView.style.display = view === "stats" ? "" : "none";
  statsBtn.style.display = view === "categories" ? "" : "none";
}

// ---------- Category list ----------

async function loadCategories() {
  categories = await invoke<Category[]>("get_categories");
  renderCategories();
}

function renderCategories() {
  const list = document.getElementById("category-list")!;
  list.innerHTML = "";

  for (const cat of categories) {
    const li = document.createElement("li");
    li.className = "category-row";

    const statsEntry = stats.find((s) => s.category.id === cat.id);
    const todayTime = statsEntry ? formatDurationShort(statsEntry.today_secs) : "0m";

    li.innerHTML = `
      <span class="cat-dot" style="background:${escapeHtml(cat.color)}"></span>
      <span class="cat-name">${escapeHtml(cat.name)}</span>
      <span class="cat-time">${todayTime}</span>
      <button class="cat-play-btn" title="Start timer">
        <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
      </button>
      <button class="cat-menu-btn" title="Options">
        <svg viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="5" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="19" r="2" fill="currentColor"/></svg>
      </button>
    `;

    // Start timer on play click
    const playBtn = li.querySelector(".cat-play-btn")!;
    playBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      startTimer(cat.id);
    });

    // Menu on menu click
    const menuBtn = li.querySelector(".cat-menu-btn")!;
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      showCategoryMenu(cat, li);
    });

    list.appendChild(li);
  }
}

function showCategoryMenu(cat: Category, anchor: HTMLElement) {
  // Remove any existing menu
  const existing = document.querySelector(".cat-popup-menu");
  if (existing) existing.remove();

  const menu = document.createElement("div");
  menu.className = "cat-popup-menu";
  menu.innerHTML = `
    <button class="popup-item popup-edit">Edit</button>
    <button class="popup-item popup-delete">Delete</button>
  `;

  const rect = anchor.getBoundingClientRect();
  menu.style.position = "fixed";
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.right = `${window.innerWidth - rect.right}px`;

  document.body.appendChild(menu);

  menu.querySelector(".popup-edit")!.addEventListener("click", () => {
    menu.remove();
    showEditCategory(cat);
  });

  menu.querySelector(".popup-delete")!.addEventListener("click", () => {
    menu.remove();
    if (confirm(`Delete "${cat.name}" and all its entries?`)) {
      invoke("remove_category", { id: cat.id }).then(() => loadCategories());
    }
  });

  // Close on outside click
  setTimeout(() => {
    const handler = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        document.removeEventListener("click", handler);
      }
    };
    document.addEventListener("click", handler);
  }, 0);
}

// ---------- Timer ----------

async function startTimer(categoryId: number) {
  const result = await invoke<RunningTimer>("start_timer", { categoryId });
  runningTimer = result;
  showTimerView();
}

function showTimerView() {
  if (!runningTimer) return;
  showView("timer");

  const nameEl = document.getElementById("timer-category-name")!;
  const dotEl = document.getElementById("timer-cat-dot")!;
  nameEl.textContent = runningTimer.category.name;
  dotEl.style.background = runningTimer.category.color;

  // Compute elapsed from start_time
  const startDt = new Date(runningTimer.entry.start_time);
  timerStartEpoch = startDt.getTime();

  updateTimerDisplay();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = window.setInterval(updateTimerDisplay, 1000);
}

function updateTimerDisplay() {
  const elapsed = Math.floor((Date.now() - timerStartEpoch) / 1000);
  document.getElementById("timer-time")!.textContent = formatDuration(elapsed);
}

async function stopTimer() {
  try {
    await invoke("stop_timer");
  } catch (e) {
    console.error("Failed to stop timer:", e);
  }
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  runningTimer = null;
  await loadCategories();
  await loadStats();
  showView("categories");
}

async function checkRunningTimer() {
  try {
    const result = await invoke<RunningTimer | null>("get_running_timer");
    if (result) {
      runningTimer = result;
      showTimerView();
      return true;
    }
  } catch (e) {
    console.error("Failed to check running timer:", e);
  }
  return false;
}

// ---------- Stats ----------

async function loadStats() {
  stats = await invoke<CategoryStats[]>("get_stats");
  if (currentView === "categories") {
    renderCategories();
  }
}

function renderStatsView() {
  showView("stats");

  // Update tab active state
  document.querySelectorAll(".stats-tab").forEach((tab) => {
    tab.classList.toggle("active", (tab as HTMLElement).dataset.period === currentPeriod);
  });

  renderStatsChart();
  renderStatsBreakdown();
}

function renderStatsChart() {
  if (chart) {
    chart.destroy();
    chart = null;
  }

  const canvas = document.getElementById("stats-chart") as HTMLCanvasElement;
  const filtered = stats.filter((s) => {
    const val = currentPeriod === "today" ? s.today_secs : currentPeriod === "week" ? s.week_secs : s.all_time_secs;
    return val > 0;
  });

  if (filtered.length === 0) {
    canvas.style.display = "none";
    return;
  }
  canvas.style.display = "";

  const labels = filtered.map((s) => s.category.name);
  const data = filtered.map((s) =>
    currentPeriod === "today" ? s.today_secs : currentPeriod === "week" ? s.week_secs : s.all_time_secs
  );
  const colors = filtered.map((s) => s.category.color);

  const totalSecs = data.reduce((a, b) => a + b, 0);

  chart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: colors,
          borderColor: "#211d1f",
          borderWidth: 2,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: "60%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#a89a92",
            font: { family: "Inter", size: 11 },
            padding: 12,
            usePointStyle: true,
            pointStyleWidth: 8,
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const val = ctx.parsed;
              const pct = totalSecs > 0 ? Math.round((val / totalSecs) * 100) : 0;
              return ` ${formatDurationShort(val)} (${pct}%)`;
            },
          },
        },
      },
    },
    plugins: [
      {
        id: "centerText",
        beforeDraw: (chart) => {
          const { ctx, width, height } = chart;
          ctx.save();
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "#f2e9e4";
          ctx.font = "600 16px Sora, sans-serif";
          ctx.fillText(formatDurationShort(totalSecs), width / 2, height / 2 - 8);
          ctx.fillStyle = "#766a63";
          ctx.font = "400 10px Inter, sans-serif";
          ctx.fillText("total", width / 2, height / 2 + 10);
          ctx.restore();
        },
      },
    ],
  });
}

function renderStatsBreakdown() {
  const container = document.getElementById("stats-breakdown")!;
  container.innerHTML = "";

  const sorted = [...stats].sort((a, b) => {
    const aVal = currentPeriod === "today" ? a.today_secs : currentPeriod === "week" ? a.week_secs : a.all_time_secs;
    const bVal = currentPeriod === "today" ? b.today_secs : currentPeriod === "week" ? b.week_secs : b.all_time_secs;
    return bVal - aVal;
  });

  const maxSecs = Math.max(...sorted.map((s) =>
    currentPeriod === "today" ? s.today_secs : currentPeriod === "week" ? s.week_secs : s.all_time_secs
  ), 1);

  for (const s of sorted) {
    const secs = currentPeriod === "today" ? s.today_secs : currentPeriod === "week" ? s.week_secs : s.all_time_secs;
    if (secs <= 0) continue;

    const row = document.createElement("div");
    row.className = "stat-row";
    const barPct = maxSecs > 0 ? (secs / maxSecs) * 100 : 0;

    row.innerHTML = `
      <div class="stat-row-top">
        <span class="stat-dot" style="background:${escapeHtml(s.category.color)}"></span>
        <span class="stat-name">${escapeHtml(s.category.name)}</span>
        <span class="stat-value">${formatDurationShort(secs)}</span>
      </div>
      <div class="stat-bar-bg">
        <div class="stat-bar-fill" style="width:${barPct}%;background:${escapeHtml(s.category.color)}"></div>
      </div>
    `;
    container.appendChild(row);
  }

  if (container.children.length === 0) {
    container.innerHTML = `<p class="empty-state">No time logged yet</p>`;
  }
}

// ---------- Add/Edit modal ----------

let editingCategory: Category | null = null;
let selectedColor = PALETTE[0];

function initColorPicker() {
  const picker = document.getElementById("color-picker")!;
  picker.innerHTML = "";
  for (const color of PALETTE) {
    const swatch = document.createElement("div");
    swatch.className = "color-swatch" + (color === selectedColor ? " selected" : "");
    swatch.style.background = color;
    swatch.addEventListener("click", () => {
      selectedColor = color;
      picker.querySelectorAll(".color-swatch").forEach((s) => s.classList.remove("selected"));
      swatch.classList.add("selected");
    });
    picker.appendChild(swatch);
  }
}

function showAddCategory() {
  editingCategory = null;
  selectedColor = PALETTE[0];
  document.getElementById("modal-title")!.textContent = "Add Category";
  const input = document.getElementById("modal-input") as HTMLInputElement;
  input.value = "";
  initColorPicker();
  document.getElementById("modal-overlay")!.style.display = "";
  input.focus();
}

function showEditCategory(cat: Category) {
  editingCategory = cat;
  selectedColor = cat.color;
  document.getElementById("modal-title")!.textContent = "Edit Category";
  const input = document.getElementById("modal-input") as HTMLInputElement;
  input.value = cat.name;
  initColorPicker();
  document.getElementById("modal-overlay")!.style.display = "";
  input.focus();
}

function hideModal() {
  document.getElementById("modal-overlay")!.style.display = "none";
  editingCategory = null;
}

async function saveModal() {
  const input = document.getElementById("modal-input") as HTMLInputElement;
  const name = input.value.trim();
  if (!name) return;

  if (editingCategory) {
    await invoke("update_category", { id: editingCategory.id, name, color: selectedColor });
  } else {
    await invoke("add_category", { name, color: selectedColor });
  }

  hideModal();
  await loadCategories();
  await loadStats();
}

// ---------- Date header ----------

function setDateHeader() {
  const el = document.getElementById("today-date")!;
  el.textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

// ---------- Init ----------

window.addEventListener("DOMContentLoaded", async () => {
  setDateHeader();

  // Load categories + stats in parallel so the list renders immediately
  await Promise.all([loadCategories(), loadStats()]);

  // Check for running timer — if found, show timer view
  const wasRunning = await checkRunningTimer();

  if (!wasRunning) {
    showView("categories");
  }

  // Event listeners
  document.getElementById("close-btn")!.addEventListener("click", () => {
    getCurrentWindow().close();
  });

  document.getElementById("stats-btn")!.addEventListener("click", () => {
    renderStatsView();
  });

  document.getElementById("timer-stop-btn")!.addEventListener("click", stopTimer);

  document.getElementById("add-category-btn")!.addEventListener("click", showAddCategory);

  document.getElementById("modal-save")!.addEventListener("click", saveModal);
  document.getElementById("modal-cancel")!.addEventListener("click", hideModal);

  document.getElementById("modal-input")!.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveModal();
    if (e.key === "Escape") hideModal();
  });

  document.getElementById("stats-back-btn")!.addEventListener("click", async () => {
    await loadCategories();
    showView("categories");
  });

  document.querySelectorAll(".stats-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      currentPeriod = (tab as HTMLElement).dataset.period as "today" | "week" | "alltime";
      renderStatsView();
    });
  });
});
