# Time Tracker

A minimal, always-on-top desktop time tracker. Create categories, start/stop timers, and view daily/weekly/all-time stats with doughnut charts — all from a compact overlay window that stays out of your way.

<!-- Add screenshots here -->

## Tech Stack

- **Frontend:** TypeScript, Vite, Chart.js
- **Backend:** Rust (via Tauri v2)
- **Database:** SQLite (via `rusqlite`)
- **Plugins:** autostart, global shortcuts, opener

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install) toolchain
- [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/)

### Install & Run

```bash
npm install
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

### Global Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+H` | Toggle window visibility |
| `Ctrl+Shift+T` | Toggle always-on-top |
