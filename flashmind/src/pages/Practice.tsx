import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, RotateCcw, Trophy, CheckCircle, XCircle, Home, Undo2 } from 'lucide-react';
import { useSet, useCards } from '../hooks/useDB';
import * as store from '../lib/store';
import type { Card as CardType, PracticeSession } from '../lib/types';
import RichText from '../components/RichText';

function termSize(text: string) {
  const len = text.length;
  if (len <= 10) return 'text-4xl md:text-6xl';
  if (len <= 30) return 'text-3xl md:text-5xl';
  if (len <= 60) return 'text-2xl md:text-4xl';
  if (len <= 120) return 'text-xl md:text-3xl';
  if (len <= 200) return 'text-lg md:text-2xl';
  return 'text-base md:text-xl';
}

function defSize(text: string) {
  if (text.includes('```')) return 'text-base md:text-lg';
  const len = text.length;
  if (len <= 40) return 'text-2xl md:text-4xl';
  if (len <= 120) return 'text-xl md:text-3xl';
  if (len <= 300) return 'text-lg md:text-2xl';
  if (len <= 600) return 'text-base md:text-xl';
  return 'text-base md:text-lg';
}

export default function Practice() {
  const { id } = useParams();
  const setId = Number(id);
  const navigate = useNavigate();
  const set = useSet(setId);
  const { cards: allCards } = useCards(setId);

  const [queue, setQueue] = useState<CardType[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [known, setKnown] = useState<number[]>([]);
  const [unknown, setUnknown] = useState<number[]>([]);
  const [history, setHistory] = useState<number[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [resumeIndex, setResumeIndex] = useState(0);

  const prevSetIdRef = useRef<number | null>(null);
  const queueRef = useRef<CardType[]>([]);
  const indexRef = useRef(0);
  const historyRef = useRef<number[]>([]);
  const advancingRef = useRef(false);
  const completeRef = useRef(false);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { indexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { completeRef.current = isComplete; }, [isComplete]);
  useEffect(() => { advancingRef.current = false; });

  useEffect(() => {
    if (allCards.length > 0 && prevSetIdRef.current !== setId) {
      prevSetIdRef.current = setId;
      const saved = store.getPracticeSession(setId);
      if (saved && Array.isArray(saved.queue) && saved.queue.length > 0) {
        const validIds = new Set(allCards.map(c => c.id));

        if (!saved.isComplete) {
          // In-progress session — resume from where we left off.
          const queue = saved.queue
            .map(id => allCards.find(c => c.id === id))
            .filter((c): c is CardType => !!c);
          if (queue.length > 0) {
            const index = Math.min(saved.currentIndex, queue.length - 1);
            setQueue(queue);
            setCurrentIndex(index);
            setKnown(saved.known.filter(id => validIds.has(id)));
            setUnknown(saved.unknown.filter(id => validIds.has(id)));
            setHistory(saved.queue.length === queue.length
              ? saved.history.filter(i => i >= 0 && i < queue.length)
              : []);
            setResumed(true);
            setResumeIndex(index);
            setIsComplete(false);
            setIsFlipped(false);
            setSessionReady(true);
            return;
          }
        } else if (saved.unknown.length > 0) {
          // Completed but some cards were missed — keep learning those.
          const missed = saved.unknown
            .map(id => allCards.find(c => c.id === id))
            .filter((c): c is CardType => !!c);
          if (missed.length > 0) {
            setQueue(missed);
            setCurrentIndex(0);
            setKnown([]);
            setUnknown([]);
            setHistory([]);
            setResumed(true);
            setResumeIndex(0);
            setIsComplete(false);
            setIsFlipped(false);
            setSessionReady(true);
            return;
          }
        }
      }
      setQueue([...allCards]);
      setCurrentIndex(0);
      setKnown([]);
      setUnknown([]);
      setHistory([]);
      setResumed(false);
      setIsComplete(false);
      setIsFlipped(false);
      setSessionReady(true);
    }
  }, [allCards, setId]);

  // Persist the session so it survives leaving the app. Writes are debounced
  // (not after every flip) and flushed immediately on completion or unmount.
  const pendingSessionRef = useRef<PracticeSession | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistSession = useCallback((session: PracticeSession) => {
    if (session.isComplete) {
      if (session.unknown.length === 0) {
        store.deletePracticeSession(session.setId);
      } else if (session.queue.length > 0) {
        store.savePracticeSession(session);
      }
      return;
    }
    const hasProgress =
      session.currentIndex > 0 ||
      session.known.length > 0 ||
      session.unknown.length > 0 ||
      session.history.length > 0;
    if (!hasProgress || session.queue.length === 0) return;
    store.savePracticeSession(session);
  }, []);

  const flushPendingSession = useCallback(() => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    if (pendingSessionRef.current) {
      const s = pendingSessionRef.current;
      pendingSessionRef.current = null;
      persistSession(s);
    }
  }, [persistSession]);

  useEffect(() => {
    if (!sessionReady) return;
    const queueIds = queue.map(c => c.id).filter((id): id is number => typeof id === 'number');
    const session: PracticeSession = {
      setId,
      queue: queueIds,
      currentIndex,
      known,
      unknown,
      history,
      isComplete,
      updatedAt: new Date(),
    };
    pendingSessionRef.current = session;
    if (isComplete) {
      flushPendingSession();
      return;
    }
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      const s = pendingSessionRef.current;
      if (s) {
        pendingSessionRef.current = null;
        persistSession(s);
      }
    }, 1500);
  }, [sessionReady, isComplete, queue, currentIndex, known, unknown, history, setId, flushPendingSession, persistSession]);

  useEffect(() => {
    return () => { flushPendingSession(); };
  }, [flushPendingSession]);

  const currentCard = queue[currentIndex];

  const handleFlip = useCallback(() => {
    setIsFlipped(f => !f);
  }, []);

  const advanceCard = useCallback(() => {
    const idx = indexRef.current;
    const q = queueRef.current;
    if (idx >= q.length) return;
    setHistory(h => [...h, idx]);
    setIsFlipped(false);
    if (idx + 1 >= q.length) {
      setIsComplete(true);
    } else {
      setCurrentIndex(idx + 1);
    }
  }, []);

  const handleKnown = useCallback(() => {
    if (advancingRef.current || completeRef.current) return;
    const card = queueRef.current[indexRef.current];
    if (!card) return;
    advancingRef.current = true;
    setKnown(prev => [...prev, card.id!]);
    advanceCard();
  }, [advanceCard]);

  const handleUnknown = useCallback(() => {
    if (advancingRef.current || completeRef.current) return;
    const card = queueRef.current[indexRef.current];
    if (!card) return;
    advancingRef.current = true;
    setUnknown(prev => [...prev, card.id!]);
    advanceCard();
  }, [advanceCard]);

  const handleGoBack = useCallback(() => {
    if (historyRef.current.length === 0) return;
    setIsFlipped(false);
    const prevIndex = historyRef.current[historyRef.current.length - 1];
    const prevCard = queueRef.current[prevIndex];
    setHistory(h => h.slice(0, -1));
    setCurrentIndex(prevIndex);
    if (prevCard) {
      setKnown(prev => prev.filter(id => id !== prevCard.id));
      setUnknown(prev => prev.filter(id => id !== prevCard.id));
    }
  }, []);

  const handleContinueLearning = () => {
    const missedCards = allCards.filter(c => unknown.includes(c.id!));
    if (missedCards.length === 0) return;
    setQueue([...missedCards]);
    setCurrentIndex(0);
    setIsFlipped(false);
    setKnown([]);
    setUnknown([]);
    setHistory([]);
    setResumed(false);
    setIsComplete(false);
  };

  const handleRestart = () => {
    if (!window.confirm('Restart this practice session from the beginning?')) return;
    store.deletePracticeSession(setId);
    setQueue([...allCards]);
    setCurrentIndex(0);
    setIsFlipped(false);
    setKnown([]);
    setUnknown([]);
    setHistory([]);
    setResumed(false);
    setIsComplete(false);
  };

  const showRestart = resumed && currentIndex === resumeIndex;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (completeRef.current) return;
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        handleFlip();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleKnown();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleUnknown();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleGoBack();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleFlip, handleKnown, handleUnknown, handleGoBack]);

  if (!set) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-[var(--color-text-muted)]">Loading...</div>
      </div>
    );
  }

  if (allCards.length === 0 && prevSetIdRef.current === setId) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <h2 className="font-display font-semibold text-xl mb-2">No cards to practice</h2>
          <p className="text-sm text-[var(--color-text-muted)] mb-4">Add some cards first</p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-accent-ink)] text-sm font-semibold"
          >
            Go Back
          </button>
        </motion.div>
      </div>
    );
  }

  if (!currentCard) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-[var(--color-text-muted)]">Loading cards...</div>
      </div>
    );
  }

  if (isComplete) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center max-w-md"
        >
          <motion.div
            initial={{ rotate: -10 }}
            animate={{ rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200 }}
            className="w-20 h-20 rounded-full bg-[var(--color-success-bg)] flex items-center justify-center mx-auto mb-6"
          >
            <Trophy size={38} className="text-[var(--color-success)]" />
          </motion.div>
          <h2 className="font-display font-semibold text-2xl mb-2">Session Complete!</h2>
          <p className="text-[var(--color-text-secondary)] mb-6">
            You reviewed {known.length + unknown.length} cards
          </p>

          <div className="flex items-center justify-center gap-6 mb-8 font-data text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle size={18} className="text-[var(--color-success)]" />
              <span className="font-medium">{known.length} known</span>
            </div>
            <div className="flex items-center gap-2">
              <XCircle size={18} className="text-[var(--color-danger)]" />
              <span className="font-medium">{unknown.length} to review</span>
            </div>
          </div>

          {unknown.length > 0 && (
            <button
              onClick={handleContinueLearning}
              className="w-full py-3 rounded-xl bg-[var(--color-accent)] text-[var(--color-accent-ink)] font-semibold hover:bg-[var(--color-accent-hover)] transition-colors flex items-center justify-center gap-2 mb-3"
            >
              <RotateCcw size={18} />
              Continue Learning ({unknown.length} cards)
            </button>
          )}
          <button
            onClick={() => navigate(`/view/${setId}`)}
            className="w-full py-3 rounded-xl border border-[var(--color-border)] text-[var(--color-text-secondary)] font-medium hover:bg-[var(--color-bg-card)] transition-colors flex items-center justify-center gap-2"
          >
            <Home size={18} />
            Back to Set
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-[var(--color-border)]">
        <div className="flex items-center justify-between max-w-2xl mx-auto gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-lg border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-all shrink-0"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="text-center min-w-0 flex-1">
            <h2 className="font-display font-medium text-sm truncate">{set.title}</h2>
            <p className="font-data text-xs text-[var(--color-text-muted)]">
              {currentIndex + 1} / {queue.length}
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 font-data text-xs shrink-0">
            <span className="text-[var(--color-success)] font-medium">{known.length} known</span>
            <span className="text-[var(--color-text-muted)]">&middot;</span>
            <span className="text-[var(--color-danger)] font-medium">{unknown.length} to review</span>
          </div>
        </div>

        <div className="max-w-2xl mx-auto mt-3">
          <div className="h-1.5 bg-[var(--color-bg-card)] rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-[var(--color-accent)] rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${((currentIndex + 1) / queue.length) * 100}%` }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            />
          </div>
        </div>
      </div>

      {/* Card Area */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-5xl">
            <div
              onClick={handleFlip}
              className="cursor-pointer"
              style={{ perspective: '1200px' }}
            >
              <motion.div
                key={currentIndex}
                initial={false}
                className="relative w-full min-h-[50vh] md:min-h-[70vh]"
                style={{ transformStyle: 'preserve-3d' }}
                animate={{
                  rotateY: isFlipped ? 180 : 0,
                }}
                transition={{ duration: 0.5, type: 'spring', stiffness: 200, damping: 25 }}
              >
                {/* Front (Term) */}
                <div className="study-card-face rounded-2xl p-5 pt-10 md:p-8 md:pt-10 flex flex-col items-center justify-center shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]">
                  <div className="punch-holes"><span /><span /><span /></div>
                  <h3 className={`font-display font-semibold text-center break-words w-full ${termSize(currentCard.term)}`}>{currentCard.term}</h3>
                </div>

                {/* Back (Definition) */}
                <div className="study-card-face--back rounded-2xl p-5 pt-10 md:p-8 md:pt-10 flex flex-col overflow-auto shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]">
                  <div className="punch-holes"><span /><span /><span /></div>
                  <div className="m-auto w-full">
                    <RichText text={currentCard.definition} className={`${defSize(currentCard.definition)} text-left text-[var(--color-paper-ink)] break-words w-full max-w-lg mx-auto`} />
                    {currentCard.definitionAttachments && currentCard.definitionAttachments.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-3 justify-center">
                        {currentCard.definitionAttachments.filter(a => a.type === 'image').map((att, j) => (
                          <img key={j} src={att.url ?? att.data} alt={att.name} className="max-w-full max-h-[50vh] rounded-xl object-contain border border-[var(--color-paper-rule)]" />
                        ))}
                        {currentCard.definitionAttachments.filter(a => a.type === 'audio').map((att, j) => (
                          <audio key={j} controls src={att.url ?? att.data} className="h-8 mt-2" />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>

          {/* Resume notice — first card of a resumed session only */}
          {showRestart && (
            <div className="mt-5 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)]">
              <span className="text-xs text-[var(--color-text-secondary)]">
                Resumed at card {resumeIndex + 1} of {queue.length}
              </span>
              <button
                onClick={handleRestart}
                className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-danger)] transition-colors"
              >
                <RotateCcw size={13} />
                Restart
              </button>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center justify-center gap-5 sm:gap-6 mt-6 md:mt-10">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleUnknown}
              className="w-16 h-16 rounded-full bg-[var(--color-danger-bg)] border-2 border-[var(--color-danger)] flex items-center justify-center text-[var(--color-danger)] hover:bg-[var(--color-danger)] hover:text-white transition-colors"
            >
              <ArrowLeft size={24} />
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleGoBack}
              disabled={history.length === 0}
              className="w-14 h-14 rounded-full bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-all disabled:opacity-30"
            >
              <Undo2 size={20} />
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleKnown}
              className="w-16 h-16 rounded-full bg-[var(--color-success-bg)] border-2 border-[var(--color-success)] flex items-center justify-center text-[var(--color-success)] hover:bg-[var(--color-success)] hover:text-white transition-colors"
            >
              <ArrowRight size={24} />
            </motion.button>
          </div>

          <div className="font-data text-center mt-3 md:mt-4 text-xs text-[var(--color-text-muted)] flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-2">
            <span>&larr; Didn't know</span>
            <span>Space: Flip</span>
            <span>Backspace: Go back</span>
            <span>Knew it &rarr;</span>
          </div>
        </div>
      </div>
    </div>
  );
}
