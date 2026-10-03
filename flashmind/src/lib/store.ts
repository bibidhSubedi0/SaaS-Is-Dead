import type { Folder, FlashcardSet, Card, PracticeSession, Attachment } from './types';
import { api, setToken as persistToken, clearToken, hasToken } from './db';

let _folders: Folder[] = [];
let _sets: FlashcardSet[] = [];
let _cards: Card[] = [];
let _cardsBySet = new Map<number, Card[]>();
let _practiceSessions: PracticeSession[] = [];
let _loaded = false;

function buildCardsIndex(cards: Card[]): Map<number, Card[]> {
  const m = new Map<number, Card[]>();
  for (const c of cards) {
    const list = m.get(c.setId);
    if (list) list.push(c);
    else m.set(c.setId, [c]);
  }
  return m;
}

const _listeners = new Set<() => void>();
export function onChange(cb: () => void) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}
function notify() {
  for (const cb of _listeners) cb();
}

export function isLoaded() { return _loaded; }

export async function init(): Promise<'ready' | 'need-token'> {
  if (!hasToken()) return 'need-token';
  try {
    const data = await api.getState();
    _folders = data.folders;
    _sets = data.sets;
    _cards = data.cards;
    _cardsBySet = buildCardsIndex(_cards);
    _practiceSessions = data.practiceSessions;
    _loaded = true;
    notify();
    return 'ready';
  } catch (err) {
    if (err instanceof Error && err.message.includes('401')) {
      clearToken();
      return 'need-token';
    }
    throw err;
  }
}

export async function setToken(token: string): Promise<'ready' | 'need-token'> {
  persistToken(token.trim());
  _loaded = false;
  return init();
}

function mapFolder(f: Folder): Folder {
  return { id: f.id, name: f.name, icon: f.icon, color: f.color, createdAt: f.createdAt };
}
function mapSet(s: FlashcardSet): FlashcardSet {
  return {
    id: s.id,
    folderId: s.folderId ?? null,
    title: s.title,
    description: s.description,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}
function mapCard(c: Card): Card {
  return {
    id: c.id,
    setId: c.setId,
    term: c.term,
    definition: c.definition,
    definitionAttachments: c.definitionAttachments ?? [],
    createdAt: c.createdAt,
  };
}

// ── Folders ──────────────────────────────────────────────────────────

export function getAllFolders(): Folder[] { return _folders; }
export function getFolder(id: number): Folder | undefined { return _folders.find(f => f.id === id); }

export async function addFolder(folder: Omit<Folder, 'id' | 'createdAt'>): Promise<Folder> {
  const created = mapFolder(await api.addFolder({ name: folder.name, icon: folder.icon, color: folder.color }));
  _folders.push(created);
  notify();
  return created;
}

export async function updateFolder(id: number, changes: Partial<Folder>): Promise<void> {
  const body: { name?: string; icon?: string; color?: string } = {};
  if (changes.name !== undefined) body.name = changes.name;
  if (changes.icon !== undefined) body.icon = changes.icon;
  if (changes.color !== undefined) body.color = changes.color;
  const updated = mapFolder(await api.updateFolder(id, body));
  const idx = _folders.findIndex(f => f.id === id);
  if (idx !== -1) _folders[idx] = updated;
  notify();
}

export async function deleteFolder(id: number): Promise<void> {
  await api.deleteFolder(id);
  _folders = _folders.filter(f => f.id !== id);
  _sets = _sets.map(s => s.folderId === id ? { ...s, folderId: null } : s);
  notify();
}

// ── Sets ─────────────────────────────────────────────────────────────

export function getAllSets(): FlashcardSet[] { return _sets; }
export function getSet(id: number): FlashcardSet | undefined { return _sets.find(s => s.id === id); }
export function getSetsByFolder(folderId: number): FlashcardSet[] { return _sets.filter(s => s.folderId === folderId); }

export async function addSet(set: Omit<FlashcardSet, 'id' | 'createdAt' | 'updatedAt'>): Promise<FlashcardSet> {
  const created = mapSet(await api.addSet({
    folderId: set.folderId ?? null,
    title: set.title,
    description: set.description,
  }));
  _sets.push(created);
  notify();
  return created;
}

export async function updateSet(id: number, changes: Partial<FlashcardSet>): Promise<void> {
  const body: { title?: string; description?: string; folderId?: number | null } = {};
  if (changes.title !== undefined) body.title = changes.title;
  if (changes.description !== undefined) body.description = changes.description;
  if (changes.folderId !== undefined) body.folderId = changes.folderId;
  const updated = mapSet(await api.updateSet(id, body));
  const idx = _sets.findIndex(s => s.id === id);
  if (idx !== -1) _sets[idx] = updated;
  notify();
}

export async function deleteSet(id: number): Promise<void> {
  await api.deleteSet(id);
  _sets = _sets.filter(s => s.id !== id);
  _cards = _cards.filter(c => c.setId !== id);
  _cardsBySet.delete(id);
  _practiceSessions = _practiceSessions.filter(p => p.setId !== id);
  notify();
}

// ── Cards ────────────────────────────────────────────────────────────

export function getAllCards(): Card[] { return _cards; }
export function getCardsBySet(setId: number): Card[] { return _cardsBySet.get(setId) ?? []; }

export async function addCards(cards: Omit<Card, 'id' | 'createdAt'>[]): Promise<Card[]> {
  if (cards.length === 0) return [];
  const setId = cards[0].setId;
  const created = (await api.addCards(
    setId,
    cards.map(c => ({
      setId,
      term: c.term,
      definition: c.definition,
      definitionAttachments: c.definitionAttachments,
    }))
  )).map(mapCard);
  _cards.push(...created);
  const list = _cardsBySet.get(setId) ?? [];
  list.push(...created);
  _cardsBySet.set(setId, list);
  notify();
  return created;
}

export async function reorderCards(setId: number, cardIds: number[]): Promise<void> {
  await api.reorderCards(setId, cardIds);
  const list = _cardsBySet.get(setId);
  if (!list) return;
  const byId = new Map(list.map(c => [c.id, c]));
  const ordered = cardIds
    .map(id => byId.get(id))
    .filter((c): c is Card => c != null);
  const rest = list.filter(c => !ordered.some(o => o.id === c.id));
  const next = [...ordered, ...rest];
  _cardsBySet.set(setId, next);
  _cards = _cards.filter(c => c.setId !== setId).concat(next);
  notify();
}

export async function updateCard(id: number, changes: Partial<Card>): Promise<void> {
  const body: { term?: string; definition?: string; definitionAttachments?: Attachment[] } = {};
  if (changes.term !== undefined) body.term = changes.term;
  if (changes.definition !== undefined) body.definition = changes.definition;
  if (changes.definitionAttachments !== undefined) body.definitionAttachments = changes.definitionAttachments;
  const updated = mapCard(await api.updateCard(id, body));
  const idx = _cards.findIndex(c => c.id === id);
  if (idx !== -1) {
    _cards[idx] = updated;
    const list = _cardsBySet.get(updated.setId);
    if (list) {
      const listIdx = list.findIndex(c => c.id === id);
      if (listIdx !== -1) list[listIdx] = updated;
    }
  }
  notify();
}

export async function deleteCard(id: number): Promise<void> {
  await api.deleteCard(id);
  const removed = _cards.find(c => c.id === id);
  _cards = _cards.filter(c => c.id !== id);
  if (removed) {
    const list = _cardsBySet.get(removed.setId);
    if (list) {
      const filtered = list.filter(c => c.id !== id);
      if (filtered.length === 0) _cardsBySet.delete(removed.setId);
      else _cardsBySet.set(removed.setId, filtered);
    }
  }
  notify();
}

// ── Practice sessions ────────────────────────────────────────────────

export function getPracticeSession(setId: number): PracticeSession | undefined {
  return _practiceSessions.find(p => p.setId === setId);
}

export async function savePracticeSession(session: PracticeSession): Promise<void> {
  const saved = await api.saveSession(session.setId, session);
  const idx = _practiceSessions.findIndex(p => p.setId === session.setId);
  if (idx === -1) {
    _practiceSessions.push(saved);
  } else {
    _practiceSessions[idx] = saved;
  }
  notify();
}

export async function deletePracticeSession(setId: number): Promise<void> {
  await api.deleteSession(setId);
  _practiceSessions = _practiceSessions.filter(p => p.setId !== setId);
  notify();
}