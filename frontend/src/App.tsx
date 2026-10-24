import { ReactFlowProvider } from '@xyflow/react';
import { useSpacetimeDB } from 'spacetimedb/react';
import { Board } from './Board';
import { PresenceBar } from './PresenceBar';
import '@xyflow/react/dist/style.css';
import './App.css';

function App() {
  const { isActive: connected } = useSpacetimeDB();

  if (!connected) {
    return <div className="loading">Connecting…</div>;
  }

  return (
    <ReactFlowProvider>
      <Board />
      <PresenceBar />
    </ReactFlowProvider>
  );
}

export default App;
