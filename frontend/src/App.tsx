import { ReactFlowProvider } from '@xyflow/react';
import { useSpacetimeDB } from 'spacetimedb/react';
import { Pipeline } from './Pipeline';
import { TopBar } from './TopBar';
import { PipelineActivityProvider } from './pipeline/activity';
import '@xyflow/react/dist/style.css';
import './App.css';

function App() {
  const { isActive: connected } = useSpacetimeDB();

  if (!connected) {
    return <div className="loading">Connecting…</div>;
  }

  return (
    <ReactFlowProvider>
      <PipelineActivityProvider>
        <Pipeline />
        <TopBar />
      </PipelineActivityProvider>
    </ReactFlowProvider>
  );
}

export default App;
