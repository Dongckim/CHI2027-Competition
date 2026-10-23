# 02 플래너 (V2)

브랜치 `stage/02-planner` · 이슈 #3 · 검증 문서 [V2-planner.md](../validation/V2-planner.md) · 정리일 2026-10-22

## ① 만든 것
- `app/src/planner/plan.js`: 추천 후보(`{ paperKey, relevance }`) + data/build → 하루 루트
  - `indexData`, `planDay(index, candidates, { day, wheelchair, travelMinutes })`, `localDay`
  - 점수 = 관련도 × 현장 가치(영상 없음 1.0, 있음 0.5) − 0.01 × 이동 분. 하루 안에서 가중 구간 스케줄링(동적 계획법)
  - 출력: stops(정차), conflicts(정차마다 대안 최대 2개), skipped(이유: unknown·unscheduled·other-day)
  - `venueTravelMinutes(venue, edition)`: V6 평면도 경로의 느린 쪽 분 (아래 06 참고). 그래프 없는 연도·방은 층 임시값 (같은 층 4분, 다른 층 7분, 휠체어 ×1.5 + 3분)
- `contracts/`: 규칙, `npm run contracts:check`, 플래너가 필요로 하는 필드 체크리스트 (README). 스키마 필드는 아직 없음
- `recsys/README.md`: 추천 쪽 인계 메모 (입력 처리 위치, 사람 추천)
- 도구: `node tests/planner/try.mjs <후보.json>` (예: `tests/planner/examples/accessibility.json`), `node tests/planner/bench.mjs`
- 테스트 `tests/planner/plan.test.mjs`

## ② 통과 기준 결과
- 어려운 사례 10/10 → 통과
- 성능: M2 추천 200개 1.1ms · 전체 87ms, iPhone Safari(V3) 추천 200개 0.6ms · 전체 33.4ms → 통과 (기준 100ms)
- chi2026 5일 · chi2025 6일 모두 루트 생성 → 통과
- 계약 6종 0/6 → 미완
- 판정: 진행 중 (플래너 조건부 통과, 계약 대기)

## ③ 결정과 이유
- 계약과 무관한 내부 입력으로 먼저: 계약 필드는 Figma 기준으로 사용자가 설계 중. 확정되면 경계에서 몇 줄로 변환
- 영상이 있는 발표는 가치 절반: 나중에 볼 수 있으니 현장에서만 볼 수 있는 것을 우선
- 이동 시간은 느린 쪽: 플래너가 허락한 이동은 실제로 가능해야 함
- 추천 로직은 플래너·도구에 넣지 않음 (recsys/ 몫)

## ④ 남은 문제
- 계약 6종 (RecommendRequest·RecommendResponse·Route·DeviceState·GenieTool·CaptionSession)
- Android 실측 (V3)
- 못 하는 것: 꼭 갈 발표 고정·제외, 쉬는 시간, 포스터를 잠깐 들르는 것으로 보기 (contracts/README.md)

## ⑤ 다음 단계가 알아야 할 것
- 후보 수의 제곱으로 느려짐: 추천은 상위 수십~수백 개로 넘길 것
- 날짜는 개최지 현지 날짜 (`localDay(start, meta.timeZone)`), 시각은 UTC ms
- 같은 포스터가 하루 두 번 열려도 한 번만 들어감

## ⑥ 비용·토큰
- 외부 API 없음
- Claude 토큰: 측정하지 않음
