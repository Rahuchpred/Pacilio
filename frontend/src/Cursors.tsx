import { ViewportPortal, useViewport } from '@xyflow/react';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables } from './module_bindings';

// Other users' cursors, rendered in flow coordinates so they line up with the
// nodes regardless of each person's pan/zoom.
export function Cursors() {
  const { identity } = useSpacetimeDB();
  const [cursors] = useTable(tables.cursor);
  const [users] = useTable(tables.user);
  const { zoom } = useViewport();

  return (
    <ViewportPortal>
      {cursors.map(cursor => {
        if (identity && cursor.identity.isEqual(identity)) return null;
        const user = users.find(u => u.identity.isEqual(cursor.identity));
        if (!user) return null;

        return (
          <div
            key={cursor.identity.toHexString()}
            className="cursor"
            style={{
              // Counter-scale so cursors stay the same size at any zoom
              transform: `translate(${cursor.x}px, ${cursor.y}px) scale(${1 / zoom})`,
              color: user.color,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path
                d="M2 2 L16 8 L9.5 9.5 L8 16 Z"
                fill="currentColor"
                stroke="white"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            <span className="cursor-label" style={{ background: user.color }}>
              {user.name}
            </span>
          </div>
        );
      })}
    </ViewportPortal>
  );
}
