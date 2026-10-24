// Turns src/tokens/tokens.json into src/tokens/tokens.css.
// Run: node scripts/build-tokens.mjs
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../src/tokens/", import.meta.url);
const t = JSON.parse(readFileSync(new URL("tokens.json", root), "utf8"));

const ref = (path) => {
  if (path.startsWith("#")) return path;
  const [group, step] = path.split(".");
  return t.primitives[group][step];
};
const cssName = (key) => `--color-${key.replace(/\//g, "-")}`;
const colorLines = (mode, brand) =>
  Object.entries(t.color).map(([k, modes]) => {
    const own = brand && t.brands[brand][mode] && t.brands[brand][mode][k];
    return `  ${cssName(k)}: ${own ? own : ref(modes[mode])};`;
  });
const fontStack = (family) => `"${family}", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
const brandScalars = (b) => [
  `  --font-sans: ${fontStack(t.brands[b].font)};`,
  `  --type-title-weight: ${t.brands[b].headingWeight};`,
  `  --type-display-weight: ${t.brands[b].headingWeight};`,
  `  --radius-control: ${t.brands[b].radiusControl}px;`,
  `  --radius-panel: ${t.brands[b].radiusPanel}px;`,
];

const scalar = [];
for (const [k, v] of Object.entries(t.space)) scalar.push(`  --space-${k}: ${v}px;`);
for (const [k, v] of Object.entries(t.radius)) scalar.push(`  --radius-${k}: ${v}px;`);
for (const [k, v] of Object.entries(t.type)) {
  scalar.push(`  --type-${k}-size: ${v.size}px;`);
  scalar.push(`  --type-${k}-line: ${v.line}px;`);
  scalar.push(`  --type-${k}-weight: ${v.weight};`);
  scalar.push(`  --type-${k}-tracking: ${v.tracking}em;`);
}
scalar.push(`  --font-mono: "${t.font.mono}", ui-monospace, "SF Mono", Menlo, monospace;`);
scalar.push(`  --mono-scale: ${t.font.monoScale};`);
scalar.push(`  --border-hairline: ${t.border.hairline}px;`);
scalar.push(`  --border-focus: ${t.border.focus}px;`);
for (const k of ["fast", "base", "slow"]) scalar.push(`  --motion-${k}: ${t.motion[k]}ms;`);
scalar.push(`  --motion-ease: ${t.motion.ease};`);

const blocks = [];
for (const b of Object.keys(t.brands)) {
  const sel = b === "settle" ? `:root, :root[data-brand="settle"]` : `:root[data-brand="${b}"]`;
  const darkSel = b === "settle" ? `:root:not([data-theme="light"]):not([data-brand]), :root[data-brand="settle"]:not([data-theme="light"])` : `:root[data-brand="${b}"]:not([data-theme="light"])`;
  const forcedDark = b === "settle" ? `:root[data-theme="dark"]:not([data-brand]), :root[data-brand="settle"][data-theme="dark"]` : `:root[data-brand="${b}"][data-theme="dark"]`;
  const light = colorLines("light", b === "settle" ? null : b);
  const dark = colorLines("dark", b === "settle" ? null : b);
  blocks.push(`/* ${t.brands[b].label}${t.brands[b].fontSource ? `, ${t.brands[b].fontSource} stands in as ${t.brands[b].font}` : ""} */
${sel} {
${b === "settle" ? scalar.join("\n") + "\n" : ""}${brandScalars(b).join("\n")}
${light.join("\n")}
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  ${darkSel} {
${dark.map((l) => "  " + l).join("\n")}
    color-scheme: dark;
  }
}
${forcedDark} {
${dark.join("\n")}
  color-scheme: dark;
}`);
}

const css = `/* Generated from tokens.json by scripts/build-tokens.mjs. Do not edit by hand. */\n${blocks.join("\n\n")}\n`;
writeFileSync(new URL("tokens.css", root), css);
console.log(`tokens.css: ${Object.keys(t.color).length} colors x ${Object.keys(t.brands).length} brands x 2 modes`);
