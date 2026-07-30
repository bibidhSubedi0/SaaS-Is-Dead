import { useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useFolders } from '../hooks/useDB';
import type { Folder } from '../lib/types';

const EMOJI_OPTIONS = ['📁', '📚', '🎯', '🧠', '💡', '🔬', '🎨', '🎵', '💻', '🌍', '🧪', '📐'];
const COLOR_OPTIONS = ['#ffb400', '#5fb3ff', '#5fd38d', '#ff6b6b', '#c792ff', '#ff8fb1', '#4fd8d8', '#f5f5f0'];

interface FolderModalProps {
  onClose: () => void;
  folder?: Folder;
}

export default function FolderModal({ onClose, folder }: FolderModalProps) {
  const [name, setName] = useState(folder?.name ?? '');
  const [icon, setIcon] = useState(folder?.icon ?? '📁');
  const [color, setColor] = useState(folder?.color ?? '#ffb400');
  const { addFolder, updateFolder } = useFolders();

  const handleSave = async () => {
    if (!name.trim()) return;
    if (folder?.id) {
      await updateFolder(folder.id, { name, icon, color });
    } else {
      await addFolder({ name, icon, color });
    }
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl w-full max-w-md p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display font-semibold text-lg">
            {folder ? 'Edit Folder' : 'New Folder'}
          </h2>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            <X size={20} />
          </button>
        </div>

        {/* Name */}
        <label className="block text-sm text-[var(--color-text-secondary)] mb-1.5">Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="My Folder"
          className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[var(--color-accent)] transition-colors mb-4"
          autoFocus
        />

        {/* Icon */}
        <label className="block text-sm text-[var(--color-text-secondary)] mb-1.5">Icon</label>
        <div className="flex flex-wrap gap-2 mb-4">
          {EMOJI_OPTIONS.map(e => (
            <button
              key={e}
              onClick={() => setIcon(e)}
              className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg transition-all ${
                icon === e
                  ? 'bg-[var(--color-accent)] bg-opacity-20 ring-2 ring-[var(--color-accent)]'
                  : 'bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-elevated)]'
              }`}
            >
              {e}
            </button>
          ))}
        </div>

        {/* Color */}
        <label className="block text-sm text-[var(--color-text-secondary)] mb-1.5">Color</label>
        <div className="flex flex-wrap gap-2 mb-6">
          {COLOR_OPTIONS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-10 h-10 rounded-full transition-all ${
                color === c ? 'ring-2 ring-offset-2 ring-offset-[var(--color-bg-card)]' : ''
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] text-sm font-medium hover:bg-[var(--color-bg-elevated)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="flex-1 py-2.5 rounded-lg bg-[var(--color-accent)] text-[var(--color-accent-ink)] text-sm font-semibold hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-40"
          >
            {folder ? 'Save' : 'Create'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
