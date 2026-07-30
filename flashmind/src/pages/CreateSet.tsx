import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Plus, Trash2, GripVertical, Play, Cloud, CloudOff } from 'lucide-react';
import { useSet, useCards, useSets } from '../hooks/useDB';
import ImageUpload from '../components/ImageUpload';
import AudioRecorder from '../components/AudioRecorder';
import type { Attachment } from '../lib/types';

interface CardDraft {
  key: string;
  id?: number;
  term: string;
  definition: string;
  definitionAttachments: Attachment[];
}

const makeKey = () => Math.random().toString(36).slice(2, 10);
const MAX_DEF_HEIGHT = 200;
const AUTO_SAVE_DELAY = 1500;

function resizeDef(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, MAX_DEF_HEIGHT) + 'px';
  el.style.overflowY = el.scrollHeight > MAX_DEF_HEIGHT ? 'auto' : 'hidden';
}

export default function CreateSet() {
  const { id } = useParams();
  const isNew = id === 'new';
  const setId = isNew ? null : Number(id);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNew && (setId === null || Number.isNaN(setId))) {
      navigate('/', { replace: true });
    }
  }, [isNew, setId, navigate]);

  const existingSet = useSet(setId);
  const { cards: existingCards, deleteCard, bulkAddCards, updateCard: updateStoredCard, addCard } = useCards(setId);
  const { addSet, updateSet } = useSets();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [cards, setCards] = useState<CardDraft[]>([
    { key: makeKey(), term: '', definition: '', definitionAttachments: [] },
  ]);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving'>('saved');

  const termRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const defRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoCreatedRef = useRef(false);
  const pendingDeleteIdsRef = useRef<Set<number>>(new Set());
  const initialLoadRef = useRef(true);

  const titleRef = useRef(title);
  const descRef = useRef(description);
  const cardsRef = useRef(cards);
  useEffect(() => { titleRef.current = title; }, [title]);
  useEffect(() => { descRef.current = description; }, [description]);
  useEffect(() => { cardsRef.current = cards; }, [cards]);

  useEffect(() => {
    if (initialLoadRef.current && existingSet) {
      initialLoadRef.current = false;
      setTitle(existingSet.title);
      setDescription(existingSet.description);
    }
  }, [existingSet]);

  useEffect(() => {
    if (existingCards.length > 0 && cards.length === 1 && !cards[0].term) {
      setCards(existingCards.map(c => ({
        key: makeKey(),
        id: c.id,
        term: c.term,
        definition: c.definition,
        definitionAttachments: c.definitionAttachments ?? [],
      })));
    }
  }, [existingCards]);

  // Auto-create set on first meaningful input for new sets
  useEffect(() => {
    if (!isNew || autoCreatedRef.current) return;
    const hasContent = title.trim() || description.trim() || cards.some(c => c.term.trim() || c.definition.trim());
    if (!hasContent) return;

    autoCreatedRef.current = true;
    const timer = setTimeout(async () => {
      const newId = await addSet({
        folderId: null,
        title: title.trim() || 'Untitled',
        description: description.trim() || '',
      });
      navigate(`/edit/${newId}`, { replace: true });
    }, 500);
    return () => clearTimeout(timer);
  }, [title, description, cards, isNew, addSet, navigate]);

  const performAutoSave = useCallback(async () => {
    if (isNew || !setId) return;
    setSaveStatus('saving');
    try {
      await updateSet(setId, { title: titleRef.current, description: descRef.current });

      for (const card of cardsRef.current) {
        if (!card.term.trim() && !card.definition.trim()) continue;
        if (card.id) {
          await updateStoredCard(card.id, {
            term: card.term,
            definition: card.definition,
            definitionAttachments: card.definitionAttachments,
          });
        }
      }

      for (const id of pendingDeleteIdsRef.current) {
        await deleteCard(id);
      }
      pendingDeleteIdsRef.current.clear();

      const newCardsToSave = cardsRef.current.filter(c => !c.id && (c.term.trim() || c.definition.trim()));
      if (newCardsToSave.length > 0) {
        const savedCards = await bulkAddCards(newCardsToSave.map(c => ({
          setId: setId!,
          term: c.term,
          definition: c.definition,
          definitionAttachments: c.definitionAttachments,
        })));
        setCards(prev => prev.map(c => {
          const idx = newCardsToSave.findIndex(nc => nc.key === c.key);
          if (idx !== -1 && savedCards[idx]) {
            return { ...c, id: savedCards[idx].id };
          }
          return c;
        }));
      }

      setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('unsaved');
      console.error('Auto-save failed:', err);
    }
  }, [isNew, setId, updateSet, updateStoredCard, deleteCard, bulkAddCards]);

  const triggerAutoSave = useCallback(() => {
    if (isNew) return;
    setSaveStatus('unsaved');
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(performAutoSave, AUTO_SAVE_DELAY);
  }, [isNew, performAutoSave]);

  const updateCard = (key: string, field: keyof CardDraft, value: any) => {
    setCards(prev => prev.map(c => c.key === key ? { ...c, [field]: value } : c));
    triggerAutoSave();
  };

  const addNewCard = useCallback(() => {
    const newKey = makeKey();
    setCards(prev => [...prev, { key: newKey, term: '', definition: '', definitionAttachments: [] }]);
    triggerAutoSave();
    return newKey;
  }, [triggerAutoSave]);

  const removeCard = (key: string) => {
    if (cards.length <= 1) return;
    const card = cards.find(c => c.key === key);
    if (card?.id) pendingDeleteIdsRef.current.add(card.id);
    setCards(prev => prev.filter(c => c.key !== key));
    triggerAutoSave();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      navigate('/');
    }
  };

  const handleTermKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, cardKey: string) => {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const defEl = defRefs.current.get(cardKey);
      if (defEl) defEl.focus();
    }
  };

  const handleDefKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, _cardKey: string, index: number) => {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      if (index === cards.length - 1) {
        const newKey = addNewCard();
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const newTermEl = termRefs.current.get(newKey);
            if (newTermEl) newTermEl.focus();
          });
        });
      } else {
        const nextCard = cards[index + 1];
        if (nextCard) {
          const nextTermEl = termRefs.current.get(nextCard.key);
          if (nextTermEl) nextTermEl.focus();
        }
      }
    }
  };

  const handleBack = () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    if (!isNew && setId && saveStatus !== 'saved') {
      performAutoSave();
    }
    navigate('/');
  };

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  return (
    <div className="min-h-full" onKeyDown={handleKeyDown}>
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[var(--color-bg-primary)] border-b border-[var(--color-border)] px-6 py-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBack}
              className="w-9 h-9 rounded-lg border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-all"
            >
              <ArrowLeft size={16} />
            </button>
            <h1 className="font-display font-semibold text-lg">
              {isNew ? 'New Flashcard Set' : 'Edit Set'}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {!isNew && (
              <div className="flex items-center gap-1.5 text-xs font-medium">
                {saveStatus === 'saving' && (
                  <span className="text-[var(--color-text-muted)] flex items-center gap-1">
                    <Cloud size={14} className="animate-pulse" /> Saving...
                  </span>
                )}
                {saveStatus === 'saved' && (
                  <span className="text-[var(--color-success)] flex items-center gap-1">
                    <Cloud size={14} /> Saved
                  </span>
                )}
                {saveStatus === 'unsaved' && (
                  <span className="text-[var(--color-text-muted)] flex items-center gap-1">
                    <CloudOff size={14} /> Unsaved
                  </span>
                )}
              </div>
            )}
            {!isNew && (
              <button
                onClick={() => navigate(`/practice/${setId}`)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-success)] text-[var(--color-paper-ink)] text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                <Play size={14} />
                Practice
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-6">
        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Set Info */}
        <div className="space-y-4 mb-8">
          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1.5">Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => { setTitle(e.target.value); triggerAutoSave(); }}
              placeholder="Enter set title..."
              className="w-full bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl px-4 py-3 text-lg font-medium focus:outline-none focus:border-[var(--color-accent)] transition-colors"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={e => { setDescription(e.target.value); triggerAutoSave(); }}
              placeholder="Optional description for this set..."
              rows={2}
              className="w-full bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[var(--color-accent)] transition-colors resize-none"
            />
          </div>
        </div>

        {/* Cards */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-data text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
              Cards ({cards.length})
            </h2>
          </div>

          <AnimatePresence mode="popLayout">
            {cards.map((card, index) => (
              <motion.div
                key={card.key}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl p-5"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <GripVertical size={16} className="text-[var(--color-text-muted)] cursor-grab" />
                    <span className="font-data text-xs font-medium text-[var(--color-text-muted)] bg-[var(--color-bg-secondary)] px-2 py-0.5 rounded-md">
                      #{index + 1}
                    </span>
                  </div>
                  <button
                    onClick={() => removeCard(card.key)}
                    disabled={cards.length <= 1}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition-all disabled:opacity-30"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="font-data block text-[10px] text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">Term</label>
                    <input
                      ref={el => { if (el) termRefs.current.set(card.key, el); }}
                      type="text"
                      value={card.term}
                      onChange={e => updateCard(card.key, 'term', e.target.value)}
                      onKeyDown={e => handleTermKeyDown(e, card.key)}
                      placeholder="Enter term..."
                      className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="font-data block text-[10px] text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">Definition</label>
                    <textarea
                      ref={el => {
                        if (el) {
                          defRefs.current.set(card.key, el);
                          resizeDef(el);
                        }
                      }}
                      value={card.definition}
                      onChange={e => {
                        updateCard(card.key, 'definition', e.target.value);
                        resizeDef(e.currentTarget);
                      }}
                      onKeyDown={e => handleDefKeyDown(e, card.key, index)}
                      placeholder={"Enter definition...\n``` for code blocks\n`code` for inline code"}
                      rows={1}
                      className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:border-[var(--color-accent)] transition-colors resize-none overflow-y-auto"
                    />
                    <div className="mt-2 space-y-2">
                      <ImageUpload
                        images={card.definitionAttachments.filter(a => a.type === 'image')}
                        onChange={(imgs) => {
                          const audios = card.definitionAttachments.filter(a => a.type === 'audio');
                          updateCard(card.key, 'definitionAttachments', [...imgs, ...audios]);
                        }}
                      />
                      <AudioRecorder
                        audios={card.definitionAttachments.filter(a => a.type === 'audio')}
                        onChange={(auds) => {
                          const imgs = card.definitionAttachments.filter(a => a.type === 'image');
                          updateCard(card.key, 'definitionAttachments', [...imgs, ...auds]);
                        }}
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={addNewCard}
            className="w-full py-4 rounded-xl border-2 border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] text-sm font-medium hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-all flex items-center justify-center gap-2"
          >
            <Plus size={16} />
            Add Card
          </motion.button>
        </div>
      </div>
    </div>
  );
}