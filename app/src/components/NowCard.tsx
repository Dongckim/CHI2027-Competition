import type { ReactNode } from 'react';
import { Tag } from './Tag';

// The one thing to do now. status: NEXT, FIRST STOP, LEAVE NOW (dark card), NOW, DONE.
export function NowCard({ status, where, title, href, note, actions, dark = false }:
  { status: string; where: string; title: string; href?: string; note?: string; actions?: ReactNode; dark?: boolean }) {
  return (
    <section aria-label={status} className={`mx-gutter flex flex-col gap-2 rounded-card p-4 ${dark ? 'bg-inverse text-on-inverse' : 'border-[length:var(--card-border)] border-text bg-bg'}`}>
      <p className={`flex items-center gap-1.5 font-mono text-tag font-medium ${dark ? 'text-on-inverse-2' : 'text-text-2'}`}>
        <Tag tone={dark ? 'strong-on-dark' : 'strong'}>{status}</Tag><span>{where}</span>
      </p>
      <h2 className="text-card-title leading-6 font-semibold">{href ? <a href={href}>{title}</a> : title}</h2>
      {note && <p className={`text-small ${dark ? 'text-on-inverse-2' : 'text-text-3'}`}>{note}</p>}
      {actions && <div className="mt-1 flex gap-2">{actions}</div>}
    </section>
  );
}
