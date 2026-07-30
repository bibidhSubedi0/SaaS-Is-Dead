import { NavLink, Outlet } from 'react-router-dom';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutGrid, Plus, Upload, ChevronLeft, ChevronRight, Layers
} from 'lucide-react';
import { useFolders } from '../hooks/useDB';
import FolderModal from './FolderModal';

const TAB_COLORS = ['var(--tab-1)', 'var(--tab-2)', 'var(--tab-3)', 'var(--tab-4)', 'var(--tab-5)', 'var(--tab-6)'];

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const { folders } = useFolders();

  return (
    <div className="flex h-full">
      {/* Sidebar — a card-catalog drawer */}
      <motion.aside
        animate={{ width: collapsed ? 64 : 248 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="h-full bg-[var(--color-bg-secondary)] border-r border-[var(--color-border)] flex flex-col shrink-0 overflow-hidden"
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 h-16 border-b border-[var(--color-border)] shrink-0">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-accent)] flex items-center justify-center shrink-0">
            <Layers size={16} className="text-[var(--color-accent-ink)]" strokeWidth={2.5} />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="font-display font-semibold text-xl tracking-tight whitespace-nowrap"
              >
                Flashmind
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
          <SidebarLink to="/" icon={<LayoutGrid size={17} />} label="Dashboard" collapsed={collapsed} />
          <SidebarLink to="/import" icon={<Upload size={17} />} label="Import" collapsed={collapsed} />

          <div className="pt-4 pb-1 px-2">
            <AnimatePresence>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center justify-between"
                >
                  <span className="font-data text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">
                    Folders
                  </span>
                  <button
                    onClick={() => setShowFolderModal(true)}
                    className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
                  >
                    <Plus size={14} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {folders.map((folder, i) => (
            <SidebarLink
              key={folder.id}
              to={`/folder/${folder.id}`}
              icon={<span className="text-sm leading-none">{folder.icon}</span>}
              label={folder.name}
              collapsed={collapsed}
              tabColor={folder.color || TAB_COLORS[i % TAB_COLORS.length]}
            />
          ))}
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="h-10 flex items-center justify-center border-t border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors shrink-0"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </motion.aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      <AnimatePresence>
        {showFolderModal && (
          <FolderModal onClose={() => setShowFolderModal(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarLink({ to, icon, label, collapsed, tabColor }: {
  to: string;
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
  tabColor?: string;
}) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `relative flex items-center gap-3 pl-3.5 pr-3 py-2 rounded-lg text-sm transition-all duration-150 group ${
          isActive
            ? 'bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]'
        } ${collapsed ? 'justify-center pl-3' : ''}`
      }
      style={tabColor ? ({ '--tab-color': tabColor } as React.CSSProperties) : undefined}
    >
      {({ isActive }) => (
        <>
          {tabColor && (
            <span
              className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full transition-opacity"
              style={{ background: tabColor, opacity: isActive ? 1 : 0.35 }}
            />
          )}
          <span className="shrink-0">{icon}</span>
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="whitespace-nowrap overflow-hidden text-ellipsis"
              >
                {label}
              </motion.span>
            )}
          </AnimatePresence>
        </>
      )}
    </NavLink>
  );
}
