import { useEditorStore } from './store/editorStore';
import Dashboard from './components/dashboard/Dashboard';
import EditorLayout from './components/editor/EditorLayout';
import PwaInstallBanner from './components/PwaInstallBanner';

function App() {
  const currentProjectId = useEditorStore(state => state.currentProjectId);

  return (
    <>
      {currentProjectId ? <EditorLayout /> : <Dashboard />}
      <PwaInstallBanner />
    </>
  );
}

export default App;
