import type { User } from './module_bindings/types';
import { presenceClass } from './presence';

type Props = {
  user: User;
  size?: number;
  // Show the name in a hover tooltip below the avatar
  tooltip?: boolean;
};

export function Avatar({ user, size = 32, tooltip = false }: Props) {
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
      }}
    >
      {user.name.charAt(0).toUpperCase()}
      {/* Ink avatar; the person's color stays as a small dot that matches their cursor. */}
      <span className={`avatar-dot ${presenceClass(user)}`} />
      {tooltip && <span className="tooltip">{user.name}</span>}
    </span>
  );
}
