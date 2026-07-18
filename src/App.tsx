import { useState } from 'react';
import { useEditorStore } from './store/editorStore';
import Dashboard from './components/dashboard/Dashboard';
import EditorLayout from './components/editor/EditorLayout';
import DesignDashboard from './components/design/DesignDashboard';
import PwaInstallBanner from './components/PwaInstallBanner';


type AppMode = 'video' | 'design';

function App() {
  const currentProjectId = useEditorStore(state => state.currentProjectId);
  const [mode, setMode] = useState<AppMode>('design');

  // If a video project is open, show the editor (no mode switcher)
  if (currentProjectId) {
    return (
      <>
        <EditorLayout />
        <PwaInstallBanner />
      </>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Content area ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {mode === 'video' ? (
          <Dashboard />
        ) : (
          <DesignDashboard onSwitchToVideo={() => setMode('video')} />
        )}
      </div>

      <PwaInstallBanner />
    </div>
  );
}

export default App;
