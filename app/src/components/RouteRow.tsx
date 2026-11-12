import { Tag } from './Tag';

// One stop in the day list (Figma component "ARC v3 / Route row", 61px). Time is approximate, so it shows "~".
// The tag and title open the talk (06 detail).
export function RouteRow({ time, tag, title, href, onMore }: { time: string; tag: string; title: string; href: string; onMore?: () => void }) {
  return (
    <li className="flex min-h-[var(--row-h)] items-start gap-3 border-b border-border py-2">
      <span className="w-[58px] shrink-0 pt-0.5 font-mono text-small font-medium text-text-2">~{time}</span>
      <a href={href} className="flex min-h-touch min-w-0 flex-1 flex-col gap-1">
        <Tag>{tag}</Tag>
        <span className="text-body leading-5">{title}</span>
      </a>
      <button type="button" aria-label={`More about ${title}`} onClick={onMore} className="-mr-2.5 grid size-touch shrink-0 place-items-center text-text-2">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><circle cx="4" cy="10" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="16" cy="10" r="1.5" /></svg>
      </button>
    </li>
  );
}
