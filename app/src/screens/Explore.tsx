import { Header } from '../components/Header';

// S0 placeholder: search and browsing come in a later stage.
export function Explore() {
  return (
    <>
      <Header />
      <div className="px-gutter pt-3">
        <h1 className="text-card-title font-semibold">Explore</h1>
        <p className="pt-2 text-body text-text-2">Find talks and people. Coming in a later stage.</p>
      </div>
    </>
  );
}
