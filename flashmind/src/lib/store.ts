import type { Folder, FlashcardSet, Card } from './types';
import * as fsdb from './fsdb';

// In-memory cache — reads are sync, writes update cache + persist async.
let _folders: Folder[] = [];
let _sets: FlashcardSet[] = [];
let _cards: Card[] = [];
let _loaded = false;

// Multiple listeners support
const _listeners = new Set<() => void>();
export function onChange(cb: () => void) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}
function notify() {
  for (const cb of _listeners) cb();
}

export function isLoaded() { return _loaded; }

export async function init(): Promise<'ready' | 'need-folder'> {
  if (_loaded) return 'ready';

  const restored = await fsdb.restoreFolder();
  if (!restored) return 'need-folder';

  const data = await fsdb.loadAll();
  _folders = Array.isArray(data.folders) ? data.folders : [];
  _sets = Array.isArray(data.sets) ? data.sets : [];
  _cards = Array.isArray(data.cards) ? data.cards : [];
  _loaded = true;
  notify();
  return 'ready';
}

export async function setFolder(): Promise<boolean> {
  const ok = await fsdb.pickFolder();
  if (!ok) return false;
  const data = await fsdb.loadAll();
  _folders = Array.isArray(data.folders) ? data.folders : [];
  _sets = Array.isArray(data.sets) ? data.sets : [];
  _cards = Array.isArray(data.cards) ? data.cards : [];
  _loaded = true;
  notify();
  return true;
}

// Debounced persistence — batch rapid writes into a single file write.
let _persistTimer: ReturnType<typeof setTimeout> | null = null;
let _pendingPersist = false;

function schedulePersist() {
  _pendingPersist = true;
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(flushPersist, 100);
}

function flushPersist() {
  if (!_pendingPersist) return;
  _pendingPersist = false;
  if (_persistTimer) { clearTimeout(_persistTimer); _persistTimer = null; }
  fsdb.saveAll({ folders: _folders, sets: _sets, cards: _cards }).catch(err => {
    console.error('Failed to save data:', err);
  });
}

// Flush pending writes when the tab is about to close.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (_pendingPersist) flushPersist();
  });
}

function nextId<T extends { id?: number }>(all: T[]): number {
  let max = 0;
  for (const item of all) {
    if (typeof item.id === 'number' && Number.isFinite(item.id) && item.id > max) {
      max = item.id;
    }
  }
  return max + 1;
}

// ── Folders ──────────────────────────────────────────────────────────

export function getAllFolders(): Folder[] { return _folders; }
export function getFolder(id: number): Folder | undefined { return _folders.find(f => f.id === id); }

export async function addFolder(folder: Omit<Folder, 'id' | 'createdAt'>): Promise<Folder> {
  const newFolder: Folder = { ...folder, id: nextId(_folders), createdAt: new Date() };
  _folders.push(newFolder);
  schedulePersist();
  notify();
  return newFolder;
}

export async function updateFolder(id: number, changes: Partial<Folder>): Promise<void> {
  const idx = _folders.findIndex(f => f.id === id);
  if (idx === -1) return;
  _folders[idx] = { ..._folders[idx], ...changes };
  schedulePersist();
  notify();
}

export async function deleteFolder(id: number): Promise<void> {
  _folders = _folders.filter(f => f.id !== id);
  _sets = _sets.map(s => s.folderId === id ? { ...s, folderId: null } : s);
  schedulePersist();
  notify();
}

// ── Sets ─────────────────────────────────────────────────────────────

export function getAllSets(): FlashcardSet[] { return _sets; }
export function getSet(id: number): FlashcardSet | undefined { return _sets.find(s => s.id === id); }
export function getSetsByFolder(folderId: number): FlashcardSet[] { return _sets.filter(s => s.folderId === folderId); }

export async function addSet(set: Omit<FlashcardSet, 'id' | 'createdAt' | 'updatedAt'>): Promise<FlashcardSet> {
  const newSet: FlashcardSet = { ...set, id: nextId(_sets), createdAt: new Date(), updatedAt: new Date() };
  _sets.push(newSet);
  schedulePersist();
  notify();
  return newSet;
}

export async function updateSet(id: number, changes: Partial<FlashcardSet>): Promise<void> {
  const idx = _sets.findIndex(s => s.id === id);
  if (idx === -1) return;
  _sets[idx] = { ..._sets[idx], ...changes, updatedAt: new Date() };
  schedulePersist();
  notify();
}

export async function deleteSet(id: number): Promise<void> {
  _sets = _sets.filter(s => s.id !== id);
  _cards = _cards.filter(c => c.setId !== id);
  schedulePersist();
  notify();
}

// ── Cards ────────────────────────────────────────────────────────────

export function getAllCards(): Card[] { return _cards; }
export function getCardsBySet(setId: number): Card[] { return _cards.filter(c => c.setId === setId); }

export async function addCards(cards: Omit<Card, 'id' | 'createdAt'>[]): Promise<Card[]> {
  let idCounter = nextId(_cards);
  const newCards: Card[] = cards.map(c => ({
    ...c,
    id: idCounter++,
    createdAt: new Date(),
  }));
  _cards.push(...newCards);
  schedulePersist();
  notify();
  return newCards;
}

export async function updateCard(id: number, changes: Partial<Card>): Promise<void> {
  const idx = _cards.findIndex(c => c.id === id);
  if (idx === -1) return;
  _cards[idx] = { ..._cards[idx], ...changes };
  schedulePersist();
  notify();
}

export async function deleteCard(id: number): Promise<void> {
  _cards = _cards.filter(c => c.id !== id);
  schedulePersist();
  notify();
}

export function deduplicateCards(setId: number): void {
  const setCards = _cards.filter(c => c.setId === setId);
  const seen = new Map<string, Card>();
  const toKeep = new Set<number>();

  for (const card of setCards) {
    const key = `${card.term}|||${card.definition}`;
    const existing = seen.get(key);
    if (!existing || card.definition.length > existing.definition.length) {
      seen.set(key, card);
    }
  }

  for (const card of seen.values()) {
    toKeep.add(card.id!);
  }

  const otherCards = _cards.filter(c => c.setId !== setId);
  const dedupedSetCards = setCards.filter(c => toKeep.has(c.id!));
  _cards = [...otherCards, ...dedupedSetCards];
  schedulePersist();
  notify();
}
