# Time Tracker — Dashboard

A React + Vite web dashboard for the time-tracker Tauri widget.

## Run it

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`.

**Without the Rust server running**, the dashboard automatically falls back to
realistic mock data (see `src/lib/mockData.ts`) so it's fully browsable on its
own — you'll see a "Preview data · widget offline" badge in the sidebar.

**With the Rust server running** (see `../dashboard-rust-integration/INTEGRATION.md`
to wire it up), it connects automatically and shows real data — the badge
switches to "Connected to widget".

## Configuration

The API base URL defaults to `http://localhost:9876`. Override it by copying
`.env.example` to `.env` and changing `VITE_API_BASE`.

## Structure

```
src/
  types.ts           Mirrors the Rust structs exactly (Category, TimeEntry, ...)
  lib/
    api.ts           Fetches from the local server, falls back to mock data
    mockData.ts       Deterministic mock dataset matching the real schema
    stats.ts          All aggregation (today/week/all-time, daily trends) — computed
                       client-side from raw entries, so the server only needs to
                       expose /api/categories and /api/entries
    format.ts         Duration/date formatting helpers
  components/          Sidebar, charts, mosaic, heatmap, etc.
  pages/
    Overview.tsx       Hero stat + proportional category mosaic
    Trends.tsx          Stacked area chart + activity heatmap
    Log.tsx              Chronological session list
```

## Build

```bash
npm run build   # outputs to dist/
npm run preview # serve the production build locally
```
