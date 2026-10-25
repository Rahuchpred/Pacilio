import type { ReactNode } from 'react';
import { Icon, type IconName } from '../../../design-system/src/components';
import { Handles } from '../canvas/levels';

// One hairline card per step: an icon, a title, a tag, then the content.
export function Card({
  type,
  icon,
  title,
  meta,
  className = '',
  children,
}: {
  type: string;
  icon: IconName;
  title: ReactNode;
  meta?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`pnode ${className}`}>
      <header className="pnode-head">
        <Icon name={icon} />
        <h3>{title}</h3>
        {meta}
      </header>
      {children}
      <Handles type={type} />
    </div>
  );
}

// Small tabs inside a full card, drawn like the detail filter.
export function CardTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="card-tabs nodrag" role="tablist" aria-label={label}>
      {tabs.map(t => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
