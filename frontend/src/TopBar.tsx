import { useCallback, useRef, useState } from 'react';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { reducers, tables } from './module_bindings';
import type { User } from './module_bindings/types';
import { Avatar } from './Avatar';
import { useDismiss } from './useDismiss';

const MAX_PEOPLE = 5;

// Top-right cluster, Canva style: [other people] [notifications] [you]
export function TopBar() {
  const { identity } = useSpacetimeDB();
  const [onlineUsers] = useTable(tables.user.where(r => r.online.eq(true)));

  const me = identity
    ? onlineUsers.find(u => u.identity.isEqual(identity))
    : undefined;
  const others = onlineUsers.filter(u => u !== me);

  return (
    <div className="topbar">
      {others.length > 0 && <PeopleBar people={others} />}
      <Notifications />
      {me && <ProfileMenu me={me} />}
    </div>
  );
}

function PeopleBar({ people }: { people: User[] }) {
  const overflow = people.length - MAX_PEOPLE;
  return (
    <div className="people">
      {people.slice(0, MAX_PEOPLE).map(u => (
        <Avatar key={u.identity.toHexString()} user={u} tooltip />
      ))}
      {overflow > 0 && (
        <span className="avatar more">
          +{overflow}
          <span className="tooltip">
            {people.slice(MAX_PEOPLE).map(u => u.name).join(', ')}
          </span>
        </span>
      )}
    </div>
  );
}

// ─── Notifications ──────────────────────────────────────────────────────────

type Notification = {
  id: number;
  user: User;
  text: string;
  at: Date;
};

function Notifications() {
  const { identity } = useSpacetimeDB();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(rootRef, open, close);

  // Refs keep the table callbacks stable; changing them would resubscribe.
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const nextId = useRef(0);

  const push = useCallback((user: User, text: string) => {
    if (identityRef.current && user.identity.isEqual(identityRef.current)) return;
    const item = { id: nextId.current++, user, text, at: new Date() };
    setItems(prev => [item, ...prev].slice(0, 50));
    setUnread(n => n + 1);
  }, []);

  // Joins/leaves are intentionally not notifications; the people bar shows presence.
  const onUpdate = useCallback(
    (prev: User, next: User) => {
      if (prev.name !== next.name) push(next, `was renamed from ${prev.name}`);
    },
    [push]
  );

  useTable(tables.user, { onUpdate });

  const toggle = () => {
    setOpen(o => !o);
    setUnread(0);
  };

  return (
    <div className="menu-root" ref={rootRef}>
      <button
        className={`icon-button ${open ? 'active' : ''}`}
        onClick={toggle}
        aria-label="Notifications"
      >
        <BellIcon />
        {unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="dropdown notifications">
          <div className="dropdown-title">Notifications</div>
          {items.length === 0 ? (
            <div className="empty">You're all caught up</div>
          ) : (
            <ul>
              {items.map(n => (
                <li key={n.id}>
                  <Avatar user={n.user} size={28} />
                  <div>
                    <div>
                      <b>{n.user.name}</b> {n.text}
                    </div>
                    <div className="time">
                      {n.at.toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

// ─── Profile ────────────────────────────────────────────────────────────────

function ProfileMenu({ me }: { me: User }) {
  const setName = useReducer(reducers.setName);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(me.name);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(rootRef, open, close);

  const toggle = () => {
    setDraft(me.name);
    setError(null);
    setOpen(o => !o);
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setName({ name: draft })
      .then(() => setOpen(false))
      .catch((err: Error) => setError(err.message));
  };

  return (
    <div className="menu-root" ref={rootRef}>
      <button className="profile-button" onClick={toggle} aria-label="Your profile">
        <Avatar user={me} size={36} />
      </button>

      {open && (
        <div className="dropdown profile">
          <div className="profile-header">
            <Avatar user={me} size={44} />
            <div>
              <div className="profile-name">{me.name}</div>
              <div className="time">This is how others see you</div>
            </div>
          </div>
          <form onSubmit={save}>
            <label htmlFor="display-name">Display name</label>
            <div className="row">
              <input
                id="display-name"
                autoFocus
                value={draft}
                maxLength={24}
                onChange={e => setDraft(e.target.value)}
              />
              <button type="submit" disabled={!draft.trim() || draft === me.name}>
                Save
              </button>
            </div>
          </form>
          {error && <div className="error">{error}</div>}
        </div>
      )}
    </div>
  );
}
