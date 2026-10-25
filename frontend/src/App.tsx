import { ReactFlowProvider } from '@xyflow/react';
import { useSpacetimeDB } from 'spacetimedb/react';
import { Pipeline } from './Pipeline';
import { Icon } from '../../design-system/src/components';
import { TopBar } from './TopBar';
import { PipelineActivityProvider } from './pipeline/activity';
import { LiveProvider } from './pipeline/store';
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
        <PipelineActivityProvider>
          <Pipeline />
          <Brand />
          <TopBar />
        </PipelineActivityProvider>
      </LiveProvider>
    </ReactFlowProvider>
  );
}

// Top left: the mark and the name, nothing else.
function Brand() {
  return (
    <div className="brand" aria-label="Pacioli">
      <Icon name="Pacioli" size={20} />
      <span>Pacioli</span>
    </div>
  );
}

export default App;
