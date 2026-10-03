import * as store from './store';
import type { FlashcardSet } from './types';

export interface ExportedAttachment {
  id?: number;
  type: 'image' | 'audio';
  name: string;
}

export interface ExportedCard {
  id: number;
  term: string;
  definition: string;
  attachments: ExportedAttachment[];
}

export interface ExportedSet {
  id: number;
  folderId: number | null;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  cards: ExportedCard[];
}

export interface ExportDocument {
  app: 'flashmind';
  version: 1;
  exportedAt: string;
  sets: ExportedSet[];
}

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

function sanitizeFilename(name: string): string {
  const clean = name.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 60);
  return clean || 'export';
}

export function buildExport(sets: FlashcardSet[]): ExportDocument {
  return {
    app: 'flashmind',
    version: 1,
    exportedAt: new Date().toISOString(),
    sets: sets
      .filter(s => s.id != null)
      .map(s => {
        const id = s.id as number;
        return {
          id,
          folderId: s.folderId,
          title: s.title,
          description: s.description,
          createdAt: toIso(s.createdAt),
          updatedAt: toIso(s.updatedAt),
          cards: store.getCardsBySet(id).map(c => ({
            id: c.id as number,
            term: c.term,
            definition: c.definition,
            attachments: (c.definitionAttachments ?? []).map(a => ({
              id: a.id,
              type: a.type,
              name: a.name,
            })),
          })),
        };
      }),
  };
}

export function downloadDocument(doc: ExportDocument, filename: string) {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportSets(sets: FlashcardSet[], filename?: string) {
  downloadDocument(buildExport(sets), filename ?? `flashmind-export-${new Date().toISOString().slice(0, 10)}.json`);
}

export function exportSet(set: FlashcardSet, folderName?: string) {
  const scope = sanitizeFilename(set.title);
  const prefix = folderName ? `flashmind-${sanitizeFilename(folderName)}` : 'flashmind';
  exportSets([set], `${prefix}-${scope}-${set.id}.json`);
}