import { readFileSync } from 'fs';
import pg from 'pg';

const JSON_PATH = process.env.FLASHMIND_JSON ?? 'C:/Users/Bibidh/Documents/Flashmind/flashmind.json';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://flashmind:flashmind@127.0.0.1:5432/flashmind';

const raw = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
const folders = raw.folders ?? [];
const sets = raw.sets ?? [];
const cards = raw.cards ?? [];
const sessions = raw.practiceSessions ?? [];

console.log(`JSON: ${folders.length} folders, ${sets.length} sets, ${cards.length} cards, ${sessions.length} sessions`);

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

function iso(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

try {
  await client.query('BEGIN');

  const folderIds = new Set();
  for (const f of folders) {
    if (f.id == null) continue;
    folderIds.add(f.id);
    await client.query(
      'INSERT INTO folders (id, name, icon, color, created_at) VALUES ($1,$2,$3,$4,$5)',
      [f.id, f.name ?? '', f.icon ?? '', f.color ?? '', iso(f.createdAt)]
    );
  }

  const setIds = new Set();
  for (const s of sets) {
    if (s.id == null) continue;
    const isValid = folderIds.has(s.folderId) || s.folderId == null;
    const folderId = isValid && s.folderId != null ? s.folderId : null;
    setIds.add(s.id);
    await client.query(
      'INSERT INTO sets (id, folder_id, title, description, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [s.id, folderId, s.title ?? '', s.description ?? '', iso(s.createdAt), iso(s.updatedAt)]
    );
  }

  let cardCount = 0;
  for (const c of cards) {
    if (c.id == null || !setIds.has(c.setId)) continue;
    cardCount++;
    await client.query(
      'INSERT INTO cards (id, set_id, term, definition, created_at) VALUES ($1,$2,$3,$4,$5)',
      [c.id, c.setId, c.term ?? '', c.definition ?? '', iso(c.createdAt)]
    );
  }

  let attachmentCount = 0;
  for (const c of cards) {
    if (c.id == null || !c.definitionAttachments?.length) continue;
    if (!setIds.has(c.setId)) continue;
    const atts = c.definitionAttachments;
    for (let i = 0; i < atts.length; i++) {
      const a = atts[i];
      if (typeof a?.data !== 'string' || !a.data.includes(',')) continue;
      const [head, b64] = a.data.split(',');
      const mime = head.match(/^data:([^;]+)/)?.[1] ?? 'application/octet-stream';
      const buf = Buffer.from(b64, 'base64');
      attachmentCount++;
      await client.query(
        'INSERT INTO attachments (card_id, type, name, mime, ordinal, data, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [c.id, a.type === 'audio' ? 'audio' : 'image', a.name ?? '', mime, i, buf, iso(c.createdAt)]
      );
    }
  }

  let sessionCount = 0;
  for (const p of sessions) {
    if (p == null || !setIds.has(p.setId)) continue;
    sessionCount++;
    await client.query(
      `INSERT INTO practice_sessions (set_id, queue, current_index, known, unknown, history, is_complete, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        p.setId,
        Array.isArray(p.queue) ? p.queue : [],
        p.currentIndex ?? 0,
        Array.isArray(p.known) ? p.known : [],
        Array.isArray(p.unknown) ? p.unknown : [],
        Array.isArray(p.history) ? p.history : [],
        !!p.isComplete,
        iso(p.updatedAt),
      ]
    );
  }

  const tableMax = async (table, col) =>
    (await client.query(`SELECT COALESCE(MAX(${col}),0) AS m FROM ${table}`)).rows[0].m;
  const setvals = [
    ['folders_id_seq', await tableMax('folders', 'id')],
    ['sets_id_seq', await tableMax('sets', 'id')],
    ['cards_id_seq', await tableMax('cards', 'id')],
    ['attachments_id_seq', await tableMax('attachments', 'id')],
  ];
  for (const [seq, max] of setvals) {
    await client.query(`SELECT setval('${seq}', $1::bigint, ($1::bigint > 0))`, [max]);
  }

  await client.query('COMMIT');

  const verify = await client.query(`
    SELECT
      (SELECT count(*) FROM folders) AS folders,
      (SELECT count(*) FROM sets) AS sets,
      (SELECT count(*) FROM cards) AS cards,
      (SELECT count(*) FROM attachments) AS attachments,
      (SELECT count(*) FROM practice_sessions) AS ps,
      (SELECT COALESCE(sum(octet_length(data)),0) FROM attachments) AS att_bytes
  `);
  console.log('DB  :', verify.rows[0]);
  const v = verify.rows[0];
  const c = { folders: Number(v.folders), sets: Number(v.sets), cards: Number(v.cards), attachments: Number(v.attachments), ps: Number(v.ps) };
  console.log('compared → folders', folders.length + '/' + c.folders, '| sets', sets.length + '/' + c.sets, '| cards', cardCount + '/' + c.cards, '| attachments', attachmentCount + '/' + c.attachments, '| sessions', sessionCount + '/' + c.ps);
  if (folderIds.size !== c.folders || setIds.size !== c.sets ||
      cardCount !== c.cards || attachmentCount !== c.attachments ||
      sessionCount !== c.ps) {
    console.error('MISMATCH — counts do not match!');
    process.exitCode = 1;
  } else {
    console.log('MIGRATION OK');
  }
} catch (err) {
  await client.query('ROLLBACK');
  console.error('Migration failed, rolled back:', err);
  process.exit(1);
} finally {
  await client.end();
}