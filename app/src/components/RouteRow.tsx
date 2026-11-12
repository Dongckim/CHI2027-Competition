import type { ReactNode } from 'react';
import { Tag } from './Tag';

// One stop in the day list (Figma component "ARC v3 / Route row", 61px). Time is approximate, so it shows "~".
// The tag and title open the talk (06 detail), or `onOpen` for PICK ONE. ⋯ shows the row actions (03-G) below the row.
export function RouteRow({ time, tag, title, href, onOpen, note, actionsOpen, onMore, children }: {
  time: string; tag: string; title: string; href?: string; onOpen?: () => void; note?: string;
  actionsOpen?: boolean; onMore?: () => void; children?: ReactNode;
}) {
  const body = (<><Tag>{tag}</Tag>{note && <span className="text-small font-semibold">{note}</span>}<span className="text-body leading-5">{title}</span></>);
  return (
    <li className="border-b border-border py-2">
      <div className="flex min-h-[calc(var(--row-h)-16px)] items-start gap-3">
        <span className="w-[58px] shrink-0 pt-0.5 font-mono text-small font-medium text-text-2">~{time}</span>
        {href
          ? <a href={href} className="flex min-h-touch min-w-0 flex-1 flex-col gap-1">{body}</a>
          : <button type="button" onClick={onOpen} aria-expanded={actionsOpen} className="flex min-h-touch min-w-0 flex-1 flex-col gap-1 text-left">{body}</button>}
        {onMore && (
          <button type="button" aria-label={`Change ${title}`} aria-expanded={actionsOpen} onClick={onMore} className="-mr-2.5 grid size-touch shrink-0 place-items-center text-text-2">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><circle cx="4" cy="10" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="16" cy="10" r="1.5" /></svg>
          </button>
        )}
      </div>
      {actionsOpen && children && <div className="flex flex-col gap-2 pt-2 pl-[70px]">{children}</div>}
    </li>
  );
}

// The place a removed stop leaves (03-I): "Free 15:30–16:10" and Fill (More for you for that gap).
export function FreeRow({ from, to, href }: { from: string; to: string; href: string }) {
  return (
    <li className="flex min-h-[52px] items-center justify-between gap-3 border-b border-border py-2">
      <span className="text-body text-text-2">Free {from}–{to}</span>
      <a href={href} className="grid min-h-touch place-items-center rounded-button border border-border-strong px-4 text-small font-semibold">Fill</a>
    </li>
  );
}
