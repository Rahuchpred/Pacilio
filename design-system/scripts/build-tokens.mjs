// Turns src/tokens/tokens.json into src/tokens/tokens.css.
// Run: node scripts/build-tokens.mjs
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../src/tokens/", import.meta.url);
const t = JSON.parse(readFileSync(new URL("tokens.json", root), "utf8"));

const ref = (path) => {
  const [group, step] = path.split(".");
  return t.primitives[group][step];
};
const name = (key) => key.replace(/\//g, "-");

const light = [];
const dark = [];
for (const [key, modes] of Object.entries(t.color)) {
  light.push(`  --color-${name(key)}: ${ref(modes.light)};`);
  dark.push(`  --color-${name(key)}: ${ref(modes.dark)};`);
}

const scalar = [];
for (const [k, v] of Object.entries(t.space)) scalar.push(`  --space-${k}: ${v}px;`);
for (const [k, v] of Object.entries(t.radius)) scalar.push(`  --radius-${k}: ${v}px;`);
for (const [k, v] of Object.entries(t.type)) {
  scalar.push(`  --type-${k}-size: ${v.size}px;`);
  scalar.push(`  --type-${k}-line: ${v.line}px;`);
  scalar.push(`  --type-${k}-weight: ${v.weight};`);
  scalar.push(`  --type-${k}-tracking: ${v.tracking}em;`);
}
scalar.push(`  --font-sans: "${t.font.sans}", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;`);
scalar.push(`  --font-mono: "${t.font.mono}", ui-monospace, "SF Mono", Menlo, monospace;`);
scalar.push(`  --border-hairline: ${t.border.hairline}px;`);
scalar.push(`  --border-focus: ${t.border.focus}px;`);
scalar.push(`  --elevation-overlay: ${t.elevation.overlay};`);
for (const k of ["fast", "base", "slow"]) scalar.push(`  --motion-${k}: ${t.motion[k]}ms;`);
scalar.push(`  --motion-ease: ${t.motion.ease};`);

const css = `/* Generated from tokens.json by scripts/build-tokens.mjs. Do not edit by hand. */
:root {
${scalar.join("\n")}
${light.join("\n")}
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${dark.map((l) => "  " + l).join("\n")}
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
${dark.join("\n")}
  color-scheme: dark;
}
`;
writeFileSync(new URL("tokens.css", root), css);
console.log(`tokens.css: ${Object.keys(t.color).length} colors, ${scalar.length} scalars`);
