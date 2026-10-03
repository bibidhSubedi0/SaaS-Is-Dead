import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, FileText, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { useSets, useCards } from '../hooks/useDB';
import type { Card } from '../lib/types';

interface ImportModalProps {
  onClose: () => void;
  folderId?: number | null;
}

export default function ImportModal({ onClose, folderId = null }: ImportModalProps) {
  const [rawText, setRawText] = useState('');
  const [termDefSep, setTermDefSep] = useState('\\t');
  const [cardSep, setCardSep] = useState('\\n\\n');
  const [setTitle, setSetTitle] = useState('');
  const [setDescription, setSetDescription] = useState('');
  const [preview, setPreview] = useState<{ term: string; definition: string }[]>([]);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { addSet } = useSets();
  const { bulkAddCards } = useCards(null);

  const parseSep = (s: string): string => {
    return s
      .replace(/\\t/g, '\t')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r');
  };

  const handleParse = () => {
    setError('');
    if (!rawText.trim()) {
      setError('Please paste or upload some text');
      return;
    }

    const sep = parseSep(termDefSep);
    const cardSepParsed = parseSep(cardSep);
    const blocks = rawText.split(cardSepParsed).filter(b => b.trim());
    const results: { term: string; definition: string }[] = [];

    for (const block of blocks) {
      const idx = block.indexOf(sep);
      if (idx === -1) {
        setError(`Could not find separator "${termDefSep}" in block: "${block.slice(0, 50)}..."`);
        setPreview([]);
        return;
      }
      results.push({
        term: block.slice(0, idx).trim(),
        definition: block.slice(idx + sep.length).trim(),
      });
    }

    if (results.length === 0) {
      setError('No cards found');
      return;
    }

    setPreview(results);
  };

  const handleImport = async () => {
    if (!setTitle.trim()) {
      setError('Please enter a set title');
      return;
    }

    const id = await addSet({
      folderId: folderId,
      title: setTitle,
      description: setDescription,
    });

    const cards: Omit<Card, 'id' | 'createdAt'>[] = preview.map(p => ({
      setId: id as number,
      term: p.term,
      definition: p.definition,
      definitionAttachments: [],
    }));

    await bulkAddCards(cards);
    navigate(`/set/${id}`);
  };

  const onDrop = (files: File[]) => {
    const file = files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setRawText(reader.result as string);
    };
    reader.readAsText(file);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/plain': ['.txt', '.csv', '.tsv'] },
    multiple: false,
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
      >
        <div className="sticky top-0 bg-[var(--color-bg-card)] border-b border-[var(--color-border)] px-6 py-4 flex items-center justify-between z-10">
          <h2 className="font-display font-semibold text-lg">Import Flashcards</h2>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Set info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[var(--color-text-secondary)] mb-1.5">Set Title *</label>
              <input
                type="text"
                value={setTitle}
                onChange={e => setSetTitle(e.target.value)}
                placeholder="My Flashcard Set"
                className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[var(--color-accent)] transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--color-text-secondary)] mb-1.5">Description</label>
              <input
                type="text"
                value={setDescription}
                onChange={e => setSetDescription(e.target.value)}
                placeholder="Optional description"
                className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[var(--color-accent)] transition-colors"
              />
            </div>
          </div>

          {/* Separators */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[var(--color-text-secondary)] mb-1.5">
                Between Term & Definition
              </label>
              <input
                type="text"
                value={termDefSep}
                onChange={e => setTermDefSep(e.target.value)}
                className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[var(--color-accent)] transition-colors font-mono"
              />
              <p className="text-[10px] text-[var(--color-text-muted)] mt-1">
                Use \t for tab, \n for newline
              </p>
            </div>
            <div>
              <label className="block text-sm text-[var(--color-text-secondary)] mb-1.5">
                Between Cards
              </label>
              <input
                type="text"
                value={cardSep}
                onChange={e => setCardSep(e.target.value)}
                className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[var(--color-accent)] transition-colors font-mono"
              />
              <p className="text-[10px] text-[var(--color-text-muted)] mt-1">
                Use \n\n for blank line, \n for newline
              </p>
            </div>
          </div>

          {/* Text input / upload */}
          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1.5">Content *</label>
            <textarea
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              placeholder={"Paste your flashcard text here...\n\ne.g., using default separators:\nword1\tdefinition1\n\nword2\tdefinition2"}
              rows={8}
              className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[var(--color-accent)] transition-colors resize-none font-mono"
            />
            <div
              {...getRootProps()}
              className={`mt-2 border border-dashed rounded-lg p-3 flex items-center justify-center gap-2 cursor-pointer text-xs transition-colors ${
                isDragActive
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)] bg-opacity-10'
                  : 'border-[var(--color-border)] hover:border-[var(--color-border-light)] text-[var(--color-text-muted)]'
              }`}
            >
              <input {...getInputProps()} />
              <FileText size={14} />
              <span>Or drop a .txt file here</span>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-[var(--color-danger)] text-sm bg-[var(--color-danger-bg)] rounded-lg px-4 py-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* Parse button */}
          {preview.length === 0 && (
            <button
              onClick={handleParse}
              disabled={!rawText.trim()}
              className="w-full py-2.5 rounded-lg bg-[var(--color-accent)] text-[var(--color-accent-ink)] text-sm font-semibold hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-40"
            >
              Preview Import
            </button>
          )}

          {/* Preview */}
          {preview.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--color-text-secondary)]">
                  {preview.length} cards found
                </span>
                <button
                  onClick={() => setPreview([])}
                  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
                >
                  Re-parse
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto border border-[var(--color-border)] rounded-lg divide-y divide-[var(--color-border)]">
                {preview.map((p, i) => (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center px-4 py-2 text-sm min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-8 text-[var(--color-text-muted)] shrink-0">{i + 1}</span>
                      <span className="font-medium truncate">{p.term}</span>
                    </div>
                    <span className="text-[var(--color-text-secondary)] truncate sm:ml-4">{p.definition}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setPreview([])}
                  className="flex-1 py-2.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] text-sm font-medium hover:bg-[var(--color-bg-elevated)] transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleImport}
                  className="flex-1 py-2.5 rounded-lg bg-[var(--color-accent)] text-[var(--color-accent-ink)] text-sm font-semibold hover:bg-[var(--color-accent-hover)] transition-colors"
                >
                  Import {preview.length} Cards
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
