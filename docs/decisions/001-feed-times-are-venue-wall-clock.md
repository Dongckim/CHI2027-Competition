# 001 피드 시각은 현지 벽시계 값으로 보고, 빌드에서 UTC 순간으로 바꾼다

날짜: 2026-10-21 · 단계: V0 (#1)

## 결정
피드의 epoch ms(`timeSlots`, `events`의 startDate·endDate)는 개최지 현지 시각을 UTC인 것처럼 적은 값으로 본다. `data/scripts/build.mjs`의 `wallToInstant`가 `data/venue/<edition>.json`의 IANA 시간대로 실제 UTC 순간으로 바꾸고, `data/build`에는 바뀐 값만 저장한다. 앱·추천·지니는 build 값을 `Date.now()`와 바로 비교하고, 화면에는 같은 IANA 시간대로 표시한다.

## 이유
- 5개 피드 모두 세션 시작이 09:00Z, 11:15Z, 14:15Z처럼 일반적인 학회 현지 시간표 모양
- 그대로 변환하면 chi2024(Pacific/Honolulu)는 세션의 1.1%, chi2025(Asia/Tokyo)는 49.7%만 현지 07~22시. 벽시계로 보면 4개 연도 모두 100%
- `conference.startDate`도 모든 연도에서 00:00Z, 즉 현지 자정

## 대안
- 변환 없이 `timeZone: 'UTC'`로 표시: 화면은 맞지만 "지금 몇 분 남았나", 출발 배너가 시간대만큼 틀림
- 앱에서 매번 변환: 앱·추천·지니가 각자 해야 해서 실수할 곳이 늘어남

## 남은 확인
app@chi2027.acm.org에 확인 요청. 답이 다르면 `wallToInstant` 한 곳만 바꾸면 됨.
