import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import { useState } from 'react';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import CreateSet from './pages/CreateSet';
import SetDetail from './pages/SetDetail';
import Practice from './pages/Practice';
import FolderView from './pages/FolderView';
import ImportPage from './pages/ImportPage';
import { useDBState } from './hooks/useDB';
import { Layers, FolderOpen } from 'lucide-react';

function CreateSetWithKey() {
  const { id } = useParams();
  return <CreateSet key={id} />;
}

function SetDetailWithKey() {
  const { id } = useParams();
  return <SetDetail key={id} />;
}

function PracticeWithKey() {
  const { id } = useParams();
  return <Practice key={id} />;
}

export default function App() {
  const { state, pickFolder } = useDBState();
  const [picking, setPicking] = useState(false);

  if (state === 'loading') {
    return (
      <div className="flex items-center justify-center h-full bg-[var(--color-bg-primary)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[var(--color-accent)] flex items-center justify-center animate-pulse">
            <Layers size={24} className="text-[var(--color-accent-ink)]" />
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">Loading...</p>
        </div>
      </div>
    );
  }

  if (state === 'need-folder') {
    return (
      <div className="flex items-center justify-center h-full bg-[var(--color-bg-primary)]">
        <div className="flex flex-col items-center gap-6 max-w-md text-center px-6">
          <div className="w-16 h-16 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-center justify-center">
            <Layers size={28} className="text-[var(--color-accent)]" />
          </div>
          <div>
            <h1 className="font-display font-semibold text-2xl mb-2">Welcome to Flashmind</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Choose a folder to store your flashcards. All data is saved as a local file — no limits, no cloud.
            </p>
          </div>
          <button
            onClick={async () => {
              setPicking(true);
              await pickFolder();
              setPicking(false);
            }}
            disabled={picking}
            className="flex items-center gap-3 px-6 py-3 rounded-xl bg-[var(--color-accent)] text-[var(--color-accent-ink)] font-semibold hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
          >
            <FolderOpen size={18} />
            {picking ? 'Waiting for you...' : 'Choose Folder'}
          </button>
          <p className="text-xs text-[var(--color-text-muted)]">
            Pick any folder — we'll save a <code className="px-1 py-0.5 rounded bg-[var(--color-bg-card)] text-[var(--color-accent)] font-mono text-[11px]">flashmind.json</code> file there.
          </p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/set/:id" element={<CreateSetWithKey />} />
          <Route path="/view/:id" element={<SetDetailWithKey />} />
          <Route path="/practice/:id" element={<PracticeWithKey />} />
          <Route path="/folder/:id" element={<FolderView />} />
          <Route path="/import" element={<ImportPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
