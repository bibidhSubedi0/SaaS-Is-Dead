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
  type: 'image' | 'audio';
  data: string;
  name: string;
}

export interface ImportConfig {
  termDefSeparator: string;
  cardSeparator: string;
  rawText: string;
}
