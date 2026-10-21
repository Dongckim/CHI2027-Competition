# 00 데이터 (V0)

브랜치 `stage/00-data` · 이슈 #1 · 검증 문서 [V0-data.md](../validation/V0-data.md)

## ① 만든 것
- `data/scripts/fetch.mjs`: version.json(`?t=`) → 새 리비전만 `data/raw/<edition>/rev-NNN.json` (+ version-NNN.json)
- `data/scripts/validate.mjs`: 공식 스키마 v1 검사 (ajv, draft 2020-12)
- `data/scripts/build.mjs`: `data/build/<edition>/` 7개 파일 (meta·papers·sessions·rooms·people·topics·aliases)
- `data/scripts/report.mjs`: V0 측정 → `docs/validation/V0-data.results.json`
- `data/venue/<edition>.json`: 시간대 (V6에서 방·이동 시간 추가)
- `data/curated/institution-abbr.json`: 기관 약어 수동표 (사람 검토 필요)
- `tests/data/build.test.mjs`: 테스트 6개

## ② 통과 기준 결과
- 공식 스키마: 1/5 통과 (스키마가 초안, 실패 필드는 ARC 미사용 또는 빌드에서 처리)
- 논문 시간·방 (chi2026): 1,591/1,702 = 93.5% (나머지 111편은 원격 영상 전용)
- 결정성: 5/5 피드 2회 빌드 해시 동일
- 테스트: 6/6 통과
- 판정: 조건부 통과

## ③ 결정과 이유
- [001](../decisions/001-feed-times-are-venue-wall-clock.md): 피드 시각은 현지 벽시계 값 → 빌드에서 UTC 순간으로 변환
- 발표별 시각 = 세션 시작 + 콘텐츠 종류 duration × 순서. 12분 상수가 아닌 이유: 2024 15분, 2023 14분
- 기관 별칭은 수동표 우선. 자동 약어는 241개가 여러 기관과 겹침 (UW 등)
- latest.json 대신 revisions 파일 저장: 같은 내용이고 바뀌지 않아 영구 캐시 가능
- 도구: Node 20 ESM 스크립트(빌드 단계 없음), 의존성은 ajv·ajv-formats만. 앱과 같은 JS 생태계
- `data/build/`는 git에 올리지 않음 (5개 피드 약 44MB, 2개 명령으로 똑같이 재생성됨)

## ④ 남은 문제
- 발표 순서가 contentIds 순서라는 가정은 확인 안 됨
- 주제 칩 241개는 너무 잘게 나뉨 (여러 세션을 묶은 칩 2개뿐)
- 기관 이름 오타·표기 차이가 많음 (2,131개). 수동표에 없는 기관은 합쳐지지 않음
- 원격 전용 발표 처리 방식(화면 표시)은 미정

## ⑤ 다음 단계가 알아야 할 것
- data/build의 `start`·`end`는 UTC 순간 → `Date.now()`와 바로 비교. 표시만 `meta.timeZone`으로
- `papers[].scheduled === false`이면 루트에서 제외
- `sessions[].timing`: `talks`(발표별 시각) / `block`(세션 전체, 포스터·데모·워크숍) / `none`(원격)
- `people[].appearances`는 시각순이라 다음 등장 = `start ≥ now`인 첫 항목
- `meta.attribution`에 출처 표기 문구가 들어 있음
- 재생성: `npm ci && npm run data:fetch && npm run data:build`

## ⑥ 비용·토큰
- 외부 API 비용 0원 (공식 피드만 사용, 다운로드 약 48MB)
- 빌드 5개 피드 약 1초, report 약 2초
- Claude 토큰: 측정하지 않음
