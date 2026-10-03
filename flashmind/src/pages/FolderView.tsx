import { useParams, useNavigate } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Upload, Download, Search, Layers, MoreVertical, Trash2, Edit3, FolderOpen, Plus, X, Check
} from 'lucide-react';
import { useFolders, useSets } from '../hooks/useDB';
import ImportModal from '../components/ImportModal';
import { exportSets } from '../lib/export';
import type { FlashcardSet } from '../lib/types';

type SetSortMode = 'newest' | 'oldest' | 'name-asc' | 'name-desc';
const SET_SORT_KEY = 'flashmind.setSort';

function loadSetSort(): SetSortMode {
  try {
    const s = localStorage.getItem(SET_SORT_KEY);
    if (s === 'newest' || s === 'oldest' || s === 'name-asc' || s === 'name-desc') return s;
  } catch { /* ignore */ }
  return 'newest';
}

function setTime(s: FlashcardSet) {
  const t = new Date(s.updatedAt).getTime();
  return Number.isFinite(t) ? t : (s.id ?? 0);
}

export default function FolderView() {
  const { id } = useParams();
  const folderId = Number(id);
  const navigate = useNavigate();
  const { folders } = useFolders();
  const { sets, deleteSet, updateSet } = useSets(folderId);
  const { sets: allSets } = useSets();
  const [search, setSearch] = useState('');
  const [setSort, setSetSort] = useState<SetSortMode>(loadSetSort);
  const [showImport, setShowImport] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState<number | null>(null);

  const folder = folders.find(f => f.id === folderId);
  const filteredSets = sets.filter(s =>
    s.title.toLowerCase().includes(search.toLowerCase())
  );

  const sortedSets = useMemo(() => {
    const list = [...filteredSets];
    switch (setSort) {
      case 'oldest':
        list.sort((a, b) => (setTime(a) - setTime(b)) || ((a.id ?? 0) - (b.id ?? 0)));
        break;
      case 'name-asc':
        list.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '') || ((a.id ?? 0) - (b.id ?? 0)));
        break;
      case 'name-desc':
        list.sort((a, b) => (b.title ?? '').localeCompare(a.title ?? '') || ((a.id ?? 0) - (b.id ?? 0)));
        break;
      case 'newest':
      default:
        list.sort((a, b) => (setTime(b) - setTime(a)) || ((b.id ?? 0) - (a.id ?? 0)));
    }
    return list;
  }, [filteredSets, setSort]);

  const changeSetSort = (mode: SetSortMode) => {
    setSetSort(mode);
    try { localStorage.setItem(SET_SORT_KEY, mode); } catch { /* ignore */ }
  };

  const availableSets = allSets.filter(s => s.folderId !== folderId);

  const handleAddSets = async (setIds: number[]) => {
    for (const setId of setIds) {
      await updateSet(setId, { folderId });
    }
    setShowAddModal(false);
  };

  const handleRemoveFromFolder = async (setId: number) => {
    await updateSet(setId, { folderId: null });
    setMenuOpen(null);
  };

  if (!folder) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-[var(--color-text-muted)]">Folder not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-full p-6 md:p-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/')}
          className="w-9 h-9 rounded-lg border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-all"
        >
          <ArrowLeft size={16} />
        </button>
        <div
          className="tab-chip text-2xl pl-3"
          style={{ '--tab-color': folder.color || 'var(--color-accent)' } as React.CSSProperties}
        >
          {folder.icon}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display font-semibold text-xl truncate">{folder.name}</h1>
          <p className="font-data text-xs text-[var(--color-text-muted)]">{sets.length} sets</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 sm:gap-3 mb-8">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search sets..."
            className="w-full bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-[var(--color-accent)] transition-colors"
          />
        </div>
        <button
          onClick={() => exportSets(sets, `flashmind-folder-${folder.name.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_')}.json`)}
          disabled={sets.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-all disabled:opacity-40 disabled:hover:border-[var(--color-border)] disabled:hover:text-[var(--color-text-secondary)]"
        >
          <Download size={16} />
          <span className="hidden sm:inline">Export</span>
        </button>
        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-all"
        >
          <Upload size={16} />
          <span className="hidden sm:inline">Import</span>
        </button>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-accent)] text-[var(--color-accent-ink)] text-sm font-semibold hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Add Set</span>
        </button>
      </div>

      {/* Sets */}
      {filteredSets.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-center justify-center mb-4">
            <FolderOpen size={28} className="text-[var(--color-text-muted)]" />
          </div>
          <h3 className="font-display font-medium text-lg mb-1">
            {search ? 'No matching sets' : 'No sets in this folder'}
          </h3>
          <p className="text-sm text-[var(--color-text-muted)] mb-4">
            {search ? 'Try a different search' : 'Add existing sets or import new ones'}
          </p>
          {!search && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-accent-ink)] text-sm font-semibold hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              <Plus size={14} /> Add Set
            </button>
          )}
        </motion.div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <span className="font-data text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
              {filteredSets.length} {filteredSets.length === 1 ? 'set' : 'sets'}
            </span>
            <select
              value={setSort}
              onChange={e => changeSetSort(e.target.value as SetSortMode)}
              className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors cursor-pointer"
              aria-label="Sort sets"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name-asc">Name A&ndash;Z</option>
              <option value="name-desc">Name Z&ndash;A</option>
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pb-4">
            {sortedSets.map((set, i) => (
            <motion.div
              key={set.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="relative group pr-2 pb-2"
            >
              <div
                onClick={() => navigate(`/set/${set.id}`)}
                className="deck-stack block p-5 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] group-hover:border-[var(--color-border-light)] group-hover:bg-[var(--color-bg-card-hover)] transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-[var(--color-accent)]/15 flex items-center justify-center">
                    <Layers size={18} className="text-[var(--color-accent)]" />
                  </div>
                </div>
                <h3 className="font-display font-semibold text-lg mb-1 truncate">{set.title}</h3>
                {set.description && (
                  <p className="text-xs text-[var(--color-text-muted)] truncate mb-3">{set.description}</p>
                )}
                <div className="font-data text-[11px] text-[var(--color-text-muted)]">
                  {new Date(set.updatedAt).toLocaleDateString()}
                </div>
              </div>
              <div className="absolute top-3 right-5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === set.id ? null : set.id!); }}
                  className="w-7 h-7 rounded-lg bg-[var(--color-bg-secondary)] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                >
                  <MoreVertical size={14} />
                </button>
                <AnimatePresence>
                  {menuOpen === set.id && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="absolute right-0 top-9 w-44 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg shadow-xl z-20 overflow-hidden"
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/set/${set.id}`); setMenuOpen(null); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card-hover)]"
                      >
                        <Edit3 size={14} /> Edit
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveFromFolder(set.id!); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card-hover)]"
                      >
                        <FolderOpen size={14} /> Remove from folder
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteSet(set.id!); setMenuOpen(null); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]"
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          ))}
          </div>
        </>
      )}

      <AnimatePresence>
        {showImport && (
          <ImportModal onClose={() => setShowImport(false)} folderId={folderId} />
        )}
        {showAddModal && (
          <AddSetsModal
            availableSets={availableSets}
            onAdd={handleAddSets}
            onClose={() => setShowAddModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function AddSetsModal({ availableSets, onAdd, onClose }: {
  availableSets: any[];
  onAdd: (ids: number[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');

  const filtered = availableSets.filter(s =>
    s.title.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
        className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl w-full max-w-lg p-4 sm:p-6 shadow-2xl max-h-[80vh] flex flex-col"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-lg">Add Sets to Folder</h2>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            <X size={20} />
          </button>
        </div>

        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search sets..."
            className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-[var(--color-accent)] transition-colors"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 mb-4">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-[var(--color-text-muted)] text-sm">
              {availableSets.length === 0 ? 'All sets are already in this folder' : 'No matching sets'}
            </div>
          ) : (
            filtered.map(set => (
              <button
                key={set.id}
                onClick={() => toggle(set.id!)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                  selected.has(set.id!)
                    ? 'bg-[var(--color-accent)]/15 border border-[var(--color-accent)]/30'
                    : 'hover:bg-[var(--color-bg-secondary)] border border-transparent'
                }`}
              >
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                  selected.has(set.id!)
                    ? 'bg-[var(--color-accent)] border-[var(--color-accent)]'
                    : 'border-[var(--color-border-light)]'
                }`}>
                  {selected.has(set.id!) && <Check size={12} className="text-[var(--color-accent-ink)]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{set.title}</div>
                  {set.description && (
                    <div className="text-xs text-[var(--color-text-muted)] truncate">{set.description}</div>
                  )}
                </div>
                <Layers size={14} className="text-[var(--color-text-muted)] shrink-0" />
              </button>
            ))
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] text-sm font-medium hover:bg-[var(--color-bg-elevated)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onAdd(Array.from(selected))}
            disabled={selected.size === 0}
            className="flex-1 py-2.5 rounded-lg bg-[var(--color-accent)] text-[var(--color-accent-ink)] text-sm font-semibold hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-40"
          >
            Add {selected.size > 0 ? `(${selected.size})` : ''}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
