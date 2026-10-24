import { useState } from 'react';
import { tables, reducers } from './module_bindings';
import { useSpacetimeDB, useTable, useReducer } from 'spacetimedb/react';
import './App.css';

function App() {
  const [name, setName] = useState('');

  const { isActive: connected } = useSpacetimeDB();

  // Live subscription: re-renders whenever the person table changes
  const [people] = useTable(tables.person);

  const addReducer = useReducer(reducers.add);

  const addPerson = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !connected) return;
    addReducer({ name: name.trim() });
    setName('');
  };

  return (
    <main className="page">
      <header className="hero">
        <span className={`status ${connected ? 'on' : 'off'}`}>
          {connected ? 'Connected to SpacetimeDB' : 'Connecting…'}
        </span>
        <h1>Cal Hacks</h1>
        <p>Landing page wired to a SpacetimeDB module on maincloud.</p>
      </header>

      <section className="card">
        <form onSubmit={addPerson}>
          <input
            type="text"
            placeholder="Enter your name"
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={!connected}
          />
          <button type="submit" disabled={!connected || !name.trim()}>
            Join
          </button>
        </form>

        <h2>People ({people.length})</h2>
        {people.length === 0 ? (
          <p className="muted">No one yet. Be the first!</p>
        ) : (
          <ul>
            {people.map((person, index) => (
              <li key={index}>{person.name}</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export default App;
