import { useEffect, useRef, useState, type ComponentType, type MouseEvent, type ReactNode } from 'react';
import { Handle, Panel, type NodeProps } from '@xyflow/react';
import { Icon, type IconName } from '../../../design-system/src/components';
import { AskSettle } from '../ui/AskSettle';
import { HANDLES } from './layout';
import { getView as view, setLock, setOpen, useFocus, useShown, useView, type Lock } from './view';

// Three levels of detail on one canvas. Far: one word and one big number per
// card, readable from across the table. Middle: one line per thing. Near: the
// full card, every row, with the actions. Clicking a card opens it in full.

// What a card shows from far away.
export type Look = 'idle' | 'working' | 'done' | 'issue';

export type FarView = {
  icon: IconName;
  word: string;
  big: ReactNode;
  line?: ReactNode;
  // A card with something to say wears the crafted surface: orange while it
  // works or waits on a person, green when done, red with an open issue
  craft?: 'decide' | 'accept' | 'reject';
};

export type CardLevels = {
  // Each level is a component, so it can read live tables
  far: ComponentType<NodeProps>;
  short: ComponentType<NodeProps>;
  full: ComponentType<NodeProps>;
  // A live look on the wrapper (working, done, issue) for every level
  useLook?: (props: NodeProps) => Look;
};

export function Handles({ type }: { type: string }) {
  return (
    <>
      {HANDLES[type].map((h, i) => (
        <Handle
          key={i}
          type={h.type}
          position={h.position}
          id={h.id}
          isConnectable={false}
          style={h.left ? { left: h.left } : undefined}
        />
      ))}
    </>
  );
}

const CRAFT = { decide: 'craft-surface', accept: 'craft-surface is-accept', reject: 'craft-surface is-reject' };

export function FarCard({ type, width, ...v }: FarView & { type: string; width: string }) {
  return (
    <div className={`pnode far-card ${width}${v.craft ? ' ' + CRAFT[v.craft] : ''}`}>
      <div className="far-word">
        <Icon name={v.icon} />
        <span>{v.word}</span>
      </div>
      <div className="far-big">{v.big}</div>
      {v.line && <div className="far-line">{v.line}</div>}
      <Handles type={type} />
    </div>
  );
}

// Plays the tag's finish once when a card's look turns from working to a result.
function useJustFinished(look: string) {
  const prev = useRef(look);
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    const was = prev.current;
    prev.current = look;
    if ((was === 'working' && (look === 'done' || look === 'issue')) || (was === 'issue' && look === 'done')) {
      setFinished(true);
      const t = window.setTimeout(() => setFinished(false), 900);
      return () => window.clearTimeout(t);
    }
  }, [look]);
  return finished;
}

// One card type at every level. Clicking a card that isn't in full opens it
// in full and centres it; buttons, links and toggles inside do their own thing.
export function leveled(c: CardLevels) {
  const Far = c.far;
  const Short = c.short;
  const Full = c.full;
  const useLook = c.useLook ?? (() => 'idle' as Look);
  return function Leveled(props: NodeProps) {
    const level = useShown(props.id);
    const { openCard } = useFocus();
    const look = useLook(props);
    const finished = useJustFinished(look);
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('button, a, summary, input, textarea, iframe, .lv-click')) return;
      openCard(props.id);
    };
    const body =
      level === 'near' ? (
        <div className="lv-full">
          <Full {...props} />
        </div>
      ) : level === 'mid' ? (
        <div className="lv-short lv-openable" onClick={onClick}>
          <Short {...props} />
        </div>
      ) : (
        <div className="lv-openable" onClick={onClick}>
          <Far {...props} />
        </div>
      );
    return <div className={`lv-check is-${look}${finished ? ' just-finished' : ''}`}>{body}</div>;
  };
}

const LOCKS: { id: Lock; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto', hint: 'Follows the zoom' },
  { id: 'far', label: 'Overview', hint: 'One number per card' },
  { id: 'mid', label: 'Cards', hint: 'One line per thing' },
  { id: 'near', label: 'Full detail', hint: 'Every row, at any zoom' },
];

// Bottom right: how much every card shows. Auto follows the zoom; the others
// hold that level at any zoom. Esc or a click on empty canvas closes an
// opened card.
export function DetailFilter() {
  const { lock, open } = useView();
  const { fitAll } = useFocus();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && view().open) setOpen(null);
    };
    const onClick = (e: globalThis.MouseEvent) => {
      if ((e.target as HTMLElement).classList?.contains('react-flow__pane') && view().open) setOpen(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onClick);
    };
  }, []);

  return (
    <Panel position="bottom-right" className="lv-control">
      {open && (
        <button
          type="button"
          className="lv-close"
          onClick={() => {
            setOpen(null);
            fitAll();
          }}
        >
          Close card <kbd>Esc</kbd>
        </button>
      )}
      <div className="lv-row">
        <div className="lv-seg" role="radiogroup" aria-label="How much each card shows">
          <span className="lv-label">Detail</span>
          {LOCKS.map(l => (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={lock === l.id}
              title={l.hint}
              onClick={() => {
                setLock(l.id);
                fitAll();
              }}
            >
              {l.label}
            </button>
          ))}
        </div>
        <AskSettle />
      </div>
    </Panel>
  );
}
