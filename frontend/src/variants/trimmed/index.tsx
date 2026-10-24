import type { Variant } from '../types';
import { edgeTypes } from './edge';
import { DetailFilter, nodeTypes } from './levels';
import '../../pipeline/pipeline.css';
import './trimmed.css';

// The first canvas with less text and the same key facts, to compare side by side.
const trimmed: Variant = {
  id: 'trimmed',
  order: 2,
  name: 'Detailed cards, less text',
  blurb: 'Zoomed out: one number per card. Normal: one line per thing. Zoomed in: every row, like version 1.',
  nodeTypes,
  className: 'v-trimmed',
  overlay: DetailFilter,
  edgeTypes,
  // Only the lines that need words keep them: the question and its answer.
  labels: {
    'e-inbox-main': null,
    'e-main-sub-duplicate': null,
    'e-main-ledger': null,
    'e-ledger-follow': null,
  },
  // Spaced for the widest level (version 1's full cards when zoomed in).
  layout: {
    inbox: { x: 0, y: 30 },
    main: { x: 380, y: 0 },
    flagged: { x: 380, y: -580 },
    'sub-duplicate': { x: 380, y: 500 },
    'sub-coding': { x: 710, y: 500 },
    'sub-amount': { x: 1040, y: 500 },
    ledger: { x: 900, y: 20 },
    followups: { x: 1480, y: 20 },
    summary: { x: 1900, y: 10 },
  },

};

export default trimmed;
