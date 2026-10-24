import { createContext, useContext, useEffect, type ComponentType, type MouseEvent, type ReactNode } from 'react';
import { Handle, Panel, Position, type NodeProps } from '@xyflow/react';
import { Icon, Money, Status, type IconName, type StatusKind } from '../../../../design-system/src/components';
import * as Full from '../../pipeline/nodes';
import { followUps, inbox, ledger } from '../../pipeline/data';
import { getView as view, setLock, setOpen, useFocus, useShown, useView, type Lock } from './view';
import * as Short from './nodes';
import { AskSettle } from '../../ui/AskSettle';
import { useCheckLook, type CheckLook } from './checkState';

// The live look of the check a card belongs to, for the far level's crafted surface.
const CheckLookCtx = createContext<CheckLook | null>(null);
const CRAFT: Record<CheckLook['state'], string> = { idle: '', working: 'craft-surface', done: 'craft-surface is-accept', issue: 'craft-surface is-reject' };

// Zoom from variant 5 on top of the short cards. Far: one word and one big
// number per card, readable from across the table. Middle: the short cards.
// Near: variant 1's full cards, every row and source.

type H = { type: 'source' | 'target'; position: Position; id?: string; left?: string };

const HANDLES: Record<string, H[]> = {
  inbox: [{ type: 'source', position: Position.Right }],
  main: [
    { type: 'target', position: Position.Left, id: 'in' },
    { type: 'source', position: Position.Right, id: 'out' },
    { type: 'source', position: Position.Top, id: 'flag' },
    { type: 'source', position: Position.Bottom, id: 'delegate', left: '44%' },
    { type: 'target', position: Position.Bottom, id: 'report', left: '56%' },
  ],
  subagent: [
    { type: 'target', position: Position.Top, id: 'delegate', left: '44%' },
    { type: 'source', position: Position.Top, id: 'report', left: '56%' },
  ],
  flagged: [
    { type: 'target', position: Position.Bottom, id: 'in' },
    { type: 'source', position: Position.Right, id: 'out' },
  ],
  ledger: [
    { type: 'target', position: Position.Left, id: 'in' },
    { type: 'target', position: Position.Top, id: 'answer' },
    { type: 'source', position: Position.Right, id: 'out' },
  ],
  followup: [
    { type: 'target', position: Position.Left, id: 'in' },
    { type: 'source', position: Position.Right, id: 'out' },
  ],
  summary: [{ type: 'target', position: Position.Left, id: 'in' }],
};

type FarView = { icon: IconName; word: string; big: ReactNode; line?: ReactNode; width: string; ask?: boolean };

const SUBS: Record<string, { word: string; status: StatusKind; label: string }> = {
  'sub-duplicate': { word: 'Duplicate check', status: 'cleared', label: 'Fixed' },
  'sub-coding': { word: 'Coding check', status: 'agent', label: 'Sent back' },
  'sub-amount': { word: 'Amount check', status: 'held', label: 'Over PO' },
};

const ledgerTotal = ledger.reduce((t, r) => t + r.amount, 0);

const FAR: Record<string, (props: NodeProps) => FarView> = {
  inbox: () => ({ icon: 'mail', word: 'Inbox', big: `${inbox.length}`, line: 'invoices since 9:00 am', width: 'w-inbox' }),
  main: () => ({ icon: 'agent', word: 'Main agent', big: '5 steps', line: <Status kind="agent">Running</Status>, width: 'w-main' }),
  flagged: () => ({
    icon: 'hourglass',
    word: 'Needs you',
    big: <Money value={480} />,
    line: 'over PO 4410 on Halcyon',
    width: 'w-flag',
    ask: true,
  }),
  subagent: ({ data }) => {
    const s = SUBS[data.subId as string];
    return { icon: 'agent', word: s.word, big: <LiveStatus subId={data.subId as string} />, width: 'w-sub' };
  },
  ledger: () => ({ icon: 'bank', word: 'Ledger', big: <Money value={ledgerTotal} />, line: '1 line held for you', width: 'w-ledger' }),
  followup: () => {
    const drafts = followUps.filter(f => f.statusLabel === 'Draft').length;
    return { icon: 'mail', word: 'Emails', big: `${followUps.length}`, line: `${followUps.length - drafts} sent, ${drafts} draft`, width: 'w-follow' };
  },
  summary: () => ({ icon: 'doc', word: 'Today', big: '3 of 4', line: 'invoices done', width: 'w-summary' }),
};

function LiveStatus({ subId }: { subId: string }) {
  const look = useCheckLook(subId);
  return <Status kind={look.kind}>{look.label}</Status>;
}

function FarCard({ type, props }: { type: string; props: NodeProps }) {
  const v = FAR[type](props);
  const look = useContext(CheckLookCtx);
  // From afar the brand reads through its material: the question and any
  // agent with something to say wear the crafted surface.
  const craft = v.ask ? 'craft-surface' : look ? CRAFT[look.state] : '';
  return (
    <div className={`pnode far-card ${v.width}${v.ask ? ' is-ask' : ''}${craft ? ' ' + craft : ''}`}>
      <div className="far-word">
        <Icon name={v.icon} />
        <span>{v.word}</span>
      </div>
      <div className="far-big">{v.big}</div>
      {v.line && <div className="far-line">{v.line}</div>}
      {HANDLES[type].map((h, i) => (
        <Handle key={i} type={h.type} position={h.position} id={h.id} isConnectable={false} style={h.left ? { left: h.left } : undefined} />
      ))}
    </div>
  );
}

// Clicking a card that isn't in full opens it in full and centres it.
// Clicks on buttons, links and toggles inside the card do their own thing.
function leveled(type: string, short: ComponentType<NodeProps>, full: ComponentType<NodeProps>) {
  const Short = short;
  const Full = full;
  return function Leveled(props: NodeProps) {
    const level = useShown(props.id);
    const { openCard } = useFocus();
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('button, a, summary, input')) return;
      openCard(props.id);
    };
    if (level === 'near') return <Full {...props} />;
    return (
      <div className={level === 'mid' ? 'lv-short lv-openable' : 'lv-openable'} onClick={onClick}>
        {level === 'mid' ? <Short {...props} /> : <FarCard type={type} props={props} />}
      </div>
    );
  };
}

// Check agents carry their live state on a wrapper, so every level (far,
// short, full) turns orange while working, then green or red.
function leveledCheck(short: ComponentType<NodeProps>, full: ComponentType<NodeProps>) {
  const Inner = leveled('subagent', short, full);
  return function LeveledCheck(props: NodeProps) {
    const look = useCheckLook(props.data.subId as string);
    return (
      <div className={`lv-check is-${look.state}`}>
        <CheckLookCtx.Provider value={look}>
          <Inner {...props} />
        </CheckLookCtx.Provider>
      </div>
    );
  };
}

export const nodeTypes = {
  inbox: leveled('inbox', Short.InboxNode, Full.InboxNode),
  main: leveled('main', Short.MainAgentNode, Full.MainAgentNode),
  subagent: leveledCheck(Short.SubagentNode, Full.SubagentNode),
  flagged: leveled('flagged', Short.FlaggedNode, Full.FlaggedNode),
  ledger: leveled('ledger', Short.LedgerNode, Full.LedgerNode),
  followup: leveled('followup', Short.FollowUpNode, Full.FollowUpNode),
  summary: leveled('summary', Short.SummaryNode, Full.SummaryNode),
};

const LOCKS: { id: Lock; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto', hint: 'Follows the zoom' },
  { id: 'far', label: 'Overview', hint: 'One number per card' },
  { id: 'mid', label: 'Cards', hint: 'One line per thing' },
  { id: 'near', label: 'Full detail', hint: 'Every row, at any zoom' },
];

// Bottom right: how much every card shows. Auto follows the zoom; the others
// hold that level at any zoom, so someone who wants every detail can have it
// with the whole canvas in view. Esc or a click on empty canvas closes an
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
