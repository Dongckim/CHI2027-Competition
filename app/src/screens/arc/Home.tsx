// 20/21 · Home = My Arcs. Empty (21, Figma 600:1225): one way in, "New Arc", and CHI 101 to read again.
// With Arcs: a plain list for now (A1); the Figma 20 list comes in A3.
import { href } from '../../router';
import { useArcs, isPersistent } from '../../arc/store';
import { TRIBE } from '../../arc/tribes.js';
import { TRIBE_ICON } from '../../arc/tribeIcons';
import { useTribe } from '../../arc/live';
import { Screen, ArcLink, Pic } from '../../components/arc';
import holo from '../../assets/arc/21-holo-ring.svg';
import orbit from '../../assets/arc/21-empty-orbit.svg';
import newOrb from '../../assets/arc/21-new-arc-orb.svg';
import plus from '../../assets/arc/icon-plus.svg';
import plusDark from '../../assets/arc/button-icon-primary.svg';
import book from '../../assets/arc/icon-book.svg';
import chevron from '../../assets/arc/icon-chevron-right.svg';

const at = (x: number, y: number, w: number) => ({ position: 'absolute' as const, left: x, top: y, width: w, height: w });

export function Home() {
  const arcs = useArcs();
  useTribe(null);
  if (!arcs) return null;
  const newArc = <ArcLink href={href('ask')}><Pic src={plusDark} size={20} />New Arc</ArcLink>;
  const chi101 = (
    <a href={href('start/2')} className="flex h-14 items-center gap-3 rounded-[20px] border border-arc-line bg-arc-surface pr-3.5 pl-4 text-[15px] font-semibold">
      <Pic src={book} size={20} /><span className="flex-1">CHI 101</span><Pic src={chevron} size={18} />
    </a>
  );
  return (
    <Screen label="My Arcs" bottom={<>{chi101}{newArc}</>}>
      <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.024em]">My Arcs</h1>
      {!isPersistent() && <p className="mt-2 text-[14px] text-arc-text-2">This browser does not keep Arcs. They stay until you close the tab.</p>}
      {arcs.length ? (
        <ul className="mt-6 flex flex-col gap-2.5">
          {arcs.map(a => (
            <li key={a.id}>
              <a href={href(`arc/${a.id}`)} className="flex min-h-14 items-center gap-3 rounded-[20px] border border-arc-line bg-arc-surface px-4 py-3">
                <Pic src={TRIBE_ICON[a.tribe]} size={20} />
                <span className="flex-1 text-[16px] font-semibold">{a.query}<span className="block text-[13px] font-medium text-arc-text-3">{TRIBE[a.tribe].name} · {a.nodes.length} talks</span></span>
                <Pic src={chevron} size={18} />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center">
          <a href={href('ask')} aria-label="New Arc" className="relative -mx-6 h-[250px] w-[390px] max-w-[100vw]">
            <img src={holo} alt="" style={at(70, 0, 250)} />
            <img src={orbit} alt="" style={at(110, 40, 170)} />
            <img src={newOrb} alt="" style={at(147, 77, 96)} />
            <img src={plus} alt="" style={at(179, 109, 32)} />
          </a>
          <p className="mt-6 text-center text-[26px] leading-8 font-semibold tracking-[-0.02em]">Start with one question.</p>
        </div>
      )}
    </Screen>
  );
}
