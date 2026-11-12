# S0 뼈대

브랜치 `stage/S0-skeleton` · Figma v3 `289:450`(컴포넌트), `288:1174`(2 · 오늘 · 하루의 흐름)

## ① 만든 것
- 앱: Vite 8 + React 19 + TS + Tailwind v4 (`vite.config.ts`의 `root: 'app'`, `package.json`은 루트 하나)
  - `app/src/router.ts`: 해시 라우팅 `#/today` `#/explore` `#/questions` (기본 `#/today`)
  - `app/src/tokens.css`: Figma 실측 토큰 + 다크 제안값, `index.css`의 `@theme inline`으로 Tailwind 유틸리티에 연결
  - `app/src/components/`: TabBar, Header, DayTabs, NowCard, RouteRow, Tag, Button, Chip, LinkRow
  - `app/src/screens/`: Today (가짜 추천 → 기존 플래너 → 03-B "Next" 구조), Explore·Questions는 빈 화면
  - `app/src/today/rows.js`: 줄마다 태그 하나 (PICK ONE > TRY NEW > 종류). 순수 JS라 `node --test`로 검사
  - `app/src/data/load.ts`: `/data/build/<edition>/`와 `/data/venue/`를 한 번만 받음
  - 글꼴: `@fontsource` IBM Plex Sans 400/500/600, Plex Mono 500, 라틴 글자만. 다른 글자는 시스템 글꼴
- 계약: `contracts/RecommendRequest.schema.json`, `RecommendResponse.schema.json` 0.1.0 + 예시 `*.chi2026-tuesday.json`
  - `contracts/check.mjs`에 스키마로 못 쓰는 규칙 추가: quote = abstract.slice(start, end), institutionKeys·countries 정렬·중복 없음, clusterId 참조, feedType = papers.json type, bridge via 개수 = path 단계 수
- 배포: `vercel.json` → `npm run build:deploy` = `data:fetch chi2026` → `data:build chi2026` → `vite build` → `app/scripts/copy-static.mjs`(데이터·venue·bench 페이지를 `dist/`의 같은 경로로 복사)
  - `data/scripts/fetch.mjs`: 실패하면 `data:fetch failed: HTTP 404 from <URL>` / `cannot reach <URL> (ENOTFOUND)`처럼 원인을 찍고 exit 1
  - `/` → `/tests/` 리다이렉트 삭제. bench는 `/tests/`에 그대로
- 앱용 데이터 (`data/scripts/app-data.mjs`, `data:build`가 함께 만듦): `data/build/app-data/<edition>/r<리비전>-<해시8>/`
  - `schedule.json` (Today): paperKey·제목·type·feedType·slots(시작·끝·방·세션)·저자 personKey + 플래너가 쓰는 scheduled·video, 방·세션 이름, meta
  - `abstracts/<날짜>.json` (06 상세): paperKey → 초록. 날짜 = 첫 시간 슬롯의 개최지 현지 날짜, 원격 전용은 `unscheduled.json` (`abstractDay()`)
  - `people.json` (07 저자·검색): personKey → 이름, 소속 전체 (저자로 올라간 모든 소속, 좌장만 하는 31명은 기관 키로)
  - `current.json` → 경로. 앱이 빌드 때 번들에 넣어서 배포와 데이터가 항상 맞음. 해시가 있어서 같은 리비전이라도 내용이 바뀌면 경로가 바뀜
  - 앱 로더 `app/src/data/load.ts`: `loadSchedule` (Today), `loadAbstracts(day)`, `loadPeople` (화면을 열 때만)
  - 원본 `data/build/<edition>/papers.json`은 그대로. contracts:check와 bench 페이지는 계속 원본을 씀
- 캐시 (`vercel.json`, 겹치지 않는 경로만): `/assets/*`·`/app-data/*` = `public, max-age=31536000, immutable` · `/`·`/index.html` = `no-cache` · `/data/*` = `max-age=300`
- 명령: `npm run dev`(폰에서도 열리게 `host: true`), `npm run build`, `npm run preview`, `npm run typecheck`
- 테스트: `tests/app/rows.test.mjs` 2개, `tests/contracts/check.test.mjs` 1개, `tests/data/app-data.test.mjs` 3개 추가. `npm test`는 `tests/`만 실행 (`dist/`에 복사된 테스트 제외)

## ② 통과 기준 결과
- 탭 3개 이동: 해시 링크, 새로고침·뒤로 가기 유지 (390×844 headless Chrome 화면 확인, 라이트·다크)
- 가짜 추천 → 화요일 5개 중 4개 정차: 09:00 PAPER(NEXT 카드) / 11:15 PICK ONE(2편 겹침) / 12:03 PAPER / 14:15 TRY NEW(poster, adjacent). 겹친 wild 1편은 PICK ONE 안으로
- `npm run contracts:check`: 4/4 PASS · `npm test`: 46/46 · `tsc`: 오류 0 · `npm run build:deploy`: 성공
- 앱 데이터 분리 뒤 Today 화면: 라이트·다크 390×844 스크린샷이 분리 전과 픽셀 단위로 같음. 첫 화면 요청 = index.html, JS, CSS, woff2 4개, schedule.json, venue 2개 (papers.json·초록·people 없음)
- 파일 크기 (chi2026 r1, gzip -9):

| 파일 | 원본 | gzip | 언제 받음 |
|---|---:|---:|---|
| `app-data/…/schedule.json` | 1,276,931 | 219,198 | Today (첫 화면) |
| `app-data/…/abstracts/2026-04-13.json` | 483,749 | 164,652 | 상세를 열 때, 그날 것만 |
| `app-data/…/abstracts/2026-04-14.json` | 646,989 | 218,161 | 〃 |
| `app-data/…/abstracts/2026-04-15.json` | 662,039 | 223,727 | 〃 |
| `app-data/…/abstracts/2026-04-16.json` | 610,760 | 207,087 | 〃 |
| `app-data/…/abstracts/2026-04-17.json` | 388,729 | 132,299 | 〃 |
| `app-data/…/abstracts/unscheduled.json` | 280,281 | 96,578 | 〃 (원격 전용) |
| `app-data/…/people.json` | 1,696,440 | 265,981 | 저자·검색을 열 때 |
| (참고) 원본 `papers.json` | 8,180,694 | 1,822,078 | 앱은 안 받음 |
| (참고) 원본 `people.json` | 4,151,941 | 454,257 | 앱은 안 받음 |

- 첫 화면 전체 (gzip, woff2는 그대로): 전 2,021,924 B (코드·글꼴·venue 173,896 + papers·sessions·rooms·meta 1,848,028) → 후 **393,094 B** (173,896 + schedule 219,198). 원본 크기로는 8.8 MB → 1.7 MB
- 판정: 통과 (폰 실기기 확인은 Vercel Git 연결 뒤)

## ③ 결정과 이유
- 해시 라우팅, 라우터 라이브러리 없음: 탭 3개뿐, 정적 호스트에서 재작성 규칙 불필요
- 가짜 응답 = `contracts/examples/RecommendResponse.chi2026-tuesday.json`을 앱이 그대로 import: 예시와 앱 입력이 갈라지지 않게
- PICK ONE은 계약에 없음: 플래너의 시간 겹침(conflicts)으로 정함. TRY NEW = band ≠ near
- 예시의 conceptId는 `topics.json`의 `topic:<slug>` (실제 ID). 개념 체계가 정해지면 바뀔 수 있음
- countries는 data/build 값 그대로 나라 이름 (ISO 코드 아님)
- 다크 값은 제안값. 대비 실측은 S8
- Node: `engines` 26.x. Vercel이 20.x를 더 이상 받지 않음 (`BUILD_UTILS_NODE_VERSION_DISCONTINUED`, 첫 미리보기 빌드가 여기서 실패)
- 배포 데이터는 빌드 때 피드에서 받음: 리비전 파일은 바뀌지 않음, version.json 1회. 피드 서버가 죽으면 배포가 원인과 함께 멈춤
- 앱 데이터 경로 = 리비전 + 내용 해시: 리비전만 넣으면 빌드 코드가 바뀌어도 경로가 같아서, 1년 캐시에 옛 파일이 남음
- 경로는 런타임에 묻지 않고 번들에 넣음: index.html이 no-cache라 새 배포는 새 경로를 바로 씀. 런타임 조회 파일(max-age=300)을 두면 배포 직후 5분 동안 옛 경로를 가리켜 404가 날 수 있음

## ④ 남은 문제
- ~~papers.json 8.2 MB를 첫 화면에서 통째로 받음~~ → 이번에 처리함 (② 크기 표). 첫 화면 gzip 2.02 MB → 393 KB
- ~~해시 붙은 assets에도 no-store~~ → 이번에 처리함 (① 캐시). bench 페이지(`/tests/`, `/app/src/`)는 이제 Vercel 기본값 (매번 다시 확인)
- 계약 확인 요청 (원준):
  - conceptId: 해가 바뀌어도 유지되는 slug 형식을 제안 (예시의 `topic:<slug>`는 chi2026 세션 이름에서 온 것이라 해마다 바뀜)
  - 결과가 없을 때: `bridge: null`, `nearby: []` (지금 스키마는 bridge가 객체만 허용 → 확정되면 0.1.x로 null 허용)
  - totalMatches: 200개로 자르기 전 관련 항목 수
- 임베딩 파일: 추천 실행 위치(서버/기기, 원준 결정)가 정해지면 app-data에 추가
- Directions·Skip·Edit·더보기·설정 버튼은 아직 아무 일도 안 함. 시계 없음 → 첫 정차를 항상 NEXT로 표시
- schedule.json 1.28 MB(gzip 219 KB)는 더 줄일 여지 있음 (키 이름 축약, 세션 목록 분리). 지금은 측정만
- 캐시 헤더는 실제 Vercel 응답으로 확인 안 함 (배포 뒤 `curl -sI <주소>/assets/<파일>`로 확인)
- 폰 실기기 확인 안 함

## ⑤ 다음 단계가 알아야 할 것
- 토큰은 `tokens.css` 한 곳. Tailwind 이름: `bg-surface`, `text-text-3`, `rounded-card`, `text-tag`, `min-h-touch`, `px-gutter`
- 하단 고정 요소는 TabBar 하나. 새 화면은 `main`의 아래 여백(탭 바 + safe area)을 그대로 씀
- three.js는 한 화면에서 `await import('three')`로 불러오면 Vite가 따로 나눔
- 피드 version.json CORS (S3용): GET은 `access-control-allow-origin: *`로 브라우저에서 바로 됨. OPTIONS는 405라 **커스텀 헤더 없이** 단순 GET만 쓸 것. `cache-control: max-age=600`이라 `?t=` 붙이는 규칙 유지
- bench 페이지가 읽는 경로(`/app/src/*.js`, `/data/...`)는 dev(`repoFiles` 플러그인)와 dist(`copy-static.mjs`)가 같은 목록을 써야 함

## ⑥ 비용·토큰
- 외부 API 비용 0 (Vercel 미리보기 무료 범위, 피드는 빌드당 version.json 1회 + 리비전 1회)
- 토큰 사용량은 측정하지 않음
