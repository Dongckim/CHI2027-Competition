// 12/13 header: back to My Arcs, Map ⇄ List, and the ? angle help (22).
import type { ReactNode } from 'react';
import { href } from '../../router';
import { BackButton, IconButton, Pic } from '../../components/arc';
import mapIcon from '../../assets/arc/icon-map.svg';
import listIcon from '../../assets/arc/icon-list.svg';
import helpIcon from '../../assets/arc/icon-help.svg';

// title: in place of Map ⇄ List (24b "↑ Supports 12", the map moved toward one angle)
// back: where the back arrow goes (24b → its map; else My Arcs)
export function ArcHeader({ id, view, onHelp, title, back = 'home' }: { id: string; view: 'map' | 'list'; onHelp: () => void; title?: ReactNode; back?: string }) {
  const seg = (v: 'map' | 'list', icon: string, label: string) => (
    <a href={href(v === 'map' ? `arc/${id}` : `arc/${id}/list`)} aria-label={label} aria-current={view === v ? 'page' : undefined}
      className={`relative flex h-9 w-[52px] items-center justify-center rounded-[18px] before:absolute before:inset-x-0 before:-inset-y-[5px] before:content-[''] ${view === v ? 'border border-arc-line bg-[#2b2a35]' : ''}`}>
      <Pic src={icon} size={20} className={view === v ? '' : 'opacity-55'} />
    </a>
  );
  return (
    <>
      <BackButton href={href(back)} />
      {title ?? <nav aria-label="View" className="mt-0.5 flex gap-0.5 rounded-[22px] border border-arc-line bg-arc-surface p-[3px]">{seg('map', mapIcon, 'Map')}{seg('list', listIcon, 'List')}</nav>}
      <IconButton icon={helpIcon} label="What are the three angles?" onClick={onHelp} />
    </>
  );
}
