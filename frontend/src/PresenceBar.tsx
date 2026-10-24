import { useEffect, useRef, useState } from 'react';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { reducers, tables } from './module_bindings';
import type { User } from './module_bindings/types';

const MAX_AVATARS = 5;

function Avatar({ user }: { user: User }) {
  return (
    <span className="avatar" style={{ background: user.color }} title={user.name}>
      {user.name.charAt(0).toUpperCase()}
    </span>
  );
}

// Avatar stack of everyone online; click it to see the list and rename yourself.
export function PresenceBar() {
  const { identity } = useSpacetimeDB();
  const [onlineUsers] = useTable(tables.user.where(r => r.online.eq(true)));
  const setName = useReducer(reducers.setName);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setDraft(null);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  const isMe = (u: User) => !!identity && u.identity.isEqual(identity);
  const me = onlineUsers.find(isMe);
  const users = me ? [me, ...onlineUsers.filter(u => !isMe(u))] : onlineUsers;
  const overflow = users.length - MAX_AVATARS;

  const submitName = (e: React.FormEvent) => {
    e.preventDefault();
    if (draft === null) return;
    setName({ name: draft })
      .then(() => {
        setDraft(null);
        setError(null);
      })
      .catch((err: Error) => setError(err.message));
  };

  return (
    <div className="presence" ref={rootRef}>
      <button className="avatars" onClick={() => setOpen(o => !o)}>
        {users.slice(0, MAX_AVATARS).map(u => (
          <Avatar key={u.identity.toHexString()} user={u} />
        ))}
        {overflow > 0 && <span className="avatar more">+{overflow}</span>}
      </button>

      {open && (
        <div className="panel">
          <div className="panel-title">Here now · {users.length}</div>
          <ul>
            {users.map(u => (
              <li key={u.identity.toHexString()}>
                <Avatar user={u} />
                {isMe(u) && draft !== null ? (
                  <form onSubmit={submitName}>
                    <input
                      autoFocus
                      value={draft}
                      maxLength={24}
                      onChange={e => setDraft(e.target.value)}
                      onKeyDown={e => e.key === 'Escape' && setDraft(null)}
                    />
                    <button type="submit">Save</button>
                  </form>
                ) : (
                  <>
                    <span className="name">
                      {u.name}
                      {isMe(u) && <span className="you"> (you)</span>}
                    </span>
                    {isMe(u) && (
                      <button className="link" onClick={() => setDraft(u.name)}>
                        Edit
                      </button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
          {error && <div className="error">{error}</div>}
        </div>
      )}
    </div>
  );
}
