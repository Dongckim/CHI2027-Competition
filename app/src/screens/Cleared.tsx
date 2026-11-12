import { go } from '../router';
import { update } from '../state/useDevice';
import { Header } from '../components/Header';
import { ButtonLink } from '../components/Button';
import { BottomAction } from '../components/BottomAction';

// 03-J2: a plan was built on this phone but its saved data is gone (the browser cleared it, or it could not be read).
// TODO(S7): "Open my plan link" restores from the plan link; until then it shows where that will live.
export function Cleared() {
  return (
    <div className="mx-auto min-h-dvh max-w-[480px] bg-bg">
      <Header wordmark right={<span />} />
      <main className="flex flex-col gap-3 px-gutter pt-6">
        <h1 className="text-[26px] leading-8 font-semibold">Your plan isn't on this phone</h1>
        <p className="text-body text-text-2">The browser cleared saved data.</p>
        <ButtonLink href="#/planlink/" variant="secondary" className="self-start">Open my plan link</ButtonLink>
      </main>
      <BottomAction label="Plan again" onClick={() => { update(s => ({ ...s, mode: null })); go('start/research', { replace: true }); }} />
    </div>
  );
}
