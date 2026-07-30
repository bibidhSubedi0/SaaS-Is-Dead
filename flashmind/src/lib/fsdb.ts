import type { Folder, FlashcardSet, Card } from './types';

const FILE_NAME = 'flashmind.json';
const BACKUP_NAME = 'flashmind.json.bak';
const IDB_KEY = 'flashmind-dir-handle';

interface DataStore {
  folders: Folder[];
  sets: FlashcardSet[];
  cards: Card[];
}

function isValidDataStore(data: any): data is DataStore {
  return (
    data !== null &&
    typeof data === 'object' &&
    Array.isArray(data.folders) &&
    Array.isArray(data.sets) &&
    Array.isArray(data.cards)
  );
}

let dirHandle: FileSystemDirectoryHandle | null = null;

// Store directory handle in IndexedDB so we can reuse it across sessions.
function cacheHandle(handle: FileSystemDirectoryHandle) {
  const req = indexedDB.open('flashmind-fs', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('handles');
  req.onsuccess = () => {
    req.result.transaction('handles', 'readwrite').objectStore('handles').put(handle, IDB_KEY);
  };
}

function getCachedHandle(): Promise<FileSystemDirectoryHandle | null> {
  return new Promise(resolve => {
    const req = indexedDB.open('flashmind-fs', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('handles');
    req.onsuccess = () => {
      const tx = req.result.transaction('handles', 'readonly');
      const get = tx.objectStore('handles').get(IDB_KEY);
      get.onsuccess = () => resolve(get.result ?? null);
      get.onerror = () => resolve(null);
    };
    req.onerror = () => resolve(null);
  });
}

export function isSupported(): boolean {
  return 'showDirectoryPicker' in window;
}

export async function pickFolder(): Promise<boolean> {
  try {
    const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    dirHandle = handle;
    cacheHandle(handle);
    return true;
  } catch {
    return false;
  }
}

export async function restoreFolder(): Promise<boolean> {
  const cached = await getCachedHandle();
  if (!cached) return false;
  try {
    const state = await (cached as any).requestPermission({ mode: 'readwrite' });
    if (state === 'granted') {
      dirHandle = cached;
      return true;
    }
  } catch { /* handle gone */ }
  return false;
}

async function readData(): Promise<DataStore> {
  if (!dirHandle) return { folders: [], sets: [], cards: [] };

  // Try primary file first
  let parsed = await tryReadFile(FILE_NAME);

  // If primary is corrupt, try backup
  if (parsed === null) {
    console.warn('flashmind.json is corrupt or unreadable, trying backup...');
    parsed = await tryReadFile(BACKUP_NAME);
  }

  // If both are corrupt, return empty (but don't overwrite yet — let the user know)
  if (parsed === null || !isValidDataStore(parsed)) {
    console.error('Both flashmind.json and backup are corrupt or missing. Starting fresh.');
    return { folders: [], sets: [], cards: [] };
  }

  return { folders: parsed.folders, sets: parsed.sets, cards: parsed.cards };
}

async function tryReadFile(name: string): Promise<DataStore | null> {
  if (!dirHandle) return null;
  try {
    const fileHandle = await dirHandle.getFileHandle(name);
    const file = await fileHandle.getFile();
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (isValidDataStore(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}

async function writeData(data: DataStore): Promise<void> {
  if (!dirHandle) throw new Error('No folder selected');

  // Back up current file before overwriting
  try {
    const existingHandle = await dirHandle.getFileHandle(FILE_NAME);
    const existingFile = await existingHandle.getFile();
    const existingText = await existingFile.text();
    const backupHandle = await dirHandle.getFileHandle(BACKUP_NAME, { create: true });
    const backupWritable = await backupHandle.createWritable();
    await backupWritable.write(existingText);
    await backupWritable.close();
  } catch {
    // File doesn't exist yet (first save) — skip backup
  }

  const fileHandle = await dirHandle.getFileHandle(FILE_NAME, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

// ── Public API ───────────────────────────────────────────────────────

export async function loadAll(): Promise<DataStore> {
  return readData();
}

export async function saveAll(data: DataStore): Promise<void> {
  await writeData(data);
}
