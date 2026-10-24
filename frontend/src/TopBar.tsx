import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { Icon } from '../../design-system/src/components';
import { reducers, tables } from './module_bindings';
import type { User } from './module_bindings/types';
import { Avatar } from './Avatar';
import { useDismiss } from './useDismiss';

const MAX_PEOPLE = 4;

// Top right, the way Figma, Canva and Google Docs do collaboration:
// who is here (others stacked, you last), then one clear action, Share.
// No bell: nothing here needs a separate inbox, and presence already shows
// who joined.
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
      <ShareButton />
    </div>
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
