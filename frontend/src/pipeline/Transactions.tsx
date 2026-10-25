import type { NodeProps } from '@xyflow/react';
import { Button, Money, Status, type IconName } from '../../../design-system/src/components';
import { FarCard, Handles, type CardLevels, type Look } from '../canvas/levels';
import { ROW_STATUS, SOURCE_TITLES, dollars, kindLabel, openItem, useTransactions, type Row, type RowState } from './live';

// The transactions around the main agent: what it is checking right now, what
// waits for its next run, and what it just finished. Each card turns orange
// while checked, then green when posted or red when it needs you. Open, it
// shows the details and links to the item panel.

const SOURCE_ICON: Record<string, IconName> = { nessie: 'bank', stripe: 'ticket', ledger: 'doc', cord: 'DocumentBlank' };

const LOOK: Record<RowState, Look> = {
  waiting: 'idle',
  checking: 'working',
  posted: 'done',
  refunded: 'done',
  voided: 'done',
  following_up: 'done',
  review: 'issue',
};

function useSlot(props: NodeProps): Row | undefined {
  const slot = Number(props.id.split('-')[1]);
  return useTransactions()[slot];
}

function Empty() {
  return (
    <div className="pnode w-txn txn-empty">
      <span className="muted small">Waiting for events</span>
      <Handles type="txn" />
    </div>
  );
}

function Far(props: NodeProps) {
  const row = useSlot(props);
  if (!row) return <Empty />;
  const look = LOOK[row.state];
  return (
    <FarCard
      type="txn"
      width="w-txn"
      icon={SOURCE_ICON[row.event.source] ?? 'doc'}
      word={row.event.counterparty}
      big={<Money value={dollars(row.event.amountMinor, row.event.currency)} cents={false} />}
      line={ROW_STATUS[row.state].label}
      craft={look === 'working' ? 'decide' : look === 'issue' ? 'reject' : undefined}
    />
  );
}

function Full(props: NodeProps) {
  const row = useSlot(props);
  if (!row) return <Empty />;
  const s = ROW_STATUS[row.state];
  return (
    <div className="pnode w-txn-full">
      <div className="txn-top">
        <span className="strong txn-party">{row.event.counterparty}</span>
        <Status kind={s.kind}>{s.label}</Status>
      </div>
      <div className="txn-amount">
        <Money value={dollars(row.event.amountMinor, row.event.currency)} />
      </div>
      <span className="muted small">
        {SOURCE_TITLES[row.event.source] ?? row.event.source} · {kindLabel(row.event.kind)}
      </span>
      <p className="small">{row.event.description}</p>
      {row.review?.note && <p className="small muted">{row.review.note}</p>}
      <div className="nodrag">
        <Button kind="secondary" size="sm" icon="search" onClick={() => openItem(row.event.id)}>
          Look closer
        </Button>
      </div>
      <Handles type="txn" />
    </div>
  );
}

export const transaction: CardLevels = {
  far: Far,
  full: Full,
  useLook: props => {
    const row = useSlot(props);
    return row ? LOOK[row.state] : 'idle';
  },
};
