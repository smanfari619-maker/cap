import { useEditorStore } from './store/editorStore';
import Dashboard from './components/dashboard/Dashboard';
import EditorLayout from './components/editor/EditorLayout';
import PwaInstallBanner from './components/PwaInstallBanner';

function App() {
  const currentProjectId = useEditorStore(state => state.currentProjectId);

  // If a video project is open, show the editor
  if (currentProjectId) {
    return (
      <>
        <EditorLayout />
        <PwaInstallBanner />
      </>
    );
  }

  // Otherwise show the video dashboard
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 min-h-0 overflow-hidden">
        <Dashboard />
      </div>
      <PwaInstallBanner />
    </div>
  );
}

export default App;
