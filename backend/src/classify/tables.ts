import { table, t } from 'spacetimedb/server';

// The categories the Bookkeeper sorts money into. In "auto" mode the agent
// picks from this list and may add a new one when nothing fits; in "manual"
// mode it must use exactly one from the list, which people edit.
export const classification = table(
  { name: 'classification', public: true },
  {
    name: t.string().primaryKey(),
    // Order shown in the settings and given to the agent
    position: t.u32(),
  }
);

// Singleton (id 0): 'auto' | 'manual'
export const classificationMode = table(
  { name: 'classification_mode', public: true },
  {
    id: t.u32().primaryKey(),
    mode: t.string(),
  }
);

export const classifyTables = { classification, classificationMode };
