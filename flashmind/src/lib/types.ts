export interface Folder {
  id?: number;
  name: string;
  icon: string;
  color: string;
  createdAt: Date;
}

export interface FlashcardSet {
  id?: number;
  folderId: number | null;
  title: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Card {
  id?: number;
  setId: number;
  term: string;
  definition: string;
  definitionAttachments: Attachment[];
  createdAt: Date;
}

export interface Attachment {
  id?: number;
  type: 'image' | 'audio';
  name: string;
  data?: string;
  url?: string;
}

export interface PracticeSession {
  setId: number;
  queue: number[];
  currentIndex: number;
  known: number[];
  unknown: number[];
  history: number[];
  isComplete: boolean;
  updatedAt: Date;
}

export interface ImportConfig {
  termDefSeparator: string;
  cardSeparator: string;
  rawText: string;
}
