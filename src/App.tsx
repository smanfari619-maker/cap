import { useEditorStore } from './store/editorStore';
import Dashboard from './components/dashboard/Dashboard';
import EditorLayout from './components/editor/EditorLayout';

function App() {
  const currentProjectId = useEditorStore(state => state.currentProjectId);

  return (
    <>
      {currentProjectId ? <EditorLayout /> : <Dashboard />}
    </>
  );
}

export default App;
