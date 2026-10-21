# recsys: 추천 모델 (Wonjune)

ARC에서 추천이 맡는 일과, 다른 부분과 맞춰야 할 것을 정리한 문서입니다.

## 추천의 역할

```
연구 문장 한 줄 ──▶ 추천 (recsys/) ──▶ 플래너 (app/src/planner/) ──▶ 화면
                   "무엇이 관련 있나"      "언제·어디로 가나"
```

- 추천은 **무엇이 관련 있는지만** 판단합니다. 시간·방·겹침·이동은 플래너가 처리하므로 신경 쓰지 않아도 됩니다
- 계약(contracts/RecommendRequest·RecommendResponse)은 Dongchan이 설계 중이고, 이 문서의 "정해야 할 것"을 함께 논의해서 확정합니다

## 지금 바로 할 수 있는 것

### 1. 데이터 받기
```bash
npm ci
npm run data:fetch   # 공식 CHI 피드 5개 (chi2023~2026, sandbox)
npm run data:build   # data/build/<edition>/ 생성, 약 1초
```
개발 기준은 `data/build/chi2026/`. 추천은 **data/build만** 읽습니다 (외부 데이터 추가는 논의 필요, 라이선스 CC BY-NC-SA 4.0).

### 2. 쓸 만한 파일
| 파일 | 내용 |
|---|---|
| `papers.json` | 발표 2,782개. `key`(`chi2026:223018`), `type`(Paper·Posters·…), `title`, `abstract`, `authors[]`(`name`, `institutionKey`, `institution`), `doi`, `video`, `scheduled`(false = 원격 전용), `slots[]` |
| `sessions.json` | 세션 이름(사람이 붙인 주제), 소속 발표 키 |
| `topics.json` | 세션 이름 기반 주제 241개 (너무 잘게 나뉨, 개념 체계 참고용) |
| `aliases.json` | 기관 (ROR 공식 기관으로 정리됨) |

한 줄에 한 레코드라 `JSON.parse` 한 번이면 됩니다 (Python: `json.load`).

### 3. 출력을 플래너에 넣어 보기
계약이 확정되기 전까지 임시 형식은 이것 하나입니다:
```json
[
  { "paperKey": "chi2026:223509", "relevance": 0.9 },
  { "paperKey": "chi2026:222592", "relevance": 0.6 }
]
```
```bash
node tests/planner/try.mjs my-output.json            # 학회 전체 일정
node tests/planner/try.mjs my-output.json --day 2026-04-14
```
예시: `tests/planner/examples/accessibility.json`

## 지켜야 할 규칙 (CLAUDE.md)
- **같은 입력이면 같은 결과** (난수 고정, 동점 처리 고정)
- **응답 1초 이내**
- 추천 이유는 **개념 ID + 초록 원문 인용**만. 논문 내용을 지어내지 않음 (생성 모델로 요약·설명 금지)
- 서버에서 돈다면 **무상태, 요청 내용(연구 문장) 로그 금지**. 연구 문장은 개인 데이터로 취급
- 키는 항상 `edition:id`
- 원격 전용 발표(`scheduled: false`)도 추천해도 됩니다. 플래너가 루트에서 빼고 "원격"으로 표시

## Wonjune에게 받아야 할 것

### 정해야 할 것 (계약 논의 전에 생각해 오기)
- [ ] **관련도 숫자의 뜻**: 0~1로 정규화 필수. 모델이 바뀌어도 같은 뜻이어야 함 (예: 0.8 이상 = "꼭 볼 만함"?). 플래너는 이 숫자를 그대로 점수에 씀
- [ ] **near / adjacent / wild**: 각각의 정의와 비율 (예: 상위 10개 중 6/3/1?)
- [ ] **징검다리 경로**: 무엇과 무엇을 잇는지, 출력 모양 (예: 연구 문장 → 개념 A → 개념 B → 발표)
- [ ] **개념 체계**: 개념 ID를 어떻게 만드는지, 해(edition)가 바뀌어도 유지되는지
- [ ] **이유 인용 형식**: 초록 어느 부분인지 (문자 위치 시작·끝 vs 문장 번호)
- [ ] **몇 개를 돌려주는지**: 상위 N개 (플래너는 200개까지 노트북 1ms 이내, 휴대폰은 V3에서 측정)
- [ ] **입력 언어**: 한국어 연구 문장도 받는지
- [ ] **실행 위치**: 서버 함수(`functions/`) vs 브라우저. 모델 크기, 언어(Python?), 의존성, 실행 비용

### 만들어서 줄 것
- [ ] 위 결정 사항 메모 (Dongchan의 계약 설계와 맞추기)
- [ ] 모델 실행 방법 (명령 한 줄, 입력 → 출력 JSON)
- [ ] V1 평가용: 페르소나 10명(`tests/recsys/personas.json`, 팀원 3명 실제 연구 포함)의 출력. 기준선(TF-IDF+LSA)과 같은 평가표로 비교함 (이슈 #2)
- [ ] 측정값: 응답 시간, 결정성 (같은 입력 2회 → 같은 결과인지)

## 일정
- 기술 검증 마일스톤 마감 **2026-11-04** (V1 추천 품질 #2 포함)
- 계약이 확정되면 `contracts/examples/RecommendResponse.<이름>.json`으로 출력 예시를 넣고 `npm run contracts:check`로 검사
