# PLAN.md — migrate Flashmind (JSON) → PostgreSQL

Reference plan for the full migration of the Flashmind flashcards app from a
single local JSON file to PostgreSQL with a Node API backend.

Status: **migration executed** — DB migrated, backend + frontend swapped. Pending: live
UI verification in browser + LAN check.

## Context / findings

- App is browser-only: React 19 + Vite 8 + TypeScript, no backend, no git repo, no tests.
- Storage today: `src/lib/fsdb.ts` reads/writes one `flashmind.json` in a user-picked
  folder via the File System Access API (folder handle cached in IndexedDB).
  `src/lib/store.ts` rewrites the ENTIRE file (plus a `.bak` copy) debounced on every
  change → each save writes ~2× the file size.
- Data file: `C:\Users\Bibidh\Documents\Flashmind\flashmind.json` (~14.4 MB).
  - 5 folders, 28 sets, 919 cards, 8 practice sessions
  - 107 attachments (all images) = ~13.6 MB of base64 data URLs ← the real bottleneck
- Databases installed: PostgreSQL 18.6 running on localhost:5432 (psql at
  `C:\Program Files\PostgreSQL\18\bin\psql.exe`, not on PATH). Postgres password: `postgres`.
  No MySQL/Mongo/Redis/Docker. `pg_hba.conf` = scram-sha-256, localhost-only (fine:
  only the Node API connects to PG).
- Decisions made:
  - Architecture: **Postgres + Node API backend** (Express + pg).
  - Attachments: **bytea columns** in Postgres.
  - Access: **single user across LAN** → API binds 0.0.0.0, shared Bearer token, no auth table.

## Target architecture

```
Browser (React/Vite) ──HTTP/JSON──▶ Node API (Express + pg) ──▶ PostgreSQL 18
     :5173                               :3000                       :5432
```

- Dev: Vite proxy `/api` → localhost:3000. Prod: Express serves built frontend.
- API binds `0.0.0.0:3000`; Windows Firewall inbound rule for LAN access.
- Token auth: `Authorization: Bearer <API_TOKEN>` from env.

## Step 0 — COMPLETE BACKUP (run first, before any changes)

Create `C:\dev\backups\flashcards-backup-<timestamp>\`:

1. Full project copy (including node_modules, immediately runnable):
   `robocopy C:\dev\flashcards <backup>\project /E`
2. Same content zipped: `<backup>\project-archive.zip`.
3. Full data copy: `flashmind.json` + `flashmind.json.bak` from
   `C:\Users\Bibidh\Documents\Flashmind`.
4. Verify: compare file counts/sizes (copy vs source); test zip opens.
5. Recommended (confirm first): `git init` + initial commit in `C:\dev\flashcards`.
6. The original JSON is never modified — ultimate fallback.

## Step 1 — Database setup

- Create role `flashmind` + database `flashmind` (login via postgres/postgres).
- Apply `server/schema.sql`:

  ```sql
  folders(id serial PK, name text, icon text, color text, created_at timestamptz)
  sets(id serial PK, folder_id int REFERENCES folders(id) ON DELETE SET NULL,
       title text, description text, created_at, updated_at)
  cards(id serial PK, set_id int REFERENCES sets(id) ON DELETE CASCADE,
       term text, definition text, created_at)
  attachments(id serial PK, card_id int REFERENCES cards(id) ON DELETE CASCADE,
       type text CHECK (type IN ('image','audio')), name text, mime text,
       ordinal int, data bytea, created_at)
  practice_sessions(set_id int PK REFERENCES sets(id) ON DELETE CASCADE,
       queue int[], current_index int, known int[], unknown int[], history int[],
       is_complete bool, updated_at timestamptz)
  ```

- Indexes: sets(folder_id), cards(set_id), attachments(card_id).
- Preserve existing integer IDs; `setval(seq, max(id))` after migration.

## Step 2 — Data migration

- `scripts/migrate.mjs` (Node + `pg`), single transaction, reads JSON fresh at run time:
  1. insert folders → sets → cards preserving IDs
  2. attachments: parse `data:<mime>;base64,` prefix → Buffer → bytea, with ordinal
  3. practice sessions: skip/log orphans whose setId no longer exists
  4. setval sequences; verify counts (5 / 28 / 919 / 107 / 8)
- After migration: `pg_dump flashmind` → backup folder (DB state also recoverable).

## Step 3 — Backend (new `server/`)

- Deps: express, pg, cors; dev: tsx, @types/express, @types/pg.
- `server/db.ts` — pg Pool from `DATABASE_URL`.
- `server/index.ts` — bearer-token middleware + routes mirroring current store API:
  - `GET /api/state` → all folders/sets/cards(+attachment metadata)/practice sessions
  - `POST /api/folders` · `PATCH /api/folders/:id` · `DELETE /api/folders/:id`
  - `POST /api/sets` · `PATCH /api/sets/:id` · `DELETE /api/sets/:id`
  - `POST /api/sets/:id/cards` (bulk) · `PATCH /api/cards/:id` · `DELETE /api/cards/:id`
  - `POST /api/cards/:id/attachments` (upload → returns id/url)
  - `GET /api/attachments/:id` → raw bytes + saved mime (used directly as `<img src>`)
  - `GET/PUT/DELETE /api/sets/:id/session`
- Bind `0.0.0.0:3000`, CORS for dev origin; production serves `dist/`.
- Add `npm run server`; update `cli.mjs` to launch API + Vite together.

## Step 4 — Frontend swap

- Replace `src/lib/fsdb.ts` with `src/lib/db.ts` (fetch client, token in localStorage).
- Rewrite `src/lib/store.ts` internals: init loads via API; mutations → cache + API + notify.
  KEEP all current exported signatures (getAllCards, addCards, …) so pages change minimally.
- `src/hooks/useDB.ts`: remove 'need-folder'/pickFolder; add auth/loading.
- `src/App.tsx`: remove "Choose Folder" welcome UI.
- `src/lib/types.ts`: `Attachment.data: string` → `{ id: number; type; name; url: string }`.
- Attachment consumers to URL src (no more data URLs):
  - `ImageUpload.tsx`, `AudioRecorder.tsx` — upload file, use returned url
  - `CreateSet.tsx:282` — replace `FileReader.readAsDataURL` with API upload
  - `RichText.tsx`, `SetDetail.tsx:126+`, `Practice.tsx:410+` — render `att.url`
- Direct `store` imports: `Dashboard.tsx:10`, `Practice.tsx:6` — signatures preserved, no change.

## Step 5 — Cutover & verify

1. Run migration; verify counts against JSON.
2. Start API; confirm `GET /api/state`.
3. Test desktop: create/edit/delete folder-set-card, upload image, save practice.
4. Test second LAN device.
5. Only after verification: remove `fsdb.ts` + IndexedDB handle code + folder picker remnants.
6. Rebuild `dist`; confirm prod serving works.

## Done notes

- Backup: `C:\dev\backups\flashcards-backup-20260919-073346\` (project copy, zip, data JSONs, `db\flashmind.sql` pg_dump).
- DB: role/db `flashmind` created; schema applied; migration ran → 5 folders / 30 sets / 994 cards / 113 attachments (11.1 MB bytea) / 8 sessions.
- Backend: `server/` (Express 5 + pg) bound `0.0.0.0:3000`, Bearer token (`API_TOKEN`, default `flashmind`).
- Frontend: `fsdb.ts` removed; `db.ts` (fetch client) + `store.ts` cache-backed-by-API; token login screen in `App.tsx`; attachments render via `url` (`/api/attachments/:id`), new ones kept inline as `data` until saved.
- Verified: lint+typecheck+build pass; `/api/state`, attachment bytes, CRUD, practice session, cascade delete, 401, Vite dev proxy — all tested via curl.

## How to run

- Dev: `npm run server` (API :3000) + `npm run dev` (Vite :5173, proxies /api), or `cli.mjs` (`npm link` → `flashmind` launches both).
- Prod (LAN): `npm run build` then `npm run server`; open `http://<pc-ip>:3000` from any device with token `flashmind` (or set `API_TOKEN`).
- Token: enter `flashmind` (the server default) on the login screen, or set `API_TOKEN` env to change.
- LAN firewall (admin/elevated PowerShell): `New-NetFirewallRule -DisplayName 'Flashmind API 3000' -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private`
- Rollback: use `C:\dev\backups\flashcards-backup-20260919-073346\` (full standalone project + original JSON untouched at `C:\Users\Bibidh\Documents\Flashmind\flashmind.json`).

## Reminders / risks

- JSON file changes while app is in use → back up + migrate from a fresh read at the same moment.
- Postgres password `postgres` confirmed working (PG 18.6).
- psql not on PATH → use full path `C:\Program Files\PostgreSQL\18\bin\psql.exe`.
- This adds a server process that must run with the app.
- Recommend `git init` (no repo exists) — confirm before doing it.

## Reference file map

- fp = current storage: fsdb.ts (File System Access API)
- fp = store cache: store.ts, hooks/useDB.ts, App.tsx
- fp = attachments/UI: ImageUpload, AudioRecorder, CreateSet, RichText, SetDetail, Practice
- fp = data: C:\Users\Bibidh\Documents\Flashmind\flashmind.json[.bak]