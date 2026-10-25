import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { Icon } from '../../design-system/src/components';
import { useFocus, useSetExpanded } from './canvas/view';
import { openItem } from './pipeline/live';
import { reducers, tables } from './module_bindings';
import type { User } from './module_bindings/types';
import { Avatar } from './Avatar';
import { useDismiss } from './useDismiss';

const MAX_PEOPLE = 4;

// Top right, the way Figma, Canva and Google Docs do collaboration:
// who is here (others stacked, you last), the bell for what needs you, then
// one clear action, Share.
export function TopBar() {
  const { identity } = useSpacetimeDB();
  const [onlineUsers] = useTable(tables.user.where(r => r.online.eq(true)));

  const me = identity ? onlineUsers.find(u => u.identity.isEqual(identity)) : undefined;
  const others = onlineUsers.filter(u => u !== me);

  return (
    <div className="topbar">
      <div className="people" aria-label={`${onlineUsers.length} here`}>
        {others.slice(0, MAX_PEOPLE).map(u => (
          <Avatar key={u.identity.toHexString()} user={u} size={28} tooltip />
        ))}
        {others.length > MAX_PEOPLE && (
          <span className="avatar more">
            +{others.length - MAX_PEOPLE}
            <span className="tooltip">{others.slice(MAX_PEOPLE).map(u => u.name).join(', ')}</span>
          </span>
        )}
        {me && <ProfileMenu me={me} />}
      </div>
      <Notifications />
      <ShareButton />
    </div>
  );
}

// The bell: questions waiting on you and email replies nobody has opened.
// Joins and leaves are not notifications; the people bar shows presence.
function Notifications() {
  const { focusWhenGrown } = useFocus();
  const setExpanded = useSetExpanded();
  const [open, setOpen] = useState(false);
  // Questions asked after this moment count as unread
  const [seenAt, setSeenAt] = useState(() => Date.now());
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(rootRef, open, close);

  const [flagRows] = useTable(tables.reviewItem.where(r => r.status.eq('open')));
  const [details] = useTable(tables.reviewDetail);
  const [replyRows] = useTable(tables.emailThread.where(r => r.unread.eq(true)));
  const titleById = new Map(details.map(d => [d.itemId.toString(), d.title]));
  const flags = [...flagRows].sort((a, b) => (a.id < b.id ? 1 : -1));
  const replies = [...replyRows].sort((a, b) =>
    a.lastActivityAt.microsSinceUnixEpoch < b.lastActivityAt.microsSinceUnixEpoch ? 1 : -1
  );
  const unread = replies.length + flags.filter(f => f.createdAt.toDate().getTime() > seenAt).length;
  const time = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const go = (card: string, eventId?: bigint) => {
    setOpen(false);
    // Opens the card for everyone, then brings it to you
    setExpanded(card, true);
    focusWhenGrown(card);
    if (eventId !== undefined) openItem(eventId);
  };

  return (
    <div className="menu-root" ref={rootRef}>
      <button
        type="button"
        className={`bell${open ? ' is-open' : ''}`}
        onClick={() => {
          setOpen(o => !o);
          setSeenAt(Date.now());
        }}
        aria-label={`Notifications${unread ? `, ${unread} new` : ''}`}
        aria-expanded={open}
      >
        <BellIcon />
        {unread > 0 && <span className="bell-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="dropdown notifications">
          <div className="dropdown-title">Notifications</div>
          {flags.length === 0 && replies.length === 0 ? (
            <p className="muted small">You're all caught up.</p>
          ) : (
            <ul className="notice-list">
              {replies.map(r => (
                <li key={`reply-${r.id}`}>
                  <button type="button" onClick={() => go('emails')}>
                    <span className="email-dot" />
                    <span className="stack">
                      <span>
                        <b>{r.counterparty} replied</b> · {r.subject}
                      </span>
                      <span className="tertiary small">Email · {time(r.lastActivityAt.toDate())}</span>
                    </span>
                  </button>
                </li>
              ))}
              {flags.map(f => (
                <li key={`flag-${f.id}`}>
                  <button type="button" onClick={() => go('flagged', f.eventId)}>
                    <Icon name="hourglass" size={14} />
                    <span className="stack">
                      <b>{titleById.get(f.id.toString()) ?? f.question}</b>
                      <span className="tertiary small">Needs your OK · {time(f.createdAt.toDate())}</span>
                    </span>
                  </button>
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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

// Copies the link. The label swaps to "Link copied" with a short blur so the
// change reads as one button changing, not two buttons swapping.
function ShareButton() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  const share = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard access can be refused (page not focused, no permission);
      // fall back to a hidden text field and the copy command.
      const field = document.createElement('textarea');
      field.value = url;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      setCopied(document.execCommand('copy'));
      field.remove();
    }
  };

  return (
    <button type="button" className="btn btn-primary btn-sm topbar-share" onClick={share} aria-live="polite">
      <span key={copied ? 'copied' : 'share'} className="topbar-share-label">
        <Icon name={copied ? 'Check' : 'Link'} size={14} />
        {copied ? 'Link copied' : 'Share'}
      </span>
    </button>
  );
}

// You, last in the stack. Click to change the name others see.
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
    <div className="menu-root me" ref={rootRef}>
      <button className="profile-button" onClick={toggle} aria-label={`You, ${me.name}. Change your name`} aria-expanded={open}>
        <Avatar user={me} size={28} />
        {!open && <span className="tooltip">You</span>}
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
              <input id="display-name" autoFocus value={draft} maxLength={24} onChange={e => setDraft(e.target.value)} />
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
