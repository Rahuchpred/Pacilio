import { useEffect, useMemo, useState } from "react";
import tokens from "./tokens/tokens.json";
import { Icon } from "./components";
import { INSTALL_PROMPT } from "./agent";
import { Brand, BRANDS, Page, PageDef, ThemeCtx } from "./doc";
import { INTRO } from "./pages/intro";
import { FOUNDATIONS } from "./pages/foundations";
import { ACTIONS, DISPLAY, INPUTS } from "./pages/library";

const PAGES: PageDef[] = [INTRO, ...FOUNDATIONS, ...ACTIONS, ...INPUTS, ...DISPLAY];
const GROUPS = ["Settle", "Foundations", "Actions", "Inputs", "Display"];
const pageFromHash = () => {
  const id = window.location.hash.replace(/^#\/?/, "").split("/")[0];
  return PAGES.find((p) => p.id === id) ?? INTRO;
};

export default function App() {
  const [page, setPage] = useState<PageDef>(pageFromHash);
  const [mode, setMode] = useState<"human" | "agent">("human");
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  const [copied, setCopied] = useState(false);
  const [active, setActive] = useState("");
  const [brand, setBrand] = useState<Brand>(() => {
    try {
      const saved = localStorage.getItem("settle-brand") as Brand | null;
      return saved && BRANDS.includes(saved) ? saved : "navy";
    } catch {
      return "navy";
    }
  });
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);

  useEffect(() => {
    const onHash = () => {
      setPage(pageFromHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => setSystemDark(mq.matches);
    mq.addEventListener("change", onScheme);
    return () => {
      window.removeEventListener("hashchange", onHash);
      mq.removeEventListener("change", onScheme);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.brand = brand;
    try {
      localStorage.setItem("settle-brand", brand);
    } catch {
      /* private window */
    }
  }, [brand]);

  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
  }, [theme]);

  useEffect(() => {
    document.title = page.id === "introduction" ? "Settle Design System" : `${page.title} · Settle Design System`;
    const els = Array.from(document.querySelectorAll<HTMLElement>(".doc-section"));
    setActive(els[0]?.id ?? "");
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "-15% 0px -70% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [page, mode]);

  const dark = theme ? theme === "dark" : systemDark;
  const ctx = useMemo(() => ({ brand, dark, mode }), [brand, dark, mode]);
  const b = tokens.brands[brand] as { label: string; font: string; fontSource?: string; source?: string };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  const nextBrand = () => setBrand(BRANDS[(BRANDS.indexOf(brand) + 1) % BRANDS.length]);

  return (
    <ThemeCtx.Provider value={ctx}>
      <div className="shell">
        <nav className="side" aria-label="Design system">
          {GROUPS.map((g) => (
            <div className="side-group" key={g}>
              <p className="side-heading">{g}</p>
              {PAGES.filter((p) => p.group === g).map((p) => (
                <a key={p.id} href={`#/${p.id}`} className={`side-link${page.id === p.id ? " is-active" : ""}`} aria-current={page.id === p.id ? "page" : undefined}>
                  {p.id === "introduction" ? "Introduction" : p.title}
                </a>
              ))}
            </div>
          ))}
        </nav>

        <main className="content">
          <label className="mobile-nav">
            <span className="field-label">Page</span>
            <select value={page.id} onChange={(e) => (window.location.hash = `#/${e.target.value}`)}>
              {GROUPS.map((g) => (
                <optgroup key={g} label={g}>
                  {PAGES.filter((p) => p.group === g).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id === "introduction" ? "Introduction" : p.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <p className="theme-note">
            Theme: {b.label}. {b.fontSource ? `Values from ${b.label === "Zuzu" ? "whop" : b.label.toLowerCase()}.com; ${b.fontSource} stands in as ${b.font}.` : `${b.source}.`}
          </p>
          <Page page={page} />
        </main>

        <aside className="rail" aria-label="On this page">
          {mode === "human" && page.sections.length > 1 && (
            <div className="rail-block">
              <p className="rail-heading">On this page</p>
              {page.sections.map((s) => (
                <a
                  key={s.id}
                  href={`#/${page.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(s.id)?.scrollIntoView();
                  }}
                  className={`rail-link${active === s.id ? " is-active" : ""}`}
                >
                  {s.title}
                </a>
              ))}
            </div>
          )}
          <div className="rail-block">
            <p className="rail-heading">Theme</p>
            <div className="brand-switch" role="group" aria-label="Theme">
              {BRANDS.map((k) => (
                <button key={k} type="button" aria-pressed={brand === k} onClick={() => setBrand(k)}>
                  {tokens.brands[k].label}
                </button>
              ))}
            </div>
          </div>
          <div className="rail-block">
            <p className="rail-heading">Install</p>
            <p className="rail-note">For your coding agent</p>
            <button type="button" className="rail-button" onClick={copyPrompt}>
              <Icon name={copied ? "check" : "download"} />
              {copied ? "Copied" : "Copy prompt"}
            </button>
          </div>
          <div className="rail-block">
            <p className="rail-heading">Source</p>
            <a className="rail-link" href="https://github.com/Rahuchpred/cal-hacks" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a className="rail-link" href="https://www.figma.com/design/j5FmqSGsD6uUaGOeOq06GP" target="_blank" rel="noreferrer">
              Figma file
            </a>
          </div>
          <div className="rail-block">
            <p className="rail-heading">Made at</p>
            <p className="rail-note">Cal Hacks 13.0</p>
          </div>
        </aside>

        <div className="toolbar" role="toolbar" aria-label="View">
          <button type="button" className={`tool${mode === "human" ? " is-on" : ""}`} onClick={() => setMode("human")} aria-pressed={mode === "human"}>
            Human
          </button>
          <button type="button" className={`tool${mode === "agent" ? " is-on" : ""}`} onClick={() => setMode("agent")} aria-pressed={mode === "agent"}>
            Agent
          </button>
          <span className="tool-sep" />
          <button type="button" className="tool" onClick={nextBrand} aria-label={`Theme ${b.label}, switch to the next theme`}>
            {b.label}
          </button>
          <button type="button" className="tool" onClick={() => setTheme(dark ? "light" : "dark")} aria-label={dark ? "Switch to light" : "Switch to dark"}>
            <Icon name="sun" />
          </button>
          <span className="tool-sep" />
          <button type="button" className="tool" onClick={copyPrompt}>
            <Icon name={copied ? "check" : "download"} /> {copied ? "Copied" : "Install"}
          </button>
        </div>
      </div>
    </ThemeCtx.Provider>
  );
}
