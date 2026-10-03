import type { Folder, FlashcardSet, Card, PracticeSession } from './types';

const TOKEN_KEY = 'flashmind-token';

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function hasToken(): boolean {
  return getToken().length > 0;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new Error('Cannot reach the Flashmind server');
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) msg = String(j.error);
    } catch { /* non-JSON error */ }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export interface State {
  folders: Folder[];
  sets: FlashcardSet[];
  cards: Card[];
  practiceSessions: PracticeSession[];
}

export const api = {
  getState: () => request<State>('/api/state'),

  addFolder: (f: { name: string; icon: string; color: string }) =>
    request<Folder>('/api/folders', { method: 'POST', body: JSON.stringify(f) }),
  updateFolder: (id: number, changes: Partial<Folder>) =>
    request<Folder>(`/api/folders/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }),
  deleteFolder: (id: number) => request<void>(`/api/folders/${id}`, { method: 'DELETE' }),

  addSet: (s: { folderId: number | null; title: string; description: string }) =>
    request<FlashcardSet>('/api/sets', { method: 'POST', body: JSON.stringify(s) }),
  updateSet: (id: number, changes: Partial<FlashcardSet>) =>
    request<FlashcardSet>(`/api/sets/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }),
  deleteSet: (id: number) => request<void>(`/api/sets/${id}`, { method: 'DELETE' }),

  addCards: (setId: number, items: Omit<Card, 'id' | 'createdAt'>[]) =>
    request<Card[]>(`/api/sets/${setId}/cards`, { method: 'POST', body: JSON.stringify(items) }),
  reorderCards: (setId: number, cardIds: number[]) =>
    request<void>(`/api/sets/${setId}/order`, {
      method: 'PUT',
      body: JSON.stringify({ cardIds }),
    }),
  updateCard: (id: number, changes: Partial<Card>) =>
    request<Card>(`/api/cards/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }),
  deleteCard: (id: number) => request<void>(`/api/cards/${id}`, { method: 'DELETE' }),

  getSession: (setId: number) => request<PracticeSession | null>(`/api/sets/${setId}/session`),
  saveSession: (setId: number, session: PracticeSession) =>
    request<PracticeSession>(`/api/sets/${setId}/session`, {
      method: 'PUT',
      body: JSON.stringify(session),
    }),
  deleteSession: (setId: number) => request<void>(`/api/sets/${setId}/session`, { method: 'DELETE' }),
};