import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Upload, FileText, AlertCircle, ArrowLeft, Check } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { useSets, useCards } from '../hooks/useDB';
import type { Card } from '../lib/types';

export default function ImportPage() {
  const [rawText, setRawText] = useState('');
  const [termDefSep, setTermDefSep] = useState('\\t');
  const [cardSep, setCardSep] = useState('\\n\\n');
  const [setTitle, setSetTitle] = useState('');
  const [setDescription, setSetDescription] = useState('');
  const [preview, setPreview] = useState<{ term: string; definition: string }[]>([]);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'input' | 'preview'>('input');
  const navigate = useNavigate();
  const { addSet } = useSets();
  const { bulkAddCards } = useCards(null);

  const parseSep = (s: string): string => {
    return s.replace(/\\t/g, '\t').replace(/\\n/g, '\n').replace(/\\r/g, '\r');
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
        setError(`Could not find separator in: "${block.slice(0, 50).replace(/\n/g, '\\n')}..."`);
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
    setStep('preview');
  };

  const handleImport = async () => {
    if (!setTitle.trim()) {
      setError('Please enter a set title');
      return;
    }

    const id = await addSet({
      folderId: null,
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
    reader.onloadend = () => setRawText(reader.result as string);
    reader.readAsText(file);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/plain': ['.txt', '.csv', '.tsv'] },
    multiple: false,
  });

  return (
    <div className="min-h-full p-6 md:p-8">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/')}
          className="w-9 h-9 rounded-lg border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-all"
        >
          <ArrowLeft size={16} />
        </button>
        <h1 className="font-display font-semibold text-xl">Import Flashcards</h1>
      </div>

      <div className="max-w-2xl mx-auto">
        {step === 'input' ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-5"
          >
            {/* Set info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[var(--color-text-secondary)] mb-1.5">Set Title *</label>
                <input
                  type="text"
                  value={setTitle}
                  onChange={e => setSetTitle(e.target.value)}
                  placeholder="My Flashcard Set"
                  className="w-full bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--color-text-secondary)] mb-1.5">Description</label>
                <input
                  type="text"
                  value={setDescription}
                  onChange={e => setSetDescription(e.target.value)}
                  placeholder="Optional"
                  className="w-full bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                />
              </div>
            </div>

            {/* Separators */}
            <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl p-5 space-y-4">
              <h3 className="font-data text-xs font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">Separators</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[var(--color-text-muted)] mb-1.5">Between Term & Definition</label>
                  <input
                    type="text"
                    value={termDefSep}
                    onChange={e => setTermDefSep(e.target.value)}
                    className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[var(--color-accent)] transition-colors font-mono"
                  />
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-1">
                    \t = tab, \n = newline
                  </p>
                </div>
                <div>
                  <label className="block text-xs text-[var(--color-text-muted)] mb-1.5">Between Cards</label>
                  <input
                    type="text"
                    value={cardSep}
                    onChange={e => setCardSep(e.target.value)}
                    className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[var(--color-accent)] transition-colors font-mono"
                  />
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-1">
                    \n\n = blank line, \n = newline
                  </p>
                </div>
              </div>
            </div>

            {/* Text area */}
            <div>
              <label className="block text-sm text-[var(--color-text-secondary)] mb-1.5">Content *</label>
              <textarea
                value={rawText}
                onChange={e => setRawText(e.target.value)}
                placeholder={"Paste your flashcard text here...\n\nWith default separators (\\t and \\n\\n):\n\nword1\tdefinition1\n\nword2\tdefinition2\n\nword3\tdefinition3"}
                rows={12}
                className="w-full bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[var(--color-accent)] transition-colors resize-none font-mono"
              />
              <div
                {...getRootProps()}
                className={`mt-3 border border-dashed rounded-xl p-4 flex items-center justify-center gap-2 cursor-pointer text-sm transition-colors ${
                  isDragActive
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent)] bg-opacity-10'
                    : 'border-[var(--color-border)] hover:border-[var(--color-border-light)] text-[var(--color-text-muted)]'
                }`}
              >
                <input {...getInputProps()} />
                <FileText size={16} />
                <span>Or drop a .txt file here</span>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-[var(--color-danger)] text-sm bg-[var(--color-danger-bg)] rounded-xl px-4 py-3">
                <AlertCircle size={16} className="shrink-0" />
                {error}
              </div>
            )}

            <button
              onClick={handleParse}
              disabled={!rawText.trim()}
              className="w-full py-3 rounded-xl bg-[var(--color-accent)] text-[var(--color-accent-ink)] text-sm font-semibold hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <Upload size={16} />
              Preview Import
            </button>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--color-text-secondary)]">
                {preview.length} cards found
              </span>
              <button
                onClick={() => setStep('input')}
                className="text-xs text-[var(--color-accent)] hover:underline"
              >
                Edit separators
              </button>
            </div>

            <div className="max-h-[50vh] overflow-y-auto border border-[var(--color-border)] rounded-xl divide-y divide-[var(--color-border)]">
              {preview.map((p, i) => (
                <div key={i} className="flex flex-col sm:flex-row sm:items-center px-4 py-3 text-sm min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-8 text-[var(--color-text-muted)] shrink-0">{i + 1}</span>
                    <span className="font-medium truncate">{p.term}</span>
                  </div>
                  <span className="text-[var(--color-text-secondary)] truncate sm:ml-4">{p.definition}</span>
                </div>
              ))}
            </div>

            {error && (
              <div className="flex items-center gap-2 text-[var(--color-danger)] text-sm bg-[var(--color-danger-bg)] rounded-xl px-4 py-3">
                <AlertCircle size={16} className="shrink-0" />
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep('input')}
                className="flex-1 py-3 rounded-xl border border-[var(--color-border)] text-[var(--color-text-secondary)] text-sm font-medium hover:bg-[var(--color-bg-card)] transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={!setTitle.trim()}
                className="flex-1 py-3 rounded-xl bg-[var(--color-accent)] text-[var(--color-accent-ink)] text-sm font-semibold hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <Check size={16} />
                Import {preview.length} Cards
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
