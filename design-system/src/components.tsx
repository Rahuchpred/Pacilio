import { ReactNode, useState } from "react";

/* Icons: 16px grid, 1.5 stroke, round caps. One drawing style everywhere. */
const paths = {
  check: <path d="M4 8.5l2.5 2.5L12 5.5" />,
  clock: (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 5v3.25l2 1.25" />
    </>
  ),
  alert: (
    <>
      <path d="M8 2.75l5.75 10H2.25z" />
      <path d="M8 6.75v2.5M8 11.25v.01" />
    </>
  ),
  agent: (
    <>
      <rect x="3" y="4.5" width="10" height="8" rx="2" />
      <path d="M8 2v2.5M6 8.5v.01M10 8.5v.01" />
    </>
  ),
  rule: (
    <>
      <path d="M4 3.5h8M4 8h8M4 12.5h5" />
    </>
  ),
  person: (
    <>
      <circle cx="8" cy="5.5" r="2.5" />
      <path d="M3.5 13c.75-2.25 2.5-3.5 4.5-3.5s3.75 1.25 4.5 3.5" />
    </>
  ),
  doc: (
    <>
      <path d="M4.5 2.5h5l2.5 2.5v8.5h-7.5z" />
      <path d="M9.5 2.5V5H12" />
    </>
  ),
  bank: (
    <>
      <path d="M2.5 6L8 3l5.5 3M3.5 6.5v5M6.5 6.5v5M9.5 6.5v5M12.5 6.5v5M2.5 13h11" />
    </>
  ),
  ticket: (
    <>
      <path d="M2.5 5.5V4h11v1.5a1.5 1.5 0 000 3V10h-11V8.5a1.5 1.5 0 000-3z" />
    </>
  ),
  mail: (
    <>
      <rect x="2.5" y="4" width="11" height="8" rx="1.5" />
      <path d="M3 4.75l5 3.75 5-3.75" />
    </>
  ),
  copy: (
    <>
      <rect x="5.5" y="5.5" width="7" height="7" rx="1.5" />
      <path d="M3.5 10.5v-6a1 1 0 011-1h6" />
    </>
  ),
  sun: (
    <>
      <circle cx="8" cy="8" r="2.75" />
      <path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1 1M11.4 11.4l1 1M3.6 12.4l1-1M11.4 4.6l1-1" />
    </>
  ),
  download: <path d="M8 2.75v7M5 7l3 3 3-3M3 12.75h10" />,
  search: (
    <>
      <circle cx="7" cy="7" r="4.25" />
      <path d="M10.25 10.25L13.25 13.25" />
    </>
  ),
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  plus: <path d="M8 3.5v9M3.5 8h9" />,
  arrow: <path d="M3.5 8h9M9 4.5L12.5 8 9 11.5" />,
  calendar: (
    <>
      <rect x="2.75" y="3.5" width="10.5" height="9.75" rx="1.75" />
      <path d="M2.75 6.75h10.5M5.5 2.25v2.5M10.5 2.25v2.5" />
    </>
  ),
  filter: <path d="M2.75 4h10.5M4.75 8h6.5M6.75 12h2.5" />,
  lock: (
    <>
      <rect x="3.25" y="7" width="9.5" height="6.25" rx="1.5" />
      <path d="M5.25 7V5.25a2.75 2.75 0 015.5 0V7" />
    </>
  ),
  retry: <path d="M12.75 8a4.75 4.75 0 11-1.4-3.36M12.75 2.75v2.5h-2.5" />,
  spinner: <path d="M8 2.75a5.25 5.25 0 105.25 5.25" />,
  hourglass: <path d="M4.5 2.5h7M4.5 13.5h7M5 2.5c0 3 6 3.5 6 5.5s-6 2.5-6 5.5M11 2.5c0 3-6 3.5-6 5.5s6 2.5 6 5.5" />,
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="icon"
    >
      {paths[name]}
    </svg>
  );
}

/* Money: plain amounts with tabular figures and a true minus sign. */
export function Money({ value, sign = false, cents = true }: { value: number; sign?: boolean; cents?: boolean }) {
  const prefix = value < 0 ? "\u2212" : sign ? "+" : "";
  const text = Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
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
  return (
    <button
      type="button"
      className={`btn btn-${kind} btn-${size}${held ? " is-held" : ""}${children ? "" : " btn-icon"}`}
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled || undefined}
      aria-busy={pending || undefined}
    >
      {pending ? <span className="spin"><Icon name="spinner" /></span> : icon && <Icon name={icon} />}
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
