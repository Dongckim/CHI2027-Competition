import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import og, { ogPng } from '../../functions/og.mjs';
import { sharePage } from '../../functions/share.mjs';
import { encodeLink } from '../../app/src/arc/link.js';

const arc = JSON.parse(readFileSync(new URL('../../contracts/examples/Arc.chi2026-presence.json', import.meta.url)));
const isPng = b => Buffer.from(b).subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

test('og: a 1200×630 PNG for a link, for any script, and for a broken link; cached a year', async () => {
  const p = encodeLink(arc);
  const png = await ogPng(p);
  assert.ok(isPng(png));
  assert.equal(Buffer.from(png).readUInt32BE(16), 1200);
  assert.equal(Buffer.from(png).readUInt32BE(20), 630);
  assert.ok(isPng(await ogPng(encodeLink({ ...arc, query: '존재감을 높일까?' }))));
  assert.ok(isPng(await ogPng('broken')));
  const r = await og(new Request(`https://x/api/og?d=${p}`));
  assert.equal(r.headers.get('content-type'), 'image/png');
  assert.match(r.headers.get('cache-control'), /immutable/);
});

test('share page points og:image at /api/og for the same link, large card', () => {
  const p = encodeLink(arc);
  const html = sharePage(p, 'https://arc.example');
  assert.ok(html.includes(`<meta property="og:image" content="https://arc.example/api/og?d=${p}">`));
  assert.match(html, /summary_large_image/);
  assert.ok(!sharePage('broken', 'https://arc.example').includes('og:image'));
});
