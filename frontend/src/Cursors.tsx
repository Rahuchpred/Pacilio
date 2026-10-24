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
        if (!user?.online) return null;

        return (
          <div
            key={cursor.identity.toHexString()}
            className="cursor"
            style={{
              // Counter-scale so cursors stay the same size at any zoom
              transform: `translate(${cursor.x}px, ${cursor.y}px) scale(${1 / zoom})`,
            }}
          >
            <svg className="cursor-arrow" width="24" height="26" viewBox="0 0 24 26">
              <path
                d="M3 2.5 L20.5 11.2 Q21.6 11.8 20.4 12.3 L12.8 14.6 L9.4 22 Q8.9 23.1 8.4 22 Z"
                fill={user.color}
                stroke="white"
                strokeWidth="2"
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
