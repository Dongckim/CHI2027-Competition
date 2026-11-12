// Conference days, 48px tabs. Labels come from the venue time zone (Mon / 13).
export function DayTabs({ days, selected, timeZone, onSelect }: { days: string[]; selected: string; timeZone: string; onSelect: (d: string) => void }) {
  const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en', { timeZone, ...o }).format(new Date(`${d}T12:00:00Z`));
  return (
    <div className="flex gap-1.5 px-gutter" role="group" aria-label="Conference day">
      {days.map(d => (
        <button key={d} type="button" aria-pressed={d === selected} onClick={() => onSelect(d)}
          aria-label={fmt(d, { weekday: 'long', month: 'long', day: 'numeric' })}
          className={`flex h-12 flex-1 flex-col items-center justify-center rounded-button text-tag leading-tight ${d === selected ? 'bg-inverse font-semibold text-on-inverse' : 'bg-surface text-text'}`}>
          <span>{fmt(d, { weekday: 'short' })}</span>
          <span>{fmt(d, { day: 'numeric' })}</span>
        </button>
      ))}
    </div>
  );
}
