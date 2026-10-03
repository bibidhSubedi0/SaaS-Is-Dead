import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutGrid, Plus, Upload, ChevronLeft, ChevronRight, Layers, Menu
} from 'lucide-react';
import { useFolders } from '../hooks/useDB';
import FolderModal from './FolderModal';

const TAB_COLORS = ['var(--tab-1)', 'var(--tab-2)', 'var(--tab-3)', 'var(--tab-4)', 'var(--tab-5)', 'var(--tab-6)'];

const SIDEBAR_MIN = 64;
const SIDEBAR_MAX = 420;
const SIDEBAR_COLLAPSE_THRESHOLD = 120;
const SIDEBAR_STORAGE_KEY = 'flashmind.sidebarWidth';
const SIDEBAR_DEFAULT = 248;

function clampWidth(w: number) {
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w));
}

function initialWidth(): number {
  if (typeof window === 'undefined') return SIDEBAR_DEFAULT;
  const stored = Number(localStorage.getItem(SIDEBAR_STORAGE_KEY));
  if (!Number.isFinite(stored) || stored <= 0) return SIDEBAR_DEFAULT;
  return clampWidth(stored);
}

export default function Layout() {
  const [width, setWidth] = useState(initialWidth);
  const [expandedWidth, setExpandedWidth] = useState(() => {
    const w = initialWidth();
    return w < SIDEBAR_COLLAPSE_THRESHOLD ? SIDEBAR_DEFAULT : w;
  });
  const [dragging, setDragging] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const location = useLocation();

  const widthRef = useRef(width);

  const collapsed = width < SIDEBAR_COLLAPSE_THRESHOLD;

  const applyWidth = (w: number) => {
    const next = clampWidth(w);
    widthRef.current = next;
    setWidth(next);
  };

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  const handleToggleCollapse = () => {
    if (collapsed) {
      applyWidth(Math.max(expandedWidth, SIDEBAR_DEFAULT));
    } else {
      setExpandedWidth(width);
      applyWidth(SIDEBAR_MIN);
    }
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(widthRef.current));
  };

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = widthRef.current;
    setDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: PointerEvent) => {
      applyWidth(startWidth + (ev.clientX - startX));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setDragging(false);
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(widthRef.current));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div className="flex h-full">
      {/* Mobile top bar */}
      <header
        className="md:hidden fixed top-0 left-0 right-0 z-40 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] flex items-center gap-3 px-4 shrink-0"
        style={{ height: 'calc(3.5rem + env(safe-area-inset-top))', paddingTop: 'env(safe-area-inset-top)' }}
      >
        <button
          onClick={() => setMobileOpen(true)}
          className="w-9 h-9 rounded-lg border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-all"
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>
        <div className="w-7 h-7 rounded-lg bg-[var(--color-accent)] flex items-center justify-center shrink-0">
          <Layers size={14} className="text-[var(--color-accent-ink)]" strokeWidth={2.5} />
        </div>
        <span className="font-display font-semibold text-lg tracking-tight">Flashmind</span>
      </header>

      {/* Desktop sidebar — a card-catalog drawer */}
      <motion.aside
        animate={{ width }}
        transition={dragging ? { duration: 0 } : { duration: 0.2, ease: 'easeInOut' }}
        className="relative hidden md:flex h-full bg-[var(--color-bg-secondary)] border-r border-[var(--color-border)] flex-col shrink-0 overflow-hidden"
      >
        <SidebarContent
          collapsed={collapsed}
          onToggleCollapse={handleToggleCollapse}
          onShowFolderModal={() => setShowFolderModal(true)}
        />

        {/* Resize handle */}
        <div
          onPointerDown={startResize}
          aria-label="Resize sidebar"
          style={{ touchAction: 'none' }}
          className={`absolute right-0 top-0 bottom-0 w-2 z-20 cursor-col-resize transition-colors ${
            dragging ? 'bg-[var(--color-accent)]/40' : 'hover:bg-[var(--color-accent)]/25'
          }`}
        />
      </motion.aside>

      {/* Mobile drawer — slide-over navigation */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm md:hidden"
            />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'tween', duration: 0.22, ease: 'easeOut' }}
              className="fixed left-0 bottom-0 z-50 w-64 md:hidden bg-[var(--color-bg-secondary)] border-r border-[var(--color-border)] flex flex-col overflow-hidden"
              style={{ top: 'calc(3.5rem + env(safe-area-inset-top))' }}
            >
              <SidebarContent
                collapsed={false}
                onToggleCollapse={handleToggleCollapse}
                onShowFolderModal={() => setShowFolderModal(true)}
                onNavigate={() => setMobileOpen(false)}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pt-[calc(3.5rem+env(safe-area-inset-top))] md:pt-0">
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

function SidebarContent({ collapsed, onToggleCollapse, onShowFolderModal, onNavigate }: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onShowFolderModal: () => void;
  onNavigate?: () => void;
}) {
  const { folders } = useFolders();

  return (
    <>
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
        <SidebarLink to="/" icon={<LayoutGrid size={17} />} label="Dashboard" collapsed={collapsed} onNavigate={onNavigate} />
        <SidebarLink to="/import" icon={<Upload size={17} />} label="Import" collapsed={collapsed} onNavigate={onNavigate} />

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
                  onClick={onShowFolderModal}
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
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      {/* Collapse toggle — desktop only */}
      <button
        onClick={onToggleCollapse}
        className="hidden md:flex h-10 items-center justify-center border-t border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors shrink-0"
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </>
  );
}

function SidebarLink({ to, icon, label, collapsed, tabColor, onNavigate }: {
  to: string;
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
  tabColor?: string;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={onNavigate}
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
