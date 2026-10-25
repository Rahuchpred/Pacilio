import { ReactFlowProvider } from '@xyflow/react';
import { useSpacetimeDB } from 'spacetimedb/react';
import { Pipeline } from './Pipeline';
import { TopBar } from './TopBar';
import { Sidebar } from './ui/Sidebar';
import { PipelineActivityProvider } from './pipeline/activity';
import { CanvasStateProvider, LiveProvider } from './pipeline/store';
import '@xyflow/react/dist/style.css';
import './App.css';

function App() {
  const { isActive: connected } = useSpacetimeDB();

  if (!connected) {
    return <div className="loading">Connecting…</div>;
  }

  return (
    <ReactFlowProvider>
      <LiveProvider>
        <CanvasStateProvider>
        <PipelineActivityProvider>
          <Pipeline />
          <Sidebar />
          <TopBar />
        </PipelineActivityProvider>
        </CanvasStateProvider>
      </LiveProvider>
    </ReactFlowProvider>
  );
}

export default App;
