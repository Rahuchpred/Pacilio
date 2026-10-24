import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../../design-system/src/components';
import './ask.css';

// Ask Settle: a small button in the corner that opens a mini window above it,
// like a quick-entry popup. UI only for now: the thread is a fixed example and
// sending does nothing yet.
export function AskSettle() {
  const [open, setOpen] = useState(false);
  // Opened from the keyboard: no animation (it is used often and should feel instant).
  const [instant, setInstant] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setInstant(true);
        setOpen(o => !o);
      } else if (e.key === 'Escape' && open) {
        e.stopImmediatePropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  return (
    <div className="ask">
      {open && (
        <div className={`ask-window${instant ? ' is-instant' : ''}`} role="dialog" aria-label="Ask Settle">
          <header className="ask-head">
            <Icon name="Sparkle" />
            <span className="strong">Ask Settle</span>
            <span className="ask-sub">Reads this run</span>
            <kbd>Esc</kbd>
          </header>
          <div className="ask-thread">
            <p className="ask-you">Why is Halcyon held?</p>
            <div className="ask-answer">
              <Icon name="Sparkle" size={14} />
              <div>
                <p>It bills 52 hours, but PO 4410 covers 48, so it is $480.00 over. Nothing posts until you decide.</p>
                <button type="button" className="ask-link">
                  Show on canvas
                </button>
              </div>
            </div>
          </div>
          <form className="ask-compose" onSubmit={e => e.preventDefault()}>
            <input ref={input} placeholder="Ask about this run" aria-label="Ask about this run" />
            <button type="submit" className="ask-send" aria-label="Send" disabled>
              <Icon name="Send" size={14} />
            </button>
          </form>
        </div>
      )}
      <button
        type="button"
        className={`ask-button${open ? ' is-open' : ''}`}
        aria-expanded={open}
        onClick={() => {
          setInstant(false);
          setOpen(o => !o);
        }}
      >
        <Icon name="Sparkle" />
        <span>Ask Settle</span>
        <kbd>⌘K</kbd>
      </button>
    </div>
  );
}
