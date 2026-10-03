import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { pool } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const API_TOKEN = process.env.API_TOKEN ?? 'flashmind';

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));

let authToken = '';

function unauthorized(res: express.Response) {
  res.status(401).json({ error: 'Unauthorized' });
}

app.use('/api', (req, res, next) => {
  const header = req.header('authorization') ?? '';
  const queryToken = typeof req.query.t === 'string' ? req.query.t : '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : queryToken;
  const expected = Buffer.from(String(API_TOKEN));
  const given = Buffer.from(token);
  const ok =
    given.length === expected.length &&
    crypto.timingSafeEqual(given, expected);
  if (!ok) {
    unauthorized(res);
    return;
  }
  authToken = token;
  next();
});

type Row = Record<string, any>;

function toFolder(r: Row) {
  return { id: r.id, name: r.name, icon: r.icon, color: r.color, createdAt: r.created_at };
}

function toSet(r: Row) {
  return {
    id: r.id,
    folderId: r.folder_id,
    title: r.title,
    description: r.description,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toAtt(r: Row) {
  const t = encodeURIComponent(authToken);
  return { id: r.id, type: r.type, name: r.name, url: `/api/attachments/${r.id}?t=${t}` };
}

function toSession(r: Row) {
  return {
    setId: r.set_id,
    queue: r.queue,
    currentIndex: r.current_index,
    known: r.known,
    unknown: r.unknown,
    history: r.history,
    isComplete: r.is_complete,
    updatedAt: r.updated_at,
  };
}

function decodeDataUrl(data: string): { mime: string; buf: Buffer } | null {
  if (typeof data !== 'string' || !data.includes(',')) return null;
  const [head, b64] = data.split(',');
  const mime = head.match(/^data:([^;]+)/)?.[1] ?? 'application/octet-stream';
  return { mime, buf: Buffer.from(b64, 'base64') };
}

async function readAtts(client: any, cardId: number) {
  const r = await client.query(
    'SELECT id, type, name, mime FROM attachments WHERE card_id = $1 ORDER BY ordinal, id',
    [cardId]
  );
  return r.rows.map(toAtt);
}

async function readAttsBatch(client: any, cardIds: number[]): Promise<Map<number, any[]>> {
  const byCard = new Map<number, any[]>();
  if (cardIds.length === 0) return byCard;
  const r = await client.query(
    'SELECT card_id, id, type, name, mime FROM attachments WHERE card_id = ANY($1::int[]) ORDER BY ordinal, id',
    [cardIds]
  );
  for (const row of r.rows) {
    const list = byCard.get(row.card_id) ?? [];
    list.push(toAtt(row));
    byCard.set(row.card_id, list);
  }
  return byCard;
}

async function syncAttachments(client: any, cardId: number, items: any[]) {
  if (!Array.isArray(items)) return readAtts(client, cardId);

  const current = (
    await client.query('SELECT id FROM attachments WHERE card_id = $1 ORDER BY ordinal, id', [cardId])
  ).rows as { id: number }[];

  const received = items.filter((i) => i != null);
  const keepIds = received.filter((i) => i.id != null).map((i) => Number(i.id));

  if (keepIds.length === 0) {
    if (current.length > 0) await client.query('DELETE FROM attachments WHERE card_id = $1', [cardId]);
  } else {
    await client.query('DELETE FROM attachments WHERE card_id = $1 AND id <> ALL($2::int[])', [
      cardId,
      keepIds,
    ]);
  }

  const maxOrd = current.length > 0
    ? (await client.query('SELECT COALESCE(MAX(ordinal),0) AS m FROM attachments WHERE card_id = $1', [cardId]))
        .rows[0].m
    : 0;

  let ordinal = Number(maxOrd);
  for (const item of received) {
    const id = item.id != null ? Number(item.id) : null;
    const name = typeof item.name === 'string' ? item.name : '';
    const type = item.type === 'audio' ? 'audio' : 'image';
    if (id != null) {
      await client.query(
        'UPDATE attachments SET name = $1, type = $2 WHERE id = $3 AND card_id = $4',
        [name, type, id, cardId]
      );
    } else if (typeof item.data === 'string') {
      const decoded = decodeDataUrl(item.data);
      if (!decoded) continue;
      ordinal += 1;
      await client.query(
        `INSERT INTO attachments (card_id, type, name, mime, ordinal, data)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [cardId, type, name, decoded.mime, ordinal, decoded.buf]
      );
    }
  }

  return readAtts(client, cardId);
}

function toCardRow(r: Row) {
  return {
    id: r.id,
    setId: r.set_id,
    term: r.term,
    definition: r.definition,
    createdAt: r.created_at,
  };
}

async function withAtts(client: any, rows: Row[]) {
  const attMap = await readAttsBatch(client, rows.map(r => r.id));
  return rows.map(r => ({ ...toCardRow(r), definitionAttachments: attMap.get(r.id) ?? [] }));
}

async function insertCards(client: any, setId: number, items: any[]) {
  const created: Row[] = [];
  const base = (
    await client.query('SELECT COALESCE(MAX(position), 0) AS m FROM cards WHERE set_id = $1', [setId])
  ).rows[0].m;
  let position = Number(base);
  for (const item of items) {
    if (item == null || (item.term == null && item.definition == null)) continue;
    position += 1;
    const r = await client.query(
      `INSERT INTO cards (set_id, term, definition, position, created_at)
       VALUES ($1, $2, $3, $4, now()) RETURNING *`,
      [setId, item.term ?? '', item.definition ?? '', position]
    );
    const card = r.rows[0];
    if (item.definitionAttachments != null && item.definitionAttachments.length > 0) {
      await syncAttachments(client, card.id, item.definitionAttachments);
    }
    created.push(card);
  }
  return withAtts(client, created);
}

async function loadCards(client: any, setId?: number) {
  const q = setId != null
    ? { text: 'SELECT * FROM cards WHERE set_id = $1 ORDER BY position, id', values: [setId] }
    : { text: 'SELECT * FROM cards ORDER BY position, id' };
  const r = await client.query(q);
  return withAtts(client, r.rows);
}

// ── State ────────────────────────────────────────────────────────────

app.get('/api/state', async (_req, res) => {
  const folders = (await pool.query('SELECT * FROM folders ORDER BY id')).rows.map(toFolder);
  const sets = (await pool.query('SELECT * FROM sets ORDER BY id')).rows.map(toSet);
  const cards = await loadCards(pool as any);
  const sessions = (await pool.query('SELECT * FROM practice_sessions ORDER BY set_id')).rows.map(toSession);
  const attCount = (
    await pool.query('SELECT count(*)::int AS c FROM attachments')
  ).rows[0].c;
  res.json({ folders, sets, cards, practiceSessions: sessions, attachmentCount: attCount });
});

// ── Folders ──────────────────────────────────────────────────────────

app.post('/api/folders', async (req, res) => {
  const r = await pool.query(
    'INSERT INTO folders (name, icon, color, created_at) VALUES ($1,$2,$3,now()) RETURNING *',
    [req.body?.name ?? '', req.body?.icon ?? '', req.body?.color ?? '']
  );
  res.status(201).json(toFolder(r.rows[0]));
});

app.patch('/api/folders/:id', async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body ?? {};
  const r = await pool.query(
    'UPDATE folders SET name = COALESCE($2, name), icon = COALESCE($3, icon), color = COALESCE($4, color) WHERE id = $1 RETURNING *',
    [id, b.name != null ? b.name : null, b.icon != null ? b.icon : null, b.color != null ? b.color : null]
  );
  if (r.rowCount === 0) return res.status(404).json({ error: 'Not found' });
  res.json(toFolder(r.rows[0]));
});

app.delete('/api/folders/:id', async (req, res) => {
  await pool.query('DELETE FROM folders WHERE id = $1', [Number(req.params.id)]);
  res.status(204).end();
});

// ── Sets ─────────────────────────────────────────────────────────────

app.post('/api/sets', async (req, res) => {
  const b = req.body ?? {};
  const folderId = b.folderId != null ? Number(b.folderId) : null;
  if (folderId != null) {
    const exists = await pool.query('SELECT 1 FROM folders WHERE id = $1', [folderId]);
    if (exists.rowCount === 0) return res.status(400).json({ error: 'Folder not found' });
  }
  const r = await pool.query(
    `INSERT INTO sets (folder_id, title, description, created_at, updated_at)
     VALUES ($1,$2,$3,now(),now()) RETURNING *`,
    [folderId, b.title ?? '', b.description ?? '']
  );
  res.status(201).json(toSet(r.rows[0]));
});

app.patch('/api/sets/:id', async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body ?? {};
  const r = await pool.query(
    `UPDATE sets
     SET folder_id = CASE WHEN $2 = -1 THEN folder_id ELSE $2 END,
         title = COALESCE($3, title),
         description = COALESCE($4, description),
         updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, b.folderId != null ? Number(b.folderId) : -1, b.title != null ? b.title : null, b.description != null ? b.description : null]
  );
  if (r.rowCount === 0) return res.status(404).json({ error: 'Not found' });
  res.json(toSet(r.rows[0]));
});

app.delete('/api/sets/:id', async (req, res) => {
  await pool.query('DELETE FROM sets WHERE id = $1', [Number(req.params.id)]);
  res.status(204).end();
});

// ── Cards ────────────────────────────────────────────────────────────

app.get('/api/sets/:id/cards', async (req, res) => {
  const cards = await loadCards(pool as any, Number(req.params.id));
  res.json(cards);
});

app.post('/api/sets/:id/cards', async (req, res) => {
  const setId = Number(req.params.id);
  const exists = await pool.query('SELECT 1 FROM sets WHERE id = $1', [setId]);
  if (exists.rowCount === 0) return res.status(404).json({ error: 'Set not found' });
  const body = Array.isArray(req.body) ? req.body : [req.body];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const created = await insertCards(client, setId, body);
    await client.query('COMMIT');
    res.status(201).json(created);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

app.put('/api/sets/:id/order', async (req, res) => {
  const setId = Number(req.params.id);
  const ids = Array.isArray(req.body?.cardIds)
    ? req.body.cardIds.map((x: unknown) => Number(x)).filter((n: number) => Number.isInteger(n) && n > 0)
    : [];
  const exists = await pool.query('SELECT 1 FROM sets WHERE id = $1', [setId]);
  if (exists.rowCount === 0) return res.status(404).json({ error: 'Set not found' });
  if (ids.length > 0) {
    await pool.query(
      `UPDATE cards SET position = t.pos
       FROM unnest($1::int[]) WITH ORDINALITY AS t(id, pos)
       WHERE cards.id = t.id AND cards.set_id = $2`,
      [ids, setId]
    );
  }
  res.status(204).end();
});

app.patch('/api/cards/:id', async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body ?? {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `UPDATE cards SET term = COALESCE($2, term), definition = COALESCE($3, definition)
       WHERE id = $1 RETURNING *`,
      [id, b.term != null ? b.term : null, b.definition != null ? b.definition : null]
    );
    if (r.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Not found' });
    }
    if (b.definitionAttachments !== undefined) {
      await syncAttachments(client, id, b.definitionAttachments);
    }
    const card = { ...toCardRow(r.rows[0]), definitionAttachments: await readAtts(client, id) };
    await client.query('COMMIT');
    res.json(card);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

app.delete('/api/cards/:id', async (req, res) => {
  await pool.query('DELETE FROM cards WHERE id = $1', [Number(req.params.id)]);
  res.status(204).end();
});

// ── Attachments ──────────────────────────────────────────────────────

app.get('/api/attachments/:id', async (req, res) => {
  const r = await pool.query('SELECT type, name, mime, data FROM attachments WHERE id = $1', [
    Number(req.params.id),
  ]);
  if (r.rowCount === 0) return res.status(404).end();
  const a = r.rows[0];
  res.setHeader('Content-Type', a.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(a.name)}"`);
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.send(a.data);
});

// ── Practice sessions ────────────────────────────────────────────────

app.get('/api/sets/:id/session', async (req, res) => {
  const r = await pool.query('SELECT * FROM practice_sessions WHERE set_id = $1', [
    Number(req.params.id),
  ]);
  res.json(r.rowCount ? toSession(r.rows[0]) : null);
});

app.put('/api/sets/:id/session', async (req, res) => {
  const setId = Number(req.params.id);
  const b = req.body ?? {};
  await pool.query(
    `INSERT INTO practice_sessions (set_id, queue, current_index, known, unknown, history, is_complete, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,now())
     ON CONFLICT (set_id) DO UPDATE SET
       queue = EXCLUDED.queue,
       current_index = EXCLUDED.current_index,
       known = EXCLUDED.known,
       unknown = EXCLUDED.unknown,
       history = EXCLUDED.history,
       is_complete = EXCLUDED.is_complete,
       updated_at = now()`,
    [
      setId,
      Array.isArray(b.queue) ? b.queue.map(Number) : [],
      Number(b.currentIndex ?? 0),
      Array.isArray(b.known) ? b.known.map(Number) : [],
      Array.isArray(b.unknown) ? b.unknown.map(Number) : [],
      Array.isArray(b.history) ? b.history.map(Number) : [],
      !!b.isComplete,
    ]
  );
  const r = await pool.query('SELECT * FROM practice_sessions WHERE set_id = $1', [setId]);
  res.json(toSession(r.rows[0]));
});

app.delete('/api/sets/:id/session', async (req, res) => {
  await pool.query('DELETE FROM practice_sessions WHERE set_id = $1', [Number(req.params.id)]);
  res.status(204).end();
});

// ── Error handling + SPA in production ───────────────────────────────

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  res.sendFile(path.join(DIST_DIR, 'index.html'), (err) => {
    if (err) next();
  });
});

app.listen(PORT, HOST, () => {
  console.log(`Flashmind API listening on http://${HOST}:${PORT} (token auth enabled)`);
});