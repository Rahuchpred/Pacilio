import { useCallback, useEffect, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { reducers, tables } from './module_bindings';
import type { User } from './module_bindings/types';
import { Avatar } from './Avatar';
import { useDismiss } from './useDismiss';
import { EMAILS_NODE_ID, FOLLOWUPS_NODE_ID } from './pipeline/sources';

const MAX_PEOPLE = 5;
// Connections shorter than this (CLI calls, tests, a page reload) don't show
const SETTLE_MS = 3000;

// Online users, minus anyone who connected less than SETTLE_MS ago, so brief
// connect/disconnect blips don't make avatars flicker in and out.
function useSettledUsers(users: readonly User[]): User[] {
  const since = useRef(new Map<string, number>());
  const [, setTick] = useState(0);
  const now = Date.now();
  const live = new Set(users.map(u => u.identity.toHexString()));
  for (const id of [...since.current.keys()]) if (!live.has(id)) since.current.delete(id);
  for (const id of live) if (!since.current.has(id)) since.current.set(id, now);
  const pending = users.some(u => now - since.current.get(u.identity.toHexString())! < SETTLE_MS);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setTick(t => t + 1), SETTLE_MS);
    return () => window.clearTimeout(timer);
  });

  return users.filter(u => now - since.current.get(u.identity.toHexString())! >= SETTLE_MS);
}

// Top-right cluster, Canva style: [other people] [notifications] [you]
export function TopBar() {
  const { identity } = useSpacetimeDB();
  const [onlineUsers] = useTable(tables.user.where(r => r.online.eq(true)));

  const me = identity
    ? onlineUsers.find(u => u.identity.isEqual(identity))
    : undefined;
  const others = useSettledUsers(onlineUsers.filter(u => u !== me));

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

// Renames are kept in memory as they happen; flags come straight from the
// review queue, so every open item the agent flagged is listed.
type Rename = { id: number; user: User; text: string; at: Date };

function Notifications() {
  const { identity } = useSpacetimeDB();
  const { fitView } = useReactFlow();
  const [renames, setRenames] = useState<Rename[]>([]);
  const [unreadRenames, setUnreadRenames] = useState(0);
  // Flags created after this moment count as unread
  const [seenAt, setSeenAt] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(rootRef, open, close);

  const [flagRows] = useTable(tables.reviewItem.where(r => r.status.eq('open')));
  const [details] = useTable(tables.reviewDetail);
  const titleById = new Map(details.map(d => [d.itemId.toString(), d.title]));
  const flags = [...flagRows].sort((a, b) => (a.id < b.id ? 1 : -1));
  const unreadFlags = flags.filter(f => f.createdAt.toDate().getTime() > seenAt).length;
  // Email replies nobody has opened yet (cleared when the thread is opened)
  const [replyRows] = useTable(tables.emailThread.where(r => r.unread.eq(true)));
  const replies = [...replyRows].sort((a, b) =>
    a.lastActivityAt.microsSinceUnixEpoch < b.lastActivityAt.microsSinceUnixEpoch ? 1 : -1
  );

  // Refs keep the table callbacks stable; changing them would resubscribe.
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const nextId = useRef(0);

  // Joins/leaves are intentionally not notifications; the people bar shows presence.
  const onUpdate = useCallback((prev: User, next: User) => {
    if (prev.name === next.name) return;
    if (identityRef.current && next.identity.isEqual(identityRef.current)) return;
    const item = { id: nextId.current++, user: next, text: `was renamed from ${prev.name}`, at: new Date() };
    setRenames(list => [item, ...list].slice(0, 30));
    setUnreadRenames(n => n + 1);
  }, []);

  useTable(tables.user, { onUpdate });

  const unread = replies.length + unreadFlags + unreadRenames;

  const toggle = () => {
    setOpen(o => !o);
    setSeenAt(Date.now());
    setUnreadRenames(0);
  };

  const focus = (id: string) => {
    setOpen(false);
    fitView({ nodes: [{ id }], duration: 400, maxZoom: 1, padding: 0.2 });
  };
  const showFollowUps = () => focus(FOLLOWUPS_NODE_ID);

  const time = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

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
          {flags.length === 0 && renames.length === 0 && replies.length === 0 ? (
            <div className="empty">You're all caught up</div>
          ) : (
            <ul>
              {replies.map(r => (
                <li key={`reply-${r.id}`} className="flag-notification" onClick={() => focus(EMAILS_NODE_ID)}>
                  <span className="reply-mark">
                    <span className="email-dot" />
                  </span>
                  <div>
                    <div>
                      <b>{r.counterparty} replied</b> · {r.subject}
                    </div>
                    <div className="time">Email · {time(r.lastActivityAt.toDate())}</div>
                  </div>
                </li>
              ))}
              {flags.map(f => (
                <li key={`flag-${f.id}`} className="flag-notification" onClick={showFollowUps}>
                  <span className="flag-mark">!</span>
                  <div>
                    <div>
                      <b>{titleById.get(f.id.toString()) ?? f.question}</b>
                    </div>
                    <div className="time">Needs your OK · {time(f.createdAt.toDate())}</div>
                  </div>
                </li>
              ))}
              {renames.map(n => (
                <li key={`rename-${n.id}`}>
                  <Avatar user={n.user} size={28} />
                  <div>
                    <div>
                      <b>{n.user.name}</b> {n.text}
                    </div>
                    <div className="time">{time(n.at)}</div>
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
