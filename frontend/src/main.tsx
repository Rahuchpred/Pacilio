import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { Identity } from 'spacetimedb';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import { DbConnection, ErrorContext } from './module_bindings/index.ts';

const HOST = import.meta.env.VITE_SPACETIMEDB_HOST ?? 'https://maincloud.spacetimedb.com';
// The database running the current backend (pipeline, agents, emails)
const DB_NAME = import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? 'REDACTED_DB_NAME';
const TOKEN_KEY = `${HOST}/${DB_NAME}/auth_token`;

const onConnect = (_conn: DbConnection, identity: Identity, token: string) => {
  localStorage.setItem(TOKEN_KEY, token);
  console.log(
    'Connected to SpacetimeDB with identity:',
    identity.toHexString()
  );
};

const onDisconnect = () => {
  console.log('Disconnected from SpacetimeDB');
};

const onConnectError = (_ctx: ErrorContext, err: Error) => {
  console.log('Error connecting to SpacetimeDB:', err);
};

const connectionBuilder = DbConnection.builder()
  .withUri(HOST)
  .withDatabaseName(DB_NAME)
  .withToken(localStorage.getItem(TOKEN_KEY) || undefined)
  .onConnect(onConnect)
  .onDisconnect(onDisconnect)
  .onConnectError(onConnectError);

// A trackpad pinch over the dock, the top bar or a panel would zoom the whole
// page and push the fixed controls off screen. Only the canvas zooms: React
// Flow still gets the event first, the browser never does.
// If the page is already zoomed (from before this guard, or a remembered tab),
// the browser keeps the pinch so you can always zoom back out.
const pageZoomed = () => (window.visualViewport?.scale ?? 1) > 1.01;
window.addEventListener('wheel', e => { if (e.ctrlKey && !pageZoomed()) e.preventDefault(); }, { passive: false });
// Safari sends its own gesture events for pinch.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  window.addEventListener(type, e => { if (!pageZoomed()) e.preventDefault(); }, { passive: false });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      <App />
    </SpacetimeDBProvider>
  </StrictMode>
);
