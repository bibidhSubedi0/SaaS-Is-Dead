import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, 'dashboard', 'dist');

const USAGE = `Usage: dashboard [options]

Launch the time-tracker dashboard server.

Options:
  --port, -p <n>     Port to listen on (default 4000)
  --host <addr>      Address to bind (default 127.0.0.1; use 0.0.0.0 to expose on LAN)
  --db-dir <path>    Directory holding data.db / dashboard.db (default ~/.time-tracker)
  --no-open          Do not auto-open the browser
  -h, --help         Show this help

Environment overrides (used when the flag is not given):
  PORT, TIMETRACKER_DB_DIR, NO_OPEN=1
`;

function parseArgs(argv) {
  const args = { port: NaN, host: null, dbDir: null, noOpen: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('-')) continue;
    const eq = a.indexOf('=');
    const key = eq > 0 ? a.slice(0, eq) : a;
    const inline = eq > 0 ? a.slice(eq + 1) : null;
    const value = () => (inline ?? argv[++i] ?? '');
    switch (key) {
      case '--port':
      case '-p':
        args.port = Number(value());
        break;
      case '--host':
        args.host = value();
        break;
      case '--db-dir':
        args.dbDir = value();
        break;
      case '--no-open':
        args.noOpen = true;
        break;
      case '-h':
      case '--help':
        args.help = true;
        break;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(USAGE);
  process.exit(0);
}

const PORT = Number.isFinite(args.port)
  ? args.port
  : Number(process.env.PORT || 4000);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`Invalid port: ${PORT}`);
  process.exit(1);
}
const HOST = args.host ?? '127.0.0.1';
const NO_OPEN = args.noOpen || process.env.NO_OPEN === '1';
const DB_DIR =
  args.dbDir ??
  process.env.TIMETRACKER_DB_DIR ??
  path.join(
    process.env.USERPROFILE ||
      process.env.HOME ||
      path.join(__dirname, '.time-tracker'),
    '.time-tracker'
  );
const DB_PATH = path.join(DB_DIR, 'data.db');
const DASH_DB_PATH = path.join(DB_DIR, 'dashboard.db');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function openDb() {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  // Wait up to 3s if the widget's connection holds a lock momentarily
  db.exec('PRAGMA busy_timeout = 3000');
  return db;
}

function listCategories(db) {
  return db
    .prepare(
      `SELECT id, name, color, sort_order, daily_goal_secs
       FROM categories ORDER BY sort_order, id`
    )
    .all();
}

function listEntries(db, days) {
  const base = `SELECT te.id, te.category_id, c.name AS category_name,
                       c.color AS category_color, te.start_time, te.end_time, te.duration_secs
               FROM time_entries te
               JOIN categories c ON c.id = te.category_id`;
  if (days && days > 0) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);
    const sinceStr = toSqlForCompare(since);
    return db.prepare(`${base} WHERE te.start_time >= ? ORDER BY te.start_time DESC`).all(sinceStr);
  }
  return db.prepare(`${base} ORDER BY te.start_time DESC`).all();
}

function runningTimer(db) {
  const row = db
    .prepare(
      `SELECT te.id, te.category_id, c.name AS category_name,
              c.color AS category_color, te.start_time, te.end_time, te.duration_secs
       FROM time_entries te
       JOIN categories c ON c.id = te.category_id
       WHERE te.end_time IS NULL
       ORDER BY te.id DESC LIMIT 1`
    )
    .get();
  if (!row) return null;
  return {
    entry: {
      id: row.id,
      category_id: row.category_id,
      category_name: row.category_name,
      category_color: row.category_color,
      start_time: row.start_time,
      end_time: row.end_time,
      duration_secs: row.duration_secs,
    },
    category: {
      id: row.category_id,
      name: row.category_name,
      color: row.category_color,
      sort_order: 0,
      daily_goal_secs: 0,
    },
  };
}

// The DB stores local-time RFC3339-like strings with a tz offset (e.g.
// "2026-08-19T16:00:06+05:45"). Lexicographic comparison on that string is
// NOT time-ordered across offsets, but since the widget always writes local
// time with the same offset, a simple prefix compare of the date portion is
// what matters for the "days" filter. We compare against the local date.
function toSqlForCompare(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T00:00:00`;
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] ?? 'application/octet-stream';
  const data = fs.readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
  res.end(data);
}

function serveIndex(res) {
  serveFile(res, path.join(DIST_DIR, 'index.html'));
}

// ---------- Dashboard-owned data (separate ~/.time-tracker/dashboard.db) ----------

function openDashDb() {
  fs.mkdirSync(DB_DIR, { recursive: true });
  const db = new DatabaseSync(DASH_DB_PATH);
  db.exec('PRAGMA busy_timeout = 3000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS day_meta (
      date   TEXT PRIMARY KEY,
      note   TEXT DEFAULT '',
      energy INTEGER,
      mood   INTEGER,
      focus  INTEGER
    );
    CREATE TABLE IF NOT EXISTS manual_entries (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id     INTEGER NOT NULL,
      category_name   TEXT NOT NULL,
      category_color  TEXT DEFAULT '#766a63',
      start_time      TEXT NOT NULL,
      end_time        TEXT,
      duration_secs   INTEGER DEFAULT 0,
      created_at      TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS category_flags (
      category_id INTEGER PRIMARY KEY,
      is_focus    INTEGER NOT NULL DEFAULT 1
    );
  `);
  return db;
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) req.destroy();
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function rowToManualEntry(row) {
  return {
    id: row.id,
    category_id: row.category_id,
    category_name: row.category_name,
    category_color: row.category_color,
    start_time: row.start_time,
    end_time: row.end_time,
    duration_secs: row.duration_secs,
    is_manual: true,
  };
}

function getDayMeta(dash, date) {
  const row = dash
    .prepare('SELECT date, note, energy, mood, focus FROM day_meta WHERE date = ?')
    .get(date);
  if (!row) return { date, note: '', energy: null, mood: null, focus: null };
  return {
    date: row.date,
    note: row.note ?? '',
    energy: row.energy,
    mood: row.mood,
    focus: row.focus,
  };
}

function putDayMeta(dash, body) {
  const { date } = body;
  if (typeof date !== 'string' || !DATE_RE.test(date)) {
    return { error: 'invalid date' };
  }
  const note = typeof body.note === 'string' ? body.note : '';
  const rating = (v) => (v === null || v === undefined ? null : Number(v));
  const energy = rating(body.energy);
  const mood = rating(body.mood);
  const focus = rating(body.focus);
  for (const [k, v] of [['energy', energy], ['mood', mood], ['focus', focus]]) {
    if (v !== null && (Number.isNaN(v) || v < 1 || v > 5)) return { error: `invalid ${k}` };
  }
  dash
    .prepare(
      `INSERT INTO day_meta (date, note, energy, mood, focus)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET
         note = excluded.note,
         energy = excluded.energy,
         mood = excluded.mood,
         focus = excluded.focus`
    )
    .run(date, note, energy, mood, focus);
  return getDayMeta(dash, date);
}

function listManualEntries(dash) {
  return dash
    .prepare('SELECT * FROM manual_entries ORDER BY start_time DESC, id DESC')
    .all()
    .map(rowToManualEntry);
}

function postManualEntry(dash, body) {
  const categoryId = Number(body.category_id);
  const categoryName = typeof body.category_name === 'string' ? body.category_name.trim() : '';
  const categoryColor =
    typeof body.category_color === 'string' && body.category_color ? body.category_color : '#766a63';
  const startTime = typeof body.start_time === 'string' ? body.start_time : '';
  const endTime = typeof body.end_time === 'string' && body.end_time ? body.end_time : null;

  if (!Number.isInteger(categoryId) || categoryId <= 0 || !categoryName) {
    return { error: 'invalid category' };
  }
  const startMs = Date.parse(startTime);
  if (Number.isNaN(startMs)) return { error: 'invalid start_time' };
  let durationSecs = 0;
  if (endTime) {
    const endMs = Date.parse(endTime);
    if (Number.isNaN(endMs)) return { error: 'invalid end_time' };
    if (endMs < startMs) return { error: 'end_time before start_time' };
    durationSecs = Math.round((endMs - startMs) / 1000);
  } else if (Number.isFinite(Number(body.duration_secs))) {
    durationSecs = Math.max(0, Math.round(Number(body.duration_secs)));
  }

  const info = dash
    .prepare(
      `INSERT INTO manual_entries (category_id, category_name, category_color, start_time, end_time, duration_secs)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(categoryId, categoryName, categoryColor, startTime, endTime, durationSecs);
  const row = dash.prepare('SELECT * FROM manual_entries WHERE id = ?').get(info.lastInsertRowid);
  return rowToManualEntry(row);
}

function deleteManualEntry(dash, id) {
  if (!Number.isInteger(id) || id <= 0) return { error: 'invalid id' };
  dash.prepare('DELETE FROM manual_entries WHERE id = ?').run(id);
  return { ok: true };
}

function listCategoryFlags(dash) {
  return dash
    .prepare('SELECT category_id, is_focus FROM category_flags')
    .all()
    .map((r) => ({ category_id: r.category_id, is_focus: r.is_focus === 1 }));
}

function putCategoryFlag(dash, body) {
  const categoryId = Number(body.category_id);
  const isFocus = body.is_focus === true || body.is_focus === 1;
  if (!Number.isInteger(categoryId) || categoryId <= 0) return { error: 'invalid category_id' };
  dash
    .prepare(
      `INSERT INTO category_flags (category_id, is_focus) VALUES (?, ?)
       ON CONFLICT(category_id) DO UPDATE SET is_focus = excluded.is_focus`
    )
    .run(categoryId, isFocus ? 1 : 0);
  return { category_id: categoryId, is_focus: isFocus };
}

async function handleDashboardApi(req, res, url) {
  const dash = dashDb;
  try {
    const segs = url.pathname.split('/').filter(Boolean); // e.g. ["api","dashboard","manual-entries","5"]
    const sub = segs[2];

    if (sub === 'day') {
      if (req.method === 'GET') {
        const date = url.searchParams.get('date');
        if (!date || !DATE_RE.test(date)) return sendJson(res, 400, { error: 'invalid date' });
        return sendJson(res, 200, getDayMeta(dash, date));
      }
      if (req.method === 'PUT') {
        const body = await readBody(req);
        if (!body) return sendJson(res, 400, { error: 'invalid json' });
        const result = putDayMeta(dash, body);
        if (result.error) return sendJson(res, 400, result);
        return sendJson(res, 200, result);
      }
      return sendJson(res, 405, { error: 'method not allowed' });
    }

    if (sub === 'manual-entries') {
      if (req.method === 'GET') return sendJson(res, 200, listManualEntries(dash));
      if (req.method === 'POST') {
        const body = await readBody(req);
        if (!body) return sendJson(res, 400, { error: 'invalid json' });
        const result = postManualEntry(dash, body);
        if (result.error) return sendJson(res, 400, result);
        return sendJson(res, 201, result);
      }
      if (req.method === 'DELETE') {
        const id = Number(segs[3]);
        const result = deleteManualEntry(dash, id);
        if (result.error) return sendJson(res, 400, result);
        return sendJson(res, 200, result);
      }
      return sendJson(res, 405, { error: 'method not allowed' });
    }

    if (sub === 'category-flags') {
      if (req.method === 'GET') return sendJson(res, 200, listCategoryFlags(dash));
      if (req.method === 'PUT') {
        const body = await readBody(req);
        if (!body) return sendJson(res, 400, { error: 'invalid json' });
        const result = putCategoryFlag(dash, body);
        if (result.error) return sendJson(res, 400, result);
        return sendJson(res, 200, result);
      }
      return sendJson(res, 405, { error: 'method not allowed' });
    }

    sendJson(res, 404, { error: 'not found' });
  } finally {
    // dashDb stays open across requests
  }
}

async function handleApi(req, res, url) {
  if (url.pathname.startsWith('/api/dashboard/')) {
    return handleDashboardApi(req, res, url);
  }

  // Widget read-only endpoints
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' });

  let db;
  try {
    db = openDb();
  } catch (err) {
    sendJson(res, 500, { error: `cannot open db: ${err.message}` });
    return;
  }
  try {
    if (url.pathname === '/api/categories') {
      sendJson(res, 200, listCategories(db));
    } else if (url.pathname === '/api/entries') {
      const daysParam = url.searchParams.get('days');
      const days = daysParam === null || daysParam === 'all' || daysParam === '0' ? 0 : Number(daysParam);
      sendJson(res, 200, listEntries(db, Number.isFinite(days) ? days : 0));
    } else if (url.pathname === '/api/running-timer') {
      sendJson(res, 200, runningTimer(db));
    } else {
      sendJson(res, 404, { error: 'not found' });
    }
  } finally {
    db.close();
  }
}

const dashDb = openDashDb();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url);
    return;
  }

  // Static dashboard assets
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (rel === '') rel = 'index.html';
  // Prevent path traversal
  const safeRel = path.normalize(rel).replace(/^[/\\]+/, '');
  const filePath = path.join(DIST_DIR, safeRel);

  if (safeRel.includes('..') || !filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    serveFile(res, filePath);
    return;
  }

  // SPA fallback: unknown routes serve index.html
  serveIndex(res);
});

if (!fs.existsSync(DIST_DIR)) {
  console.error(
    `Dashboard build not found at ${DIST_DIR}. Run "npm run build -w dashboard" first, ` +
      `or just use "npm run dashboard".`
  );
  process.exit(1);
}

server.listen(PORT, HOST, () => {
  const displayHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`Time-tracker dashboard: http://${displayHost}:${PORT}`);
  console.log(`Reading database: ${DB_PATH}`);
  if (!NO_OPEN) {
    const url = `http://${displayHost}:${PORT}`;
    if (process.platform === 'win32') {
      exec(`start "" "${url}"`);
    } else if (process.platform === 'darwin') {
      exec(`open "${url}"`);
    } else {
      exec(`xdg-open "${url}"`);
    }
  }
});