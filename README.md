<div align="center">

<h1>ARC</h1>

<p><strong>Academic Research Compass</strong></p>

<h3>Bring one question. Leave CHI with an answer.</h3>

<p>
  <img alt="CHI 2027" src="https://img.shields.io/badge/CHI%202027-Digital%20Experience%20Competition-111827?style=flat-square">
  <img alt="No login" src="https://img.shields.io/badge/privacy-no%20login%20%C2%B7%20on--device-16a34a?style=flat-square">
  <img alt="License" src="https://img.shields.io/badge/code-MIT-2563eb?style=flat-square">
</p>

<p>
  <a href="https://chidigitalexperience.org/">Competition</a>
  &nbsp;·&nbsp;
  <a href="https://chidigitalexperience.org/programme-data/">Programme data</a>
  &nbsp;·&nbsp;
  <a href="docs/README.md">Docs</a>
</p>

</div>

---

ARC is a mobile web companion for CHI. You bring one research question; ARC lays the conference's talks around it as an **Arc**: work that **Supports** it (same finding), **Reframes** it (another factor, measure or group) and **Challenges** it (a different finding), each with the sentence from the abstract that put it there. Your question lands in one of eight research neighbourhoods, shown by colour and shape. You can follow the Arc through the week, edit it, ask questions on a talk, and share it by link or QR.

## Run it

Node 26 (`package.json` engines; 20.19+ also works locally).

```bash
npm ci
npm run data:fetch chi2023 chi2024 chi2025 chi2026   # official CHI programme feeds (new revisions only)
npm run data:build chi2026                           # normalise into data/build (no network)
npm run dev                                          # app on http://localhost:5173 (also on your phone on the same Wi-Fi)
```

- `npm test` · `npm run typecheck` · `npm run contracts:check`: unit tests, types, contract schemas
- `npm run build` → `dist/`; then `node --experimental-websocket tests/arc/create-check.mjs` and `tests/arc/arc-check.mjs` walk the app in headless Chrome at 390×844
- `npm run build:deploy` is what Vercel runs (feeds → build → app → on-device model if `MODEL_URL` is set)
- Outside the conference days the app runs on a demo day (the second day, 10:00 venue time) and says so. Handy URL switches: `?at=2026-04-14T12:00` (demo clock, venue time) · `?mock=slow|none|pending|crowded` · `?engine=ondevice`

## Data and licence

Programme data © ACM CHI, licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). The app shows "Programme data © ACM CHI 2026, licensed under CC BY-NC-SA 4.0." (the year follows the edition in use). Derived data in `data/` is under the same licence. Code is MIT.

- The official CHI programme feed is the only data source. Institution names are tidied with [ROR](https://ror.org) (CC0) at build time only; venue distances come from the official venue floor plans.
- Papers' full texts are not included: ARC links to the DOI / ACM Digital Library.

ARC is an independent competition entry. It is not affiliated with or endorsed by ACM or CHI.

## Privacy

- **No account, no login.** Open it and start.
- **Your question and your Arcs stay on your phone** (localStorage `arc.device` and IndexedDB `arc`). Nothing about you is sent to a server.
- **Sharing is explicit.** A shared link carries your question, its neighbourhood and the talk numbers, and nothing else (no name, no location); the share screen says so.
- **One exception, talk Q&A** (decision 007): anonymous questions, their votes and flags are stored so everyone can see them. No name, e-mail, IP or user agent is stored; everything is deleted on 2027-06-13.
- **No analytics, no trackers, no ads.** Servers are stateless and do not log what you send.
- AI uses only the public programme data and never writes about a paper: every angle is backed by a sentence quoted from its abstract.

## Built with

| What | Used for |
|---|---|
| React 19, Vite 8, TypeScript 7, Tailwind CSS 4 | the app |
| Inter, IBM Plex Mono (@fontsource) | type |
| three.js 0.186.1 | 3D venue map of the earlier wayfinding screens (not in the current menu) |
| Ajv | contract and schema checks |
| Vercel | hosting and stateless functions |
| ROR API | institution names, build time only |
| Soniox | live captions (validated, not in the current menu) |
| Upstash Redis (REST) | talk Q&A store |
| uqr | QR codes for share links |
| Mock engine (`app/src/engine/mock-core.js`) | the default engine: TF-IDF over the programme plus simple keyword rules |
| On-device engine by Wonjune Lee (`recsys/`) | Supports · Reframes · Challenges in the browser (Web Worker), opened with `?engine=ondevice` while it is compared with the mock; model package 22.2 MB zip, 36 MB unpacked, served from `/model/` |

### Models and licences (on-device engine)

From `recsys/README.md` (Wonjune Lee, 11/21). Only the first two ship to the phone, as files derived from them; the LLMs run at build time and are not in the app.

| Model | Role | Ships in the app | Licence |
|---|---|---|---|
| `BAAI/bge-m3` (fine-tuned) | teacher encoder: talk vectors, distilled into the phone encoder | as derived vectors and encoder | MIT |
| `BAAI/bge-small-en-v1.5` | phone encoder's tokenizer and starting point | yes (`tokenizer.json`, static encoder) | MIT |
| Wonjune Lee's static encoder (`static_*.npy`, `encoder.json`) and finding cards (`angles.json`) | question encoder and angle data | yes | **to be confirmed by Wonjune** (derived from the two above and from CC BY-NC-SA programme data) |
| `Qwen/Qwen3-14B` | build time only: finding cards, plain-word names | no | Apache 2.0 |
| `Qwen/Qwen2.5-7B-Instruct` | build time only: synthetic queries, summaries, 14 seed questions (not shown in the app) | no | Apache 2.0 |
| `@huggingface/tokenizers` build (`recsys/src/web/vendor/tokenizers.min.mjs`) | tokenizer in the browser | yes | **to be confirmed by Wonjune** (no licence notice in the file) |

## Repository

```
app/src/screens/arc/   Arc screens (01–25)        app/src/engine/   engine interface, mock, on-device slot
app/src/arc/           Arc state, map, tribes     app/src/legacy/   earlier planner screens (direct URLs only)
data/                  feeds → build             contracts/        JSON Schemas (Arc 0.1.0)
recsys/                on-device engine source   functions/, api/  stateless serverless functions
tests/                 unit, tests/arc, tests/legacy             docs/             decisions, stages, validation
```

## Team

Dongchan Kim · Eunbi Cho · Wonjune Lee
