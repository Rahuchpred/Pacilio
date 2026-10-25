import { useEffect, useLayoutEffect, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useReducer } from 'spacetimedb/react';
import { Button, Icon } from '../../../design-system/src/components';
import { reducers } from '../module_bindings';
import { SCENARIOS, type Scenario } from '../../../backend/src/scenarios';
import { useLive } from '../pipeline/store';
import { logError } from '../throttle';
import './sidebar.css';

// The left sidebar, as most work apps have it: the name at the top with a
// button to close it (or Cmd/Ctrl+\), the scenarios below, and a handle on
// the right edge to widen it. The canvas moves over to make room. Width and
// open state are this browser's own.

const WIDTH = { min: 220, max: 360, initial: 240 };
const KEY = { open: 'pacioli.sidebar.open', width: 'pacioli.sidebar.width' };
const PHONE = 720;

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private windows can refuse storage; the sidebar just won't remember
  }
}

const clamp = (w: number) => Math.min(WIDTH.max, Math.max(WIDTH.min, Math.round(w)));

export function Sidebar() {
  // Open by default, except on phones where it would cover the canvas
  const [open, setOpen] = useState(() => (load(KEY.open) ?? String(window.innerWidth > PHONE)) === 'true');
  const [width, setWidth] = useState(() => clamp(Number(load(KEY.width)) || WIDTH.initial));
  const [resizing, setResizing] = useState(false);

  // The board reads this to make room. Before paint, so the canvas fits its
  // first view to the room it really has.
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', open ? `${width}px` : '0px');
  }, [open, width]);
  useEffect(() => save(KEY.open, String(open)), [open]);
  useEffect(() => {
    if (!resizing) save(KEY.width, String(width));
  }, [width, resizing]);
  useEffect(() => {
    document.documentElement.classList.toggle('is-resizing-sidebar', resizing);
  }, [resizing]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggle = (
    <button
      type="button"
      className="btn btn-quiet btn-sm btn-icon sidebar-toggle"
      onClick={() => setOpen(o => !o)}
      aria-label={open ? 'Close sidebar' : 'Open sidebar'}
      aria-expanded={open}
      aria-controls="sidebar"
      title={`${open ? 'Close' : 'Open'} sidebar (${navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl+'}\\)`}
    >
      <Icon name="SidebarSimple" />
    </button>
  );

  // One name and one button for both states, fixed in place above the
  // sidebar, so opening and closing only slides the list
  return (
    <>
      <aside id="sidebar" className={`sidebar${open ? '' : ' is-closed'}`} style={{ width }} aria-label="Sidebar">
        <div className="sidebar-head" />
        <Scenarios />
        <ResizeHandle width={width} onResize={setWidth} onResizing={setResizing} />
      </aside>
      <div className="sidebar-top">
        <Brand />
        {toggle}
      </div>
    </>
  );
}

function Brand() {
  return (
    <div className="brand" aria-label="Pacioli">
      <Icon name="Pacioli" size={20} />
      <span>Pacioli</span>
    </div>
  );
}

// Picking another business clears the board for everyone, so it asks first.
function Scenarios() {
  const { scenario } = useLive();
  const switchTo = useReducer(reducers.setScenario);
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const confirm = (s: Scenario) => {
    setBusy(true);
    switchTo({ key: s.key })
      .then(() => setAsking(null))
      .catch(logError)
      .finally(() => setBusy(false));
  };

  return (
    <nav className="sidebar-section" aria-labelledby="sidebar-scenarios">
      <h2 id="sidebar-scenarios" className="sidebar-heading">
        Scenarios
      </h2>
      <ul className="sidebar-list">
        {SCENARIOS.map(s => {
          const active = s.key === scenario.key;
          return (
            <li key={s.key} className={asking === s.key && !active ? 'is-asking' : undefined}>
              <button
                type="button"
                className={`sidebar-item${active ? ' is-active' : ''}`}
                aria-current={active || undefined}
                onClick={() => !active && setAsking(a => (a === s.key ? null : s.key))}
              >
                {s.name}
              </button>
              {asking === s.key && !active && (
                <div className="sidebar-confirm">
                  <Button kind="primary" size="sm" pending={busy} disabled={busy} onClick={() => confirm(s)}>
                    Clear and switch
                  </Button>
                  <Button kind="quiet" size="sm" disabled={busy} onClick={() => setAsking(null)}>
                    Keep
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// Drag to widen, arrow keys to nudge, double-click to reset.
function ResizeHandle({
  width,
  onResize,
  onResizing,
}: {
  width: number;
  onResize: (w: number) => void;
  onResizing: (on: boolean) => void;
}) {
  const start = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    const from = e.clientX;
    handle.setPointerCapture(e.pointerId);
    onResizing(true);
    const move = (ev: globalThis.PointerEvent) => onResize(clamp(width + ev.clientX - from));
    const end = () => {
      onResizing(false);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };

  const nudge = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 40 : 10;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      onResize(clamp(width + (e.key === 'ArrowRight' ? step : -step)));
    }
  };

  return (
    <div
      className="sidebar-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={width}
      aria-valuemin={WIDTH.min}
      aria-valuemax={WIDTH.max}
      tabIndex={0}
      onPointerDown={start}
      onKeyDown={nudge}
      onDoubleClick={() => onResize(WIDTH.initial)}
    />
  );
}
