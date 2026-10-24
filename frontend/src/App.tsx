import { ReactFlowProvider } from '@xyflow/react';
import { useSpacetimeDB } from 'spacetimedb/react';
import { Board } from './Board';
import { TopBar } from './TopBar';
import { PipelineControls } from './pipeline/PipelineControls';
import { PipelineActivityProvider } from './pipeline/activity';
import '@xyflow/react/dist/style.css';
import '../../design-system/src/tokens/tokens.css';
import './App.css';
import './pipeline/pipeline.css';

function App() {
  const { isActive: connected } = useSpacetimeDB();

  if (!connected) {
    return <div className="loading">Connecting…</div>;
  }

  return (
    <ReactFlowProvider>
      <PipelineActivityProvider>
        <Board />
        <PipelineControls />
        <TopBar />
      </PipelineActivityProvider>
    </ReactFlowProvider>
  );
}

export default App;
