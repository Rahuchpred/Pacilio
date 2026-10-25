import { ReactNode, useState } from "react";
import { glaze, type GlazeName } from "./glaze-icons";

/* Icons: the Glaze set from design.how (Phosphor Regular). Settle's short
   names point at Glaze icons, so existing calls keep working; any Glaze name
   (Bot, Waiting, Success...) works too. */
const alias = {
  check: "Check",
  clock: "Time",
  alert: "Warning",
  agent: "Bot",
  rule: "Settings",
  person: "UserAvatar",
  doc: "Document",
  bank: "TableView",
  ticket: "DocumentBlank",
  mail: "Send",
  copy: "Copy",
  sun: "Light",
  download: "Download",
  search: "Search",
  close: "Close",
  plus: "Add",
  arrow: "ArrowRight",
  calendar: "Calendar",
  filter: "Filter",
  lock: "Locked",
  retry: "Retry",
  spinner: "Pending",
  hourglass: "Waiting",
  success: "Success",
  failed: "FailedMark",
  chevron: "ChevronRight",
  chevronDown: "ChevronDown",
  more: "More",
  undo: "Undo",
  sparkle: "Sparkle",
  info: "Information",
} as const satisfies Record<string, GlazeName>;

export type IconName = keyof typeof alias | GlazeName;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const key: GlazeName = name in alias ? alias[name as keyof typeof alias] : (name as GlazeName);
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" className="icon">
      {glaze[key].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/* Money: plain amounts with tabular figures and a true minus sign. Formatters
   are made once: creating one per amount is slow on screens with many. */
const WITH_CENTS = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const WHOLE = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
export function Money({ value, sign = false, cents = true }: { value: number; sign?: boolean; cents?: boolean }) {
  const prefix = value < 0 ? "\u2212" : sign ? "+" : "";
  const text = (cents ? WITH_CENTS : WHOLE).format(Math.abs(value));
  return (
    <span className="money">
      {prefix}${text}
    </span>
  );
}

type ButtonKind = "primary" | "secondary" | "decide" | "accept" | "reject" | "quiet";
export function Button({
  kind = "secondary",
  children,
  icon,
  onClick,
  size = "md",
  disabled = false,
  held = false,
  pending = false,
}: {
  kind?: ButtonKind;
  children?: ReactNode;
  icon?: IconName;
  onClick?: () => void;
  size?: "sm" | "md";
  disabled?: boolean;
  held?: boolean;
  pending?: boolean;
}) {
  // Accept and reject always say which way they go, so a glance is enough.
  const glyph = icon ?? (kind === "accept" ? "Check" : kind === "reject" ? "Close" : undefined);
  return (
    <button
      type="button"
      className={`btn btn-${kind} btn-${size}${held ? " is-held" : ""}${children ? "" : " btn-icon"}`}
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled || undefined}
      aria-busy={pending || undefined}
    >
      {pending ? <span className="spin"><Icon name="spinner" /></span> : glyph && <Icon name={glyph} />}
      {children && <span>{children}</span>}
    </button>
  );
}

export function ButtonGroup({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="btn-group" role="group" aria-label={label}>
      {children}
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {
          setDone(false);
        }
      }}
    >
      <Icon name={done ? "check" : "copy"} />
      <span>{done ? "Copied" : label}</span>
    </button>
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className={`field${error ? " is-error" : ""}`}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <span className="field-note field-error" id={`${id}-note`}>
          <Icon name="alert" size={14} /> {error}
        </span>
      ) : (
        hint && (
          <span className="field-note" id={`${id}-note`}>
            {hint}
          </span>
        )
      )}
    </div>
  );
}

export function Input({ id, defaultValue, placeholder, icon, invalid }: { id: string; defaultValue?: string; placeholder?: string; icon?: IconName; invalid?: boolean }) {
  return (
    <span className={`input${icon ? " has-icon" : ""}`}>
      {icon && <Icon name={icon} />}
      <input id={id} defaultValue={defaultValue} placeholder={placeholder} aria-invalid={invalid || undefined} aria-describedby={`${id}-note`} />
    </span>
  );
}

export function Textarea({ id, defaultValue, placeholder }: { id: string; defaultValue?: string; placeholder?: string }) {
  return <textarea className="textarea" id={id} defaultValue={defaultValue} placeholder={placeholder} rows={3} aria-describedby={`${id}-note`} />;
}

export function Chip({ children, selected, onClick }: { children: ReactNode; selected?: boolean; onClick?: () => void }) {
  return (
    <button type="button" className="chip" aria-pressed={selected} onClick={onClick}>
      {selected && <Icon name="check" size={14} />}
      {children}
    </button>
  );
}

/* Segmented control and tabs switch instantly. Nothing slides. */
export function Segmented({ options, value, onChange, label }: { options: string[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

export function Tabs({ tabs, value, onChange, label }: { tabs: string[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t} type="button" role="tab" aria-selected={value === t} onClick={() => onChange(t)}>
          {t}
        </button>
      ))}
    </div>
  );
}

export function Switch({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="switch-row" htmlFor={id}>
      <span>{label}</span>
      <button id={id} type="button" role="switch" aria-checked={checked} className="switch" onClick={() => onChange(!checked)}>
        <span className="switch-thumb" />
      </button>
    </label>
  );
}

export type StatusKind = "cleared" | "held" | "disputed" | "needs" | "agent";
const statusIcon: Record<StatusKind, IconName> = {
  cleared: "check",
  held: "clock",
  disputed: "alert",
  needs: "hourglass",
  agent: "agent",
};
export function Status({ kind, children }: { kind: StatusKind; children: ReactNode }) {
  return (
    <span className={`status status-${kind}`}>
      <Icon name={statusIcon[kind]} size={14} />
      {children}
    </span>
  );
}

/* Ref: a numbered pointer inside a sentence. Source: the row it points to, listed under the text. */
export function Ref({ n }: { n: number }) {
  return (
    <sup className="ref">
      <a href={`#source-${n}`}>{n}</a>
    </sup>
  );
}

export function Source({ n, source, detail }: { n: number; source: string; detail: string }) {
  return (
    <li className="source" id={`source-${n}`}>
      <span className="source-n">{n}</span>
      <span className="source-body">
        <span className="source-title">{source}</span>
        <span className="source-detail">{detail}</span>
      </span>
    </li>
  );
}

/* Who did it: agent, rule or person. Mercury shows this on every row; so do we. */
export function Actor({ kind, name }: { kind: "agent" | "rule" | "person"; name: string }) {
  const icon: IconName = kind === "agent" ? "agent" : kind === "rule" ? "rule" : "person";
  return (
    <span className={`actor actor-${kind}`}>
      <Icon name={icon} size={14} />
      {name}
    </span>
  );
}
