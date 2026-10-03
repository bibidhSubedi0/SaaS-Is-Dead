import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Play, Edit3, Trash2, Download, Plus, BookOpen } from 'lucide-react';
import { useSet, useCards, useSets, usePracticeSession } from '../hooks/useDB';
import { exportSet } from '../lib/export';
import RichText from '../components/RichText';

export default function SetDetail() {
  const { id } = useParams();
  const setId = Number(id);
  const navigate = useNavigate();
  const set = useSet(setId);
  const { cards } = useCards(setId);
  const { deleteSet } = useSets();
  const session = usePracticeSession(setId);

  const hasResume = !!session && (!session.isComplete || session.unknown.length > 0);
  const practiceLabel = hasResume
    ? session.isComplete
      ? `Resume (${session.unknown.length} to review)`
      : `Resume (${session.queue.length - session.currentIndex} left)`
    : `Practice (${cards.length})`;

  const isLargeSet = cards.length > 100;

  const handleDelete = async () => {
    if (confirm('Delete this set and all its cards?')) {
      await deleteSet(setId);
      navigate('/');
    }
  };

  if (!set) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="text-[var(--color-text-muted)]">
          {Number.isNaN(setId) ? "That link is invalid." : "Set not found."}
        </div>
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-accent-ink)] text-sm font-semibold hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-full p-6 md:p-8">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/')}
          className="w-9 h-9 rounded-lg border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-all shrink-0"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display font-semibold text-xl md:text-2xl truncate">{set.title}</h1>
          {set.description && (
            <p className="text-sm text-[var(--color-text-secondary)] truncate">{set.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => navigate(`/practice/${setId}`)}
            disabled={cards.length === 0}
            className="flex items-center justify-center gap-2 flex-1 md:flex-none px-4 py-2 rounded-lg bg-[var(--color-success)] text-[var(--color-paper-ink)] text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            <Play size={14} />
            {practiceLabel}
          </button>
          <button
            onClick={() => navigate(`/set/${setId}`)}
            className="flex items-center justify-center gap-2 flex-1 md:flex-none px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-all"
          >
            <Edit3 size={14} />
            Edit
          </button>
          <button
            onClick={() => exportSet(set)}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-all"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Export</span>
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition-all"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {cards.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-center justify-center mb-4">
            <BookOpen size={28} className="text-[var(--color-text-muted)]" />
          </div>
          <h3 className="font-display font-medium text-lg mb-1">No cards yet</h3>
          <p className="text-sm text-[var(--color-text-muted)] mb-4">Add some cards to get started</p>
          <Link
            to={`/set/${setId}`}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-accent-ink)] text-sm font-semibold hover:bg-[var(--color-accent-hover)] transition-colors"
          >
            <Plus size={14} /> Edit Set
          </Link>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {cards.map((card, i) => (
            <motion.div
              key={card.id}
              initial={isLargeSet ? false : { opacity: 0, y: 10 }}
              animate={isLargeSet ? false : { opacity: 1, y: 0 }}
              transition={{ delay: isLargeSet ? 0 : Math.min(i * 0.03, 0.4) }}
              className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl p-4"
            >
              <div className="flex items-start gap-4">
                <span className="font-data text-xs font-medium text-[var(--color-text-muted)] bg-[var(--color-bg-secondary)] px-2 py-0.5 rounded-md shrink-0 mt-1">
                  #{i + 1}
                </span>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="font-data text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Term</div>
                    <div className="text-sm font-medium">{card.term}</div>
                  </div>
                  <div>
                    <div className="font-data text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Definition</div>
                    <RichText text={card.definition} className="text-sm text-[var(--color-text-secondary)]" />
                    {card.definitionAttachments && card.definitionAttachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {card.definitionAttachments.filter(a => a.type === 'image').map((att, j) => (
                          <img key={j} src={att.url ?? att.data} alt={att.name} loading="lazy" className="max-w-full max-h-64 rounded-lg object-contain border border-[var(--color-border)]" />
                        ))}
                        {card.definitionAttachments.filter(a => a.type === 'audio').map((att, j) => (
                          <audio key={j} controls src={att.url ?? att.data} className="h-8" />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}