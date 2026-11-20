// The short name a map node shows: the title before the colon, at most 24 characters (same rule as the mock engine's
// label). For talks the engine did not pick: added in 15, or received in a share link.
export const labelOf = title => { const t = (title ?? '').trim(); const h = t.split(':')[0].trim() || t; return h.length <= 24 ? h : `${h.slice(0, 23).trimEnd()}…`; };
