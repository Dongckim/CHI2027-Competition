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
- 명령: `npm run dev`(폰에서도 열리게 `host: true`), `npm run build`, `npm run preview`, `npm run typecheck`
- 테스트: `tests/app/rows.test.mjs` 2개, `tests/contracts/check.test.mjs` 1개 추가. `npm test`는 `tests/`만 실행 (`dist/`에 복사된 테스트 제외)

## ② 통과 기준 결과
- 탭 3개 이동: 해시 링크, 새로고침·뒤로 가기 유지 (390×844 headless Chrome 화면 확인, 라이트·다크)
- 가짜 추천 → 화요일 5개 중 4개 정차: 09:00 PAPER(NEXT 카드) / 11:15 PICK ONE(2편 겹침) / 12:03 PAPER / 14:15 TRY NEW(poster, adjacent). 겹친 wild 1편은 PICK ONE 안으로
- `npm run contracts:check`: 4/4 PASS · `npm test`: 43/43 · `tsc`: 오류 0 · `npm run build:deploy`: 성공
- 전송량: JS 239 kB (gzip 75 kB), CSS 12 kB (gzip 3.5 kB), woff2 4개 86 kB, papers.json 8.2 MB (gzip 1.8 MB)
- 판정: 통과 (폰 실기기 확인은 Vercel Git 연결 뒤)

## ③ 결정과 이유
- 해시 라우팅, 라우터 라이브러리 없음: 탭 3개뿐, 정적 호스트에서 재작성 규칙 불필요
- 가짜 응답 = `contracts/examples/RecommendResponse.chi2026-tuesday.json`을 앱이 그대로 import: 예시와 앱 입력이 갈라지지 않게
- PICK ONE은 계약에 없음: 플래너의 시간 겹침(conflicts)으로 정함. TRY NEW = band ≠ near
- 예시의 conceptId는 `topics.json`의 `topic:<slug>` (실제 ID). 개념 체계가 정해지면 바뀔 수 있음
- countries는 data/build 값 그대로 나라 이름 (ISO 코드 아님)
- 다크 값은 제안값. 대비 실측은 S8
- 배포 데이터는 빌드 때 피드에서 받음: 리비전 파일은 바뀌지 않음, version.json 1회. 피드 서버가 죽으면 배포가 원인과 함께 멈춤

## ④ 남은 문제
- papers.json 8.2 MB를 첫 화면에서 통째로 받음 (gzip 1.8 MB). 앱용 요약 파일이 필요 (제목·종류·slots만)
- Directions·Skip·Edit·더보기·설정 버튼은 아직 아무 일도 안 함. 시계 없음 → 첫 정차를 항상 NEXT로 표시
- 계약 0.1.0은 원준 확인 필요. bridge·nearby가 없을 때(빈 배열/객체) 의미, totalMatches 정의
- `cache-control: no-store`가 해시 붙은 assets에도 걸림 (기존 설정 유지)
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
