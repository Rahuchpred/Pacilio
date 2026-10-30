import { schema, table, t, SenderError } from 'spacetimedb/server';
import { droidEnv, droidTables } from './droid/tables';
import { droidAgents } from './droid/agents';
import { inboundEnv, inboundTables } from './inbound/tables';
import { inbound } from './inbound/inbound';
import { accountingTables } from './accounting/tables';
import { accounting } from './accounting/accounting';
import { pipelineTables } from './pipeline/tables';
import { pipeline } from './pipeline/pipeline';
import { emailTables } from './email/tables';
import { email, ensureFollowUpDefaults } from './email/email';
import { settleTables } from './settle/tables';
import { classifyTables } from './classify/tables';
import { learnTables } from './learn/tables';
import { learn } from './learn/learn';
import { books } from './books/books';
import { classify, ensureClassificationDefaults } from './classify/classify';
import { settle } from './settle/messages';

// One row per identity that has ever connected. `color` drives avatar + cursor color.
const user = table(
  { name: 'user', public: true },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    color: t.string(),
    online: t.bool(),
  }
);

// Live cursor positions in flow coordinates, removed on disconnect.
const cursor = table(
  { name: 'cursor', public: true },
  {
    identity: t.identity().primaryKey(),
    x: t.f64(),
    y: t.f64(),
  }
);

const node = table(
  { name: 'node', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    x: t.f64(),
    y: t.f64(),
    label: t.string(),
  }
);

const edge = table(
  { name: 'edge', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    source: t.u64(),
    target: t.u64(),
  }
);

const spacetimedb = schema(
  { user, cursor, node, edge, ...droidTables, ...inboundTables, ...accountingTables, ...pipelineTables, ...emailTables, ...settleTables, ...classifyTables, ...learnTables },
  { env: { ...droidEnv, ...inboundEnv } }
);
export default spacetimedb;

// ─── Inbound finance sources ────────────────────────────────────────────────

export const {
  setInboundSource,
  configureInboundSource,
  resetInboundSource,
  movePipelineNode,
  resizePipelineNode,
  setPipelineCardExpanded,
  tidyPipelineLayout,
  runInbound,
  pauseInbound,
  restartInbound,
  setScenario,
  inboundTick,
} = inbound(spacetimedb);

// ─── Mock accounting system (stand-in for QuickBooks) ───────────────────────

export const { createBill, createInvoice, recordPayment } = accounting(spacetimedb);

// ─── Bookkeeper (Droid on the Factory computer) ─────────────────────────────

export const { pipelineTick, resolveReviewItem, ledgerXlsxUrl, requestLedgerRender, requestReport, reportXlsxUrl } =
  pipeline(spacetimedb);

// ─── Email follow-ups (AgentMail) ───────────────────────────────────────────

export const {
  emailTick,
  sendEmailReply,
  markEmailThreadRead,
  closeEmailThread,
  reopenEmailThread,
  setEmailFollowUps,
  resetEmailFollowUps,
} = email(spacetimedb);

// ─── Droid agents (Factory cloud) ───────────────────────────────────────────

export const {
  requestAgentTask,
  steerAgentTask,
  cancelAgentTask,
  agentFileUrl,
  agentTick,
} = droidAgents(spacetimedb);

// ─── Names ──────────────────────────────────────────────────────────────────

// The color word in a generated name matches the user's cursor color.
const COLORS: Record<string, string> = {
  yellow: '#eab308',
  blue: '#3b82f6',
  green: '#22c55e',
  purple: '#a855f7',
  orange: '#f97316',
  pink: '#ec4899',
  red: '#ef4444',
  teal: '#14b8a6',
};

const ANIMALS = [
  'koala', 'otter', 'panda', 'fox', 'tiger', 'penguin', 'owl', 'llama',
  'sloth', 'whale', 'gecko', 'bunny', 'moose', 'hedgehog', 'falcon', 'yak',
];

const MAX_NAME_LENGTH = 24;

function validateName(raw: string): string {
  const name = raw.trim();
  if (!name) throw new SenderError('Name must not be empty');
  if (name.length > MAX_NAME_LENGTH) {
    throw new SenderError(`Name must be at most ${MAX_NAME_LENGTH} characters`);
  }
  return name;
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────

export const onConnect = spacetimedb.clientConnected(ctx => {
  ensureFollowUpDefaults(ctx);
  ensureClassificationDefaults(ctx);
  const existing = ctx.db.user.identity.find(ctx.sender);
  if (existing) {
    ctx.db.user.identity.update({ ...existing, online: true });
    return;
  }

  const colorWords = Object.keys(COLORS);
  const colorWord = colorWords[ctx.random.integerInRange(0, colorWords.length - 1)];
  const animal = ANIMALS[ctx.random.integerInRange(0, ANIMALS.length - 1)];
  const digit = ctx.random.integerInRange(0, 9);

  ctx.db.user.insert({
    identity: ctx.sender,
    name: `${colorWord}${animal}${digit}`,
    color: COLORS[colorWord],
    online: true,
  });
});

export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
  const existing = ctx.db.user.identity.find(ctx.sender);
  if (existing) {
    ctx.db.user.identity.update({ ...existing, online: false });
  }
  ctx.db.cursor.identity.delete(ctx.sender);
});

// ─── Presence ───────────────────────────────────────────────────────────────

export const setName = spacetimedb.reducer(
  { name: t.string() },
  (ctx, { name }) => {
    const existing = ctx.db.user.identity.find(ctx.sender);
    if (!existing) throw new SenderError('Unknown user');
    ctx.db.user.identity.update({ ...existing, name: validateName(name) });
  }
);

export const moveCursor = spacetimedb.reducer(
  { x: t.f64(), y: t.f64() },
  (ctx, { x, y }) => {
    if (ctx.db.cursor.identity.find(ctx.sender)) {
      ctx.db.cursor.identity.update({ identity: ctx.sender, x, y });
    } else {
      ctx.db.cursor.insert({ identity: ctx.sender, x, y });
    }
  }
);

// ─── Graph ──────────────────────────────────────────────────────────────────

export const addNode = spacetimedb.reducer(
  { x: t.f64(), y: t.f64() },
  (ctx, { x, y }) => {
    ctx.db.node.insert({ id: 0n, x, y, label: 'New node' });
  }
);

export const moveNode = spacetimedb.reducer(
  { id: t.u64(), x: t.f64(), y: t.f64() },
  (ctx, { id, x, y }) => {
    const existing = ctx.db.node.id.find(id);
    if (!existing) return; // node was deleted mid-drag by someone else
    ctx.db.node.id.update({ ...existing, x, y });
  }
);

export const renameNode = spacetimedb.reducer(
  { id: t.u64(), label: t.string() },
  (ctx, { id, label }) => {
    const existing = ctx.db.node.id.find(id);
    if (!existing) throw new SenderError('Node not found');
    ctx.db.node.id.update({ ...existing, label: label.trim() || 'Untitled' });
  }
);

export const deleteNode = spacetimedb.reducer(
  { id: t.u64() },
  (ctx, { id }) => {
    ctx.db.node.id.delete(id);
    for (const e of ctx.db.edge.iter()) {
      if (e.source === id || e.target === id) ctx.db.edge.id.delete(e.id);
    }
  }
);

export const addEdge = spacetimedb.reducer(
  { source: t.u64(), target: t.u64() },
  (ctx, { source, target }) => {
    if (source === target) return;
    if (!ctx.db.node.id.find(source) || !ctx.db.node.id.find(target)) {
      throw new SenderError('Node not found');
    }
    for (const e of ctx.db.edge.iter()) {
      if (e.source === source && e.target === target) return;
    }
    ctx.db.edge.insert({ id: 0n, source, target });
  }
);

export const deleteEdge = spacetimedb.reducer(
  { id: t.u64() },
  (ctx, { id }) => {
    ctx.db.edge.id.delete(id);
  }
);

// ─── Ask Pacioli: messages to the agents ─────────────────────────────────────

export const { cancelAgentMessage } = settle(spacetimedb);

// ─── Classification settings ────────────────────────────────────────────────

export const { setClassificationMode, setClassifications, resetClassifications } = classify(spacetimedb);

// ─── Audit log & patterns ───────────────────────────────────────────────────

export const { editPattern, deletePattern, addPattern } = learn(spacetimedb);

// ─── QuickBooks: who owes whom ──────────────────────────────────────────────

export const { remindInvoice } = books(spacetimedb);
