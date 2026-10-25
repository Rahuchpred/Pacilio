import type { NodeProps } from '@xyflow/react';
import { Button, Icon, Money, Status, type IconName } from '../../../design-system/src/components';
import { sentence } from './text';
import { FarCard, Handles, type CardLevels, type Look } from '../canvas/levels';
import { ROW_STATUS, SOURCE_TITLES, dollars, kindLabel, openItem, useTransactions, type Row, type RowState } from './live';

// The transactions around the main agent: what it is checking right now, what
// waits for its next run, and what it just finished. Each card stays plain
// while checked, then turns green when posted or red when it needs you. Open, it
// shows the details and links to the item panel.

export const SOURCE_ICON: Record<string, IconName> = { nessie: 'bank', stripe: 'ticket', ledger: 'doc', cord: 'DocumentBlank' };

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
      word={sentence(row.event.counterparty)}
      big={<Money value={dollars(row.event.amountMinor, row.event.currency)} cents={false} />}
      line={
        ROW_STATUS[row.state].busy ? (
          <span className="far-busy">
            <span className="spinner" aria-hidden="true" />
            {ROW_STATUS[row.state].label}
          </span>
        ) : (
          ROW_STATUS[row.state].label
        )
      }
      craft={look === 'done' ? 'accept' : look === 'issue' ? 'reject' : undefined}
      className={`src-${row.event.source}`}
    />
  );
}

export { sentence };

export function SourceTag({ source, kind }: { source: string; kind?: string }) {
  return (
    <span className={`src-tag src-${source}`}>
      <Icon name={SOURCE_ICON[source] ?? 'doc'} />
      <span className="src-tag-text">
        {SOURCE_TITLES[source] ?? source}
        {kind && ` · ${kindLabel(kind)}`}
      </span>
    </span>
  );
}

// Open: where it came from and where it stands, who and what, the money on
// its own strip, the agent's note, then a way in.
function Full(props: NodeProps) {
  const row = useSlot(props);
  if (!row) return <Empty />;
  const s = ROW_STATUS[row.state];
  const amount = dollars(row.event.amountMinor, row.event.currency);
  return (
    <div className="pnode w-txn-full txn-card">
      <div className="txn-top">
        <SourceTag source={row.event.source} kind={row.event.kind} />
        <Status kind={s.kind} busy={s.busy}>{s.label}</Status>
      </div>
      <div className="txn-who">
        <span className="strong txn-party">{sentence(row.event.counterparty)}</span>
        {row.event.description && <span className="muted small">{sentence(row.event.description)}</span>}
      </div>
      <div className="txn-money">
        <span className="muted small">{amount < 0 ? 'Money out' : 'Money in'}</span>
        <span className="txn-amount">
          <Money value={amount} />
        </span>
      </div>
      {row.review?.note && (
        <p className="txn-note small">
          <Icon name="agent" size={14} /> {row.review.note}
        </p>
      )}
      <div className="nodrag">
        <Button kind="quiet" size="sm" icon="search" onClick={() => openItem(row.event.id)}>
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
