import { useState, useEffect, useCallback } from 'react';
import type { Folder, FlashcardSet, Card } from '../lib/types';
import * as store from '../lib/store';

export function useDBState() {
  const [state, setState] = useState<'loading' | 'ready' | 'need-token'>(
    store.isLoaded() ? 'ready' : 'loading'
  );

  useEffect(() => {
    if (store.isLoaded()) { setState('ready'); return; }
    store.init()
      .then(setState)
      .catch(() => setState('need-token'));
  }, []);

  const submitToken = useCallback(async (token: string) => {
    setState('loading');
    const result = await store.setToken(token);
    setState(result);
  }, []);

  return { state, submitToken };
}

function useVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const unsub = store.onChange(() => setV(x => x + 1));
    return () => { unsub(); };
  }, []);
  return { v, bump: () => setV(x => x + 1) };
}

export function useFolders() {
  const { v, bump } = useVersion();
  const folders = store.getAllFolders();
  void v;

  const addFolder = useCallback(async (folder: Omit<Folder, 'id' | 'createdAt'>) => {
    const result = await store.addFolder(folder);
    bump();
    return result.id!;
  }, [bump]);

  const updateFolder = useCallback(async (id: number, changes: Partial<Folder>) => {
    await store.updateFolder(id, changes);
    bump();
  }, [bump]);

  const deleteFolder = useCallback(async (id: number) => {
    await store.deleteFolder(id);
    bump();
  }, [bump]);

  return { folders, addFolder, updateFolder, deleteFolder };
}

export function useSets(folderId?: number | null) {
  const { v, bump } = useVersion();
  const sets = folderId != null ? store.getSetsByFolder(folderId) : store.getAllSets();
  void v;

  const addSet = useCallback(async (set: Omit<FlashcardSet, 'id' | 'createdAt' | 'updatedAt'>) => {
    const result = await store.addSet(set);
    bump();
    return result.id!;
  }, [bump]);

  const updateSet = useCallback(async (id: number, changes: Partial<FlashcardSet>) => {
    await store.updateSet(id, changes);
    bump();
  }, [bump]);

  const deleteSet = useCallback(async (id: number) => {
    await store.deleteSet(id);
    bump();
  }, [bump]);

  return { sets, addSet, updateSet, deleteSet };
}

export function useSet(setId: number | null) {
  const { v } = useVersion();
  void v;
  return setId ? store.getSet(setId) : undefined;
}

export function usePracticeSession(setId: number) {
  const { v } = useVersion();
  void v;
  return store.getPracticeSession(setId);
}

export function useCards(setId: number | null) {
  const { v, bump } = useVersion();
  const cards = setId ? store.getCardsBySet(setId) : [];
  void v;

  const addCard = useCallback(async (card: Omit<Card, 'id' | 'createdAt'>) => {
    const [result] = await store.addCards([card]);
    bump();
    return result.id!;
  }, [bump]);

  const updateCard = useCallback(async (id: number, changes: Partial<Card>) => {
    await store.updateCard(id, changes);
    bump();
  }, [bump]);

  const deleteCard = useCallback(async (id: number) => {
    await store.deleteCard(id);
    bump();
  }, [bump]);

  const bulkAddCards = useCallback(async (newCards: Omit<Card, 'id' | 'createdAt'>[]): Promise<Card[]> => {
    const created = await store.addCards(newCards);
    bump();
    return created;
  }, [bump]);

  return { cards, addCard, updateCard, deleteCard, bulkAddCards };
}