// 12/13 header: back to My Arcs, Map ⇄ List, and the ? angle help (22).
import { href } from '../../router';
import { BackButton, IconButton, Pic } from '../../components/arc';
import mapIcon from '../../assets/arc/icon-map.svg';
import listIcon from '../../assets/arc/icon-list.svg';
import helpIcon from '../../assets/arc/icon-help.svg';

export function ArcHeader({ id, view, onHelp }: { id: string; view: 'map' | 'list'; onHelp: () => void }) {
  const seg = (v: 'map' | 'list', icon: string, label: string) => (
    <a href={href(v === 'map' ? `arc/${id}` : `arc/${id}/list`)} aria-label={label} aria-current={view === v ? 'page' : undefined}
      className={`relative flex h-9 w-[52px] items-center justify-center rounded-[18px] before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] ${view === v ? 'border border-arc-line bg-[#2b2a35]' : ''}`}>
      <Pic src={icon} size={20} />
    </a>
  );
  return (
    <>
      <BackButton href={href('home')} />
      <nav aria-label="View" className="flex gap-0.5 rounded-[22px] border border-arc-line bg-arc-surface p-[3px]">{seg('map', mapIcon, 'Map')}{seg('list', listIcon, 'List')}</nav>
      <IconButton icon={helpIcon} label="What are the three angles?" onClick={onHelp} />
    </>
  );
}
