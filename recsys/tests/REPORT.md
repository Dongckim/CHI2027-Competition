# 케이스 테스트 리포트 — chi2026-retriever JSON 입출력

40개 입력 케이스를 실제 명령어(`python retriever.py '<JSON>'`)로 실행해 출력을 확인했다.
수정 후 **40/40 통과**. 수정 전에는 31/40이었고, 실패 9건은 모두 잘못된 입력 처리였다.

재실행: `python tests/run_cases.py` (케이스: `tests/cases.json`, 원본 출력: `tests/results.json`)

## 자동 검사 항목

- 정상 입력: 종료 코드 0, `query`/`top_k`/`latency_ms`/`warnings`/`results` 존재, 결과 수 = `top_k`,
  순위 1..n 연속, 점수 내림차순, 결과마다 15개 필드 모두 존재, 같은 발표 중복 없음, 경고 없음
- 범위 밖 입력: 위와 같되 `warnings`가 비어 있지 않아야 함
- 잘못된 입력: 종료 코드 2 + `{"error": "..."}` (파이썬 오류 메시지 노출 금지)

## 결과 요약

| 분류 | 케이스 | 결과 |
|------|--------|------|
| 정상 주제 | 12 | 12/12 통과, 관련 결과 평균 7.2/8 (아래 표) |
| 입력 형태 변화 | 6 | 6/6 통과. 오타는 품질 저하 (아래) |
| 범위 밖 | 5 | 5/5 통과. 한국어·무의미 문자열·이모지·숫자는 경고 표시 |
| `top_k` 값 | 10 | 10/10 통과 |
| 잘못된 JSON | 7 | 7/7 통과 |

질의 처리 시간(모델 내부): 15~78ms. 명령어 1회 실행은 모델 로드 포함 약 0.9초
(처음 실행만 디스크 캐시 때문에 약 10초). 서버에 붙일 때는 `Retriever()`를 한 번만 만들고 `predict`를 반복 호출하면 된다.

## 관련성 (사람 판단, 상위 8개 중 주제에 맞는 개수)

| ID | 입력 | 관련 | 비고 |
|----|------|------|------|
| N01 | trust calibration in AI agents | 7/8 | 8위 아동 식품 라벨은 약함 |
| N02 | virtual reality for education and learning | 8/8 | |
| N03 | screen reader accessibility for blind users | 8/8 | |
| N04 | AI chatbots for mental health support | 8/8 | |
| N05 | children's online safety and parental control | 7/8 | 6위 시설 아동 사진 동의는 주변 주제 |
| N06 | haptic feedback for VR | 6/8 | 6·7위는 VR 신체 감각이지만 햅틱 피드백은 아님 |
| N07 | privacy in wearable cameras | 6/8 | 2·4위는 웨어러블이 아닌 가정·이웃 감시 카메라 |
| N08 | technology use by older adults living alone | 8/8 | |
| N09 | human-AI co-creativity in art and design | 8/8 | |
| N10 | sustainable HCI and climate change | 8/8 | |
| N11 | communication between autonomous vehicles and pedestrians | 7/8 | 7위는 보행자가 아닌 운전자 대상 |
| N12 | LLM coding assistants for novice programmers | 5/8 | 2·7·8위(프롬프트 피드백, 게임 생성, README 린트) 벗어남. 가장 약한 케이스 |
| F01 | `haptics` (한 단어) | 8/8 | |
| F02 | 긴 문단 (시각장애인 실내 길찾기) | 8/8 | |
| F03 | 논문 제목 그대로 (HaRing) | 1위 정답 | 1위 점수 1.50, 2위 0.92로 차이 큼 |
| F04 | `hapitc feedbak for virtal reality` (오타) | 5/8 | 1위가 무관(습지 VR 교육). 오타에 약함 |
| F05 | `PRIVACY!!! in WEARABLE cameras???` | N07과 상위 3개 동일 | 대소문자·특수문자에 영향 없음 |
| F06 | `LLM UX for BLV users` (약어) | 6/8 | BLV(시각장애) 약어 이해함 |

## 범위 밖 입력

| ID | 입력 | 출력 |
|----|------|------|
| O01 | `웨어러블 기기의 프라이버시` | 무관한 8개 + 경고 "English only" |
| O02 | `best pizza recipes in Naples` | 음식 관련 HCI 논문 8개, 경고 없음 (단어가 일부 일치) |
| O03 | `asdf qwer zxcv` | 무관한 8개 + 경고 "no query word appears" |
| O04 | `🥽🤖` | 무관한 8개 + 같은 경고 |
| O05 | `12345` (숫자) | 문자열로 처리, 무관한 8개 + 같은 경고 |

## top_k와 잘못된 입력

| 입력 | 출력 |
|------|------|
| `top_k` 생략 또는 `null` | 8개 |
| `1`, `20`, `"8"` (문자열 숫자) | 그 개수 |
| `5000` | 중복 발표를 합친 전체 2,491개, `top_k`도 2491로 표시 |
| `0`, `-3` | 오류 `top_k must be at least 1` |
| `"abc"`, `2.7` | 오류 `top_k must be a whole number` |
| `research_topic` 없음, 키 이름 틀림(`topic`) | 오류 `research_topic is required` |
| 빈 문자열, 공백만 | 오류 `research_topic must not be empty` |
| 깨진 JSON | 오류 `input is not valid JSON (... at position 28)` |
| 객체가 아닌 배열 | 오류 `request must be a JSON object` |
| 모르는 필드 추가 (`"user": "kim"`) | 무시하고 정상 처리 |

## 테스트 중 수정한 것

1. 잘못된 입력이 파이썬 traceback으로 끝나던 것 → `{"error": ...}` + 종료 코드 2
2. `top_k` 0·음수가 조용히 1로 바뀌던 것 → 오류로 알림. 소수(2.7)도 오류
3. `top_k`가 실제 결과 수보다 크게 표시되던 것(2509 vs 2491) → 실제 반환 개수로 표시
4. 한국어·무의미 입력에 아무 표시 없이 무관한 결과를 주던 것 → `warnings` 필드 추가 (정상 입력이면 빈 목록)

## 남은 한계

- 오타가 있으면 품질이 떨어진다 (F04). 맞춤법 교정은 하지 않는다.
- 주제와 단어가 일부만 겹치는 비HCI 질의(O02)는 경고 없이 결과가 나온다.
- 관련성 판단은 테스트 작성자 1인의 판단이다.

## 다시 확인 (2026-10-22, 순위 보강 + 문서 확장 이후)

같은 12개 주제를 지금 패키지로 다시 돌렸다. 6개(N02, N03, N06, N08, N11, N12)는 상위 8개가 그대로다.

| ID | 바뀐 것 | 관련 |
|----|------|------|
| N01 | 에이전트 권한·성격 논문 2편 → 신뢰·의사결정 논문 2편 | 7/8 (더 정확해짐) |
| N04 | 관련 논문끼리 2편 교체 | 8/8 |
| N05 | 관련 논문끼리 1편 교체 | 7/8 |
| N07 | 미술 속 감시 논문 → 연인 간 프라이버시 논문(카메라 무관) | 5/8 (-1) |
| N09 | 관련 논문끼리 2편 교체 | 8/8 |
| N10 | 관련 논문끼리 1편 교체 | 8/8 |

평균 7.2 → 7.1/8. 학회에 없는 주제 2건(O06 화산재, O07 단백질 구조)을 추가해 42/42 통과.
