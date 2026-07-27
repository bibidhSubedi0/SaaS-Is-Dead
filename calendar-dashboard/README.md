# Calendar Dashboard

A lightweight always-on-top desktop widget that turns your Google Calendar into a daily task tracker with status management and weekly progress stats.

<!-- Add screenshots here -->

## How It Works

Tag your Google Calendar events using this naming convention:

```
[STATUS][TYPE] Task Name
```

**Status** (first bracket):
| Tag | Meaning |
|-----|---------|
| _(empty)_ | Pending — not done yet |
| `DONE` | Completed |
| `PART` | Partially done |
| `MISS` | Missed (auto-applied to past pending tasks) |

**Type** (second bracket):
| Tag | Meaning |
|-----|---------|
| `DO` | Actionable task |
| `EXPLORE` | Research / exploration |
| `FIXED` | Recurring / fixed schedule |
| `ADHOC` | Ad-hoc task |

Example: `[DO] Review pull requests`, `[DONE][EXPLORE] Research auth libraries`

## Features

- **Today view** — shows actionable tasks for today, with click-to-cycle status (pending -> partial -> done)
- **Week overview** — day cards with color-coded progress bars for the full week
- **Day drill-down** — click any day to see its tasks
- **Weekly stats** — done / missed / partial / pending counts with completion percentage
- **Day Notes** — reads from a dedicated "Day Notes" calendar in your Google account
- **Always on top** — stays above other windows, no title bar, transparent edges
- **Global shortcuts** — `Ctrl+Alt+H` to hide/show, `Ctrl+Alt+T` to toggle always-on-top
- **Auto-start** — launches on system login

## Tech Stack

- [Tauri v2](https://v2.tauri.app/) — desktop framework
- **Rust** — backend (Google Calendar API, token management)
- **TypeScript** — frontend (vanilla, no framework)
- **Vite** — bundler

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- Google Cloud project with Calendar API enabled

### Google Calendar Credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or use an existing one)
3. Enable the **Google Calendar API**
4. Create **OAuth 2.0 Client ID** credentials (Desktop app type)
5. Download the credentials JSON and save it as `credentials.json` in the project root

You also need a `token_export.json` with your OAuth tokens. You can generate this by running a quick OAuth flow once (see below).

```json
{
  "access_token": "ya29...",
  "expiry": "2026-01-01T00:00:00+00:00",
  "refresh_token": "1//0..."
}
```

### Install & Run

```bash
npm install
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

The installer will be in `src-tauri/target/release/bundle/`.

## Calendar Setup

Create events in your Google Calendar following the `[STATUS][TYPE] Name` convention. The app only reads events from calendars where you have **owner** access. Create a calendar called "Day Notes" if you want the note feature to work (the app reads the first event's title on each day as the note).
