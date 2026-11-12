// Row tags (POSTER, PAPER, DEMO, TRY NEW, PICK ONE) and card status tags (NEXT, NOW, ...). 20px high, mono 12px.
// tone: plain = grey chip; strong = filled (status on a light card); strong-on-dark = filled for the dark card.
const TONES = { plain: 'bg-tag-bg text-text', strong: 'bg-inverse text-on-inverse', 'strong-on-dark': 'bg-on-inverse text-inverse' };

export function Tag({ children, tone = 'plain' }: { children: string; tone?: keyof typeof TONES }) {
  return <span className={`inline-flex h-5 shrink-0 items-center self-start rounded-tag px-1.5 font-mono text-tag font-medium uppercase ${TONES[tone]}`}>{children}</span>;
}
