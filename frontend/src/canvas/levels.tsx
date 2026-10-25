import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Handle, Panel, type NodeProps } from '@xyflow/react';
import { Icon, type IconName } from '../../../design-system/src/components';
import { AskSettle } from '../ui/AskSettle';
import { HANDLES, NODE_IDS } from './layout';
import { useExpanded, useFocus, useSetExpanded } from './view';

// Two states per card. Overview: one word and one big number, readable from
// across the table. Full: every row, with the actions. A click toggles them.

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
  full: ComponentType<NodeProps>;
  // A live look on the wrapper (working, done, issue) in both states
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

// The big number keeps to one line and shrinks to fit its card, so a wide
// amount ($1,345,690.81) never runs past the edge.
function useFitText<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.fontSize = '';
    const over = el.scrollWidth / Math.max(1, el.clientWidth);
    if (over > 1) el.style.fontSize = `${parseFloat(getComputedStyle(el).fontSize) / over}px`;
  });
  return ref;
}

export function FarCard({ type, width, ...v }: FarView & { type: string; width: string }) {
  const big = useFitText<HTMLDivElement>();
  return (
    <div className={`pnode far-card ${width}${v.craft ? ' ' + CRAFT[v.craft] : ''}`}>
      <div className="far-word">
        <Icon name={v.icon} />
        <span>{v.word}</span>
      </div>
      <div className="far-big" ref={big}>
        {v.big}
      </div>
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

// One card type in its two states: the overview, or open in full for
// everyone. Clicks are handled by the canvas (see Pipeline), so dragging a
// card never toggles it.
export function leveled(c: CardLevels) {
  const Far = c.far;
  const Full = c.full;
  const useLook = c.useLook ?? (() => 'idle' as Look);
  return function Leveled(props: NodeProps) {
    const expanded = !!(props.data as { expanded?: boolean }).expanded;
    const look = useLook(props);
    const finished = useJustFinished(look);
    return (
      <div className={`lv-check is-${look}${finished ? ' just-finished' : ''}`}>
        {expanded ? (
          <div className="lv-full">
            <Full {...props} />
          </div>
        ) : (
          <div className="lv-openable">
            <Far {...props} />
          </div>
        )}
      </div>
    );
  };
}

// Bottom right: close every open card, or open them all when none are (for
// everyone), and Ask Settle.
export function CanvasCorner() {
  const expanded = useExpanded();
  const setExpanded = useSetExpanded();
  const { fitAll } = useFocus();
  return (
    <Panel position="bottom-right" className="lv-control">
      <div className="lv-row">
        {expanded.size > 0 ? (
          <button
            type="button"
            className="lv-close"
            onClick={() => {
              expanded.forEach(id => setExpanded(id, false));
              fitAll();
            }}
          >
            Close {expanded.size === 1 ? 'card' : `all ${expanded.size}`}
          </button>
        ) : (
          <button
            type="button"
            className="lv-close"
            onClick={() => {
              NODE_IDS.forEach(id => setExpanded(id, true));
              fitAll();
            }}
          >
            Open all
          </button>
        )}
        <AskSettle />
      </div>
    </Panel>
  );
}
