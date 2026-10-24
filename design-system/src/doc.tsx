import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import tokens from "./tokens/tokens.json";

export type Brand = "navy" | "ramp" | "stripe" | "mercury";
export const BRANDS = Object.keys(tokens.brands) as Brand[];
export const ThemeCtx = createContext<{ brand: Brand; dark: boolean; mode: "human" | "agent"; orange: boolean }>({ brand: "navy", dark: false, mode: "human", orange: false });
export const useTheme = () => useContext(ThemeCtx);

export type SectionDef = { id: string; title: string; body: ReactNode };
export type PageDef = { id: string; group: string; title: string; lede: string; agent: string; sections: SectionDef[] };

/* One page: title, lede, then sections. In agent mode the page shows the rules a coding agent follows. */
export function Page({ page }: { page: PageDef }) {
  const { mode } = useTheme();
  return (
    <article className="page" aria-labelledby="page-title">
      <header className="page-head">
        <h1 id="page-title" className="page-title">
          {page.title}
        </h1>
        <p className="page-lede">{page.lede}</p>
      </header>
      {mode === "agent" ? (
        <pre className="agent-note">
          <code>{page.agent}</code>
        </pre>
      ) : (
        page.sections.map((s) => (
          <section key={s.id} id={s.id} className="doc-section" aria-labelledby={`${s.id}-title`}>
            <h2 id={`${s.id}-title`} className="section-title">
              {s.title}
            </h2>
            {s.body}
          </section>
        ))
      )}
    </article>
  );
}

export function Preview({ children, wide, plain }: { children: ReactNode; wide?: boolean; plain?: boolean }) {
  return (
    <div className={`preview${plain ? " preview-plain" : ""}`}>
      <div className={`stage${wide ? " stage-wide" : ""}`}>{children}</div>
    </div>
  );
}

export function Table({ head, rows, code = [] }: { head: string[]; rows: ReactNode[][]; code?: number[] }) {
  return (
    <div className="table-wrap">
      <table className="doc-table">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{code.includes(j) && typeof c === "string" ? <code>{c}</code> : c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TokenList({ items }: { items: [string, string][] }) {
  return (
    <div className="token-list">
      <p className="token-count">{items.length} tokens</p>
      <dl>
        {items.map(([k, v]) => (
          <div key={k}>
            <dt>
              <code>{k}</code>
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* A row per color: a chip painted with the live variable, the role, and what it is for. */
export function SwatchRows({ items }: { items: [string, string][] }) {
  return (
    <ul className="swatch-rows">
      {items.map(([token, use]) => (
        <li key={token}>
          <span className="swatch-chip" style={{ background: `var(--color-${token.replace(/\//g, "-")})` }} />
          <span className="swatch-name">{token}</span>
          <span className="swatch-use">{use}</span>
        </li>
      ))}
    </ul>
  );
}

/* Reads a live CSS variable, so tables follow the selected theme. */
export function useCssVar(name: string) {
  const { brand, dark } = useTheme();
  const [v, setV] = useState("");
  useEffect(() => {
    const id = requestAnimationFrame(() => setV(getComputedStyle(document.documentElement).getPropertyValue(name).trim()));
    return () => cancelAnimationFrame(id);
  }, [name, brand, dark]);
  return v;
}

export function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const h = hex.replace("#", "");
    if (h.length < 6) return 0;
    const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/* Resolves a color token to hex for a brand and mode, from tokens.json. */
export function tokenHex(brand: Brand, mode: "light" | "dark", key: string, orange = false) {
  const acc = orange ? (tokens.accents.orange[mode] as Record<string, string>)[key] : undefined;
  if (acc) return acc;
  const b = tokens.brands[brand] as Record<string, unknown>;
  const own = (b[mode] as Record<string, string> | undefined)?.[key];
  if (own) return own;
  const ref = (tokens.color as Record<string, { light: string; dark: string }>)[key]?.[mode];
  if (!ref) return "";
  if (ref.startsWith("#")) return ref;
  const [g, s] = ref.split(".");
  return (tokens.primitives as Record<string, Record<string, string>>)[g][s];
}
