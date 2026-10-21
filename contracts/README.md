# contracts

ARC의 기능들(추천·플래너·지니·자막·앱)이 주고받는 데이터의 모양을 정한 약속입니다. 각 기능은 상대의 코드를 몰라도 이 모양만 맞추면 됩니다.

> **상태: 설계 중.** 필드는 Figma 초안을 바탕으로 Dongchan이 먼저 설계하고 Wonjune과 논의해서 정합니다. 그전까지는 각 기능이 내부 형식을 쓰고, 계약이 정해지면 경계에서 변환합니다.

## 규칙
- 파일: `contracts/<Name>.schema.json` (JSON Schema draft 2020-12)
- 모든 스키마에 `schema_version` 속성 필수 (예: `"0.1.0"`). 바꾸면 버전을 올리고 [CHANGELOG.md](CHANGELOG.md)에 기록
  - 0.x 동안은 자유롭게 바뀔 수 있음. 필드 삭제·이름 변경 = 두 번째 자리, 필드 추가 = 세 번째 자리
- 예시: `contracts/examples/<Name>.<설명>.json`. **실제 ID**(data/build의 키)로 채움
- 검사: `npm run contracts:check` (스키마가 올바른지, 예시가 스키마에 맞는지). `npm test`에 포함
- 키 형식은 data/build와 같게: 발표·세션·방·사람 `edition:id` (예: `chi2026:223018`), 기관 `inst:ror-<id>`, 주제 `topic:<slug>`
- 시각은 UTC epoch ms (data/build와 같음). 화면에서만 `meta.timeZone`으로 표시

## 만들 계약 (V2, #3)
| 계약 | 무엇 | 만드는 쪽 → 쓰는 쪽 |
|---|---|---|
| RecommendRequest | 추천 요청 | 앱 → 추천 (functions/, recsys/) |
| RecommendResponse | 추천 결과 | 추천 → 플래너·앱 |
| Route | 하루 루트 | 플래너 → 앱 |
| DeviceState | 기기에만 저장하는 개인 데이터 전부 | 앱 |
| GenieTool | 지니 도구 입력·출력 | 지니 ↔ 앱 |
| CaptionSession | 자막 세션 설정·상태 | 앱 ↔ 자막 |

## 플래너가 계약에서 필요로 하는 것 (설계 체크리스트)
플래너(`app/src/planner/plan.js`)는 지금 아래 내부 형식으로 동작합니다. 계약이 이 정보를 담고 있으면 변환은 몇 줄이면 됩니다.

**RecommendResponse → 플래너 입력**
- [ ] 학회 연도 (`edition`): 어떤 data/build를 읽을지
- [ ] 추천 항목마다 발표 키 (`edition:id`)
- [ ] 추천 항목마다 관련도 숫자, **0~1로 정규화** (모델이 바뀌어도 같은 뜻이어야 함. 점수 = 관련도 × 현장 가치 − 이동 비용)
- [ ] (선택) near / adjacent / wild 구분: 플래너는 안 쓰지만 화면·평가에 필요

**DeviceState → 플래너 옵션**
- [ ] 휠체어 사용 여부 (이동 시간에 여유 추가)
- [ ] 보고 싶은 날짜 (개최지 현지 날짜, `YYYY-MM-DD`)

**플래너 출력 → Route** (지금 내부 출력에 있는 것)
- [ ] 날짜, 시간대, 휠체어 여부
- [ ] 정차(stops): 발표 키, 세션 키, 방 키, 시작·끝 (UTC ms), 이전 정차에서 이동 시간(분), 점수
- [ ] 겹침(conflicts): 정차마다 같은 시간대 대안 최대 2개
- [ ] 제외(skipped): 발표 키 + 이유 (`unknown` 데이터에 없음 / `unscheduled` 원격 전용 / `other-day` 다른 날)
- [ ] (V7용) 계산에 쓴 데이터 버전: `meta.revision`, `meta.publicationVersion` → 피드가 바뀌면 다시 계산할지 판단

**지금 플래너가 못 하는 것** (계약에 넣을지 결정 필요)
- 꼭 갈 발표 고정 / 빼고 싶은 발표 제외
- 쉬는 시간·점심 비우기, 하루 시작·끝 시각 지정
- 포스터·데모는 90분 세션 전체를 차지하는 것으로 계산됨 (잠깐 들르는 것으로 볼지)

## Wonjune에게 보낼 것 (계약 확정 후. 지금 공유할 내용은 [recsys/README.md](../recsys/README.md))
1. `RecommendRequest.schema.json`, `RecommendResponse.schema.json`과 예시 파일
2. 데이터 받기: `npm ci && npm run data:fetch && npm run data:build` → `data/build/chi2026/papers.json` (필드 설명: docs/stages/00-data.md ⑤)
3. 출력 검사: 모델 출력을 `contracts/examples/RecommendResponse.<이름>.json`으로 저장 → `npm run contracts:check`
4. 규칙: 같은 입력 = 같은 결과, 응답 1초 이내, 추천 이유는 개념 ID + 초록 원문 인용만 (내용 지어내기 금지), `scheduled: false`(원격 전용) 발표도 추천은 가능하지만 루트에는 안 들어감, 키는 `edition:id`
