import type { User } from './module_bindings/types';

// A person's color on the canvas: their cursor, its name tag and the dot on
// their avatar. The backend hands out bright Tailwind colors (orange, green,
// red among them), which would read as decide, done or issue. This picks
// one of Pacioli's six muted presence colors instead, stable per person.

export const PRESENCE_COUNT = 6;

export function presenceClass(user: User): string {
  const hex = user.identity.toHexString();
  let h = 0;
  for (let i = 0; i < hex.length; i++) h = (h * 31 + hex.charCodeAt(i)) >>> 0;
  return `who-${h % PRESENCE_COUNT}`;
}
