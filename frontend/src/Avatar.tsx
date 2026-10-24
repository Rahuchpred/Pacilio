import type { User } from './module_bindings/types';

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
        background: user.color,
      }}
    >
      {user.name.charAt(0).toUpperCase()}
      {tooltip && <span className="tooltip">{user.name}</span>}
    </span>
  );
}
