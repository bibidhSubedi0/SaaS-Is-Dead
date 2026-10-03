import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Upload, Download, Search, BookOpen, Layers, MoreVertical, Trash2, Edit3
} from 'lucide-react';
import { useFolders, useSets } from '../hooks/useDB';
import FolderModal from '../components/FolderModal';
import ImportModal from '../components/ImportModal';
import { exportSets } from '../lib/export';
import * as store from '../lib/store';
import type { FlashcardSet, Folder } from '../lib/types';

const TAB_COLORS = ['var(--tab-1)', 'var(--tab-2)', 'var(--tab-3)', 'var(--tab-4)', 'var(--tab-5)', 'var(--tab-6)'];

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

export default function Dashboard() {
  const { folders, deleteFolder } = useFolders();
  const { sets, deleteSet } = useSets();
  const [search, setSearch] = useState('');
  const [setSort, setSetSort] = useState<SetSortMode>(loadSetSort);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [editFolder, setEditFolder] = useState<Folder | undefined>();
  const [showImport, setShowImport] = useState(false);
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const navigate = useNavigate();

  const filteredSets = sets.filter(s =>
    s.title.toLowerCase().includes(search.toLowerCase()) ||
    s.description.toLowerCase().includes(search.toLowerCase())
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

  const handleDeleteSet = async (id: number) => {
    await deleteSet(id);
    setMenuOpen(null);
  };

  const handleDeleteFolder = async (id: number) => {
    const folder = folders.find(f => f.id === id);
    const setsInFolder = sets.filter(s => s.folderId === id);
    const msg = setsInFolder.length > 0
      ? `Delete folder "${folder?.name ?? ''}"? ${setsInFolder.length} set(s) will be moved out of this folder.`
      : `Delete folder "${folder?.name ?? ''}"?`;
    if (!window.confirm(msg)) return;
    await deleteFolder(id);
    setMenuOpen(null);
  };

  return (
    <div className="min-h-full p-6 md:p-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-2.5 mb-1.5">
          <Layers className="text-[var(--color-accent)]" size={22} />
          <h1 className="font-display font-semibold text-2xl md:text-3xl tracking-tight">Flashmind</h1>
        </div>
        <p className="text-[var(--color-text-secondary)] text-sm">Your personal flashcard studio</p>
      </motion.div>

      {/* Search & Actions */}
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
          onClick={() => setShowImport(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-all"
        >
          <Upload size={16} />
          <span className="hidden sm:inline">Import</span>
        </button>
        <button
          onClick={() => exportSets(sets)}
          disabled={sets.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-all disabled:opacity-40 disabled:hover:border-[var(--color-border)] disabled:hover:text-[var(--color-text-secondary)]"
        >
          <Download size={16} />
          <span className="hidden sm:inline">Export</span>
        </button>
        <Link
          to="/set/new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-accent)] text-[var(--color-accent-ink)] text-sm font-semibold hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">New Set</span>
        </Link>
      </div>

      {/* Folders */}
      {folders.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-10"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-data text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">Folders</h2>
            <button
              onClick={() => { setEditFolder(undefined); setShowFolderModal(true); }}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {folders.map((folder, i) => (
              <motion.div
                key={folder.id}
                whileHover={{ y: -2 }}
                className="relative group"
              >
                <Link
                  to={`/folder/${folder.id}`}
                  className="tab-chip block p-4 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] hover:border-[var(--color-border-light)] transition-all"
                  style={{ '--tab-color': folder.color || TAB_COLORS[i % TAB_COLORS.length] } as React.CSSProperties}
                >
                  <div className="text-2xl mb-2">{folder.icon}</div>
                  <div className="text-sm font-medium truncate">{folder.name}</div>
                  <div className="font-data text-[11px] text-[var(--color-text-muted)] mt-0.5">
                    {sets.filter(s => s.folderId === folder.id).length} sets
                  </div>
                </Link>
                <div className="absolute top-2 right-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setMenuOpen(menuOpen === folder.id ? null : folder.id!);
                    }}
                    className="w-7 h-7 rounded-lg bg-[var(--color-bg-secondary)] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                  >
                    <MoreVertical size={14} />
                  </button>
                  <AnimatePresence>
                    {menuOpen === folder.id && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute right-0 top-9 w-36 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg shadow-xl z-20 overflow-hidden"
                      >
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            setEditFolder(folder);
                            setShowFolderModal(true);
                            setMenuOpen(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card-hover)]"
                        >
                          <Edit3 size={14} /> Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            handleDeleteFolder(folder.id!);
                          }}
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
        </motion.div>
      )}

      {/* Sets */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-data text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
            {search ? 'Search Results' : 'All Sets'}
          </h2>
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
        {filteredSets.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-center justify-center mb-4">
              <BookOpen size={28} className="text-[var(--color-text-muted)]" />
            </div>
            <h3 className="font-display font-medium text-lg mb-1">
              {search ? 'No matching sets' : 'No flashcard sets yet'}
            </h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-4">
              {search ? 'Try a different search term' : 'Create your first set or import from a file'}
            </p>
            {!search && (
              <div className="flex gap-3">
                <button
                  onClick={() => setShowImport(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] transition-colors"
                >
                  <Upload size={14} /> Import
                </button>
                <Link
                  to="/set/new"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-accent-ink)] text-sm font-semibold hover:bg-[var(--color-accent-hover)] transition-colors"
                >
                  <Plus size={14} /> New Set
                </Link>
              </div>
            )}
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pb-4">
            {sortedSets.map((set, i) => (
              <SetCard
                key={set.id}
                set={set}
                index={i}
                menuOpen={menuOpen === set.id}
                onMenuToggle={() => setMenuOpen(menuOpen === set.id ? null : set.id!)}
                onDelete={() => handleDeleteSet(set.id!)}
                onEdit={() => navigate(`/set/${set.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showFolderModal && (
          <FolderModal
            onClose={() => { setShowFolderModal(false); setEditFolder(undefined); }}
            folder={editFolder}
          />
        )}
        {showImport && (
          <ImportModal onClose={() => setShowImport(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function SetCard({ set, index, menuOpen, onMenuToggle, onDelete, onEdit }: {
  set: any;
  index: number;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const [cardCount, setCardCount] = useState<number | null>(null);

  useEffect(() => {
    const count = store.getCardsBySet(set.id).length;
    setCardCount(count);
  }, [set.id]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="relative group pr-2 pb-2"
    >
      {/* Signature: the set is a deck — faint sibling cards peek out behind it */}
      <Link
        to={`/set/${set.id}`}
        className="deck-stack block p-5 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] group-hover:border-[var(--color-border-light)] group-hover:bg-[var(--color-bg-card-hover)] transition-all"
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
        <div className="font-data flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
          <span>{cardCount ?? '···'} cards</span>
          <span>·</span>
          <span>{new Date(set.updatedAt).toLocaleDateString()}</span>
        </div>
      </Link>
      <div className="absolute top-3 right-5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.preventDefault(); onMenuToggle(); }}
          className="w-7 h-7 rounded-lg bg-[var(--color-bg-secondary)] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        >
          <MoreVertical size={14} />
        </button>
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute right-0 top-9 w-36 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg shadow-xl z-20 overflow-hidden"
            >
              <button
                onClick={(e) => { e.preventDefault(); onEdit(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card-hover)]"
              >
                <Edit3 size={14} /> Edit
              </button>
              <button
                onClick={(e) => { e.preventDefault(); onDelete(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]"
              >
                <Trash2 size={14} /> Delete
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
