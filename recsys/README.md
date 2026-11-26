# recsys: 추천 모델 (Wonjune)

## Arc 엔진 자리 (2026-11-21, 지금 기준)
- **인터페이스**: `app/src/engine/types.ts`의 `Engine` (`init`, `tribeOf`, `angleTopics`, `buildArc`, `suggest`, `wildcard`), 결과는 `contracts/Arc.schema.json` 0.1.0. 앱은 `app/src/engine/index.ts`를 통해서만 부름
- **연결**: `app/src/engine/ondevice.ts`가 Web Worker(`ondevice.worker.js`)에서 이 폴더의 `src/web`을 돌리고, `ondevice-map.js`가 응답을 Arc로 바꾼다. 배포 빌드(`VITE_ENGINE=ondevice`)의 기본 엔진(11/21). 그냥 빌드는 mock(`app/src/engine/mock-core.js`), `?engine=mock|ondevice`로 바꿀 수 있음
- **모델 파일**: git에 넣지 않는다. 배포 빌드(`npm run build:deploy`)가 `MODEL_URL`과 `MODEL_SHA256`을 확인해 `dist/model/`에 풀고, 앱은 같은 도메인 `/model/…`에서 받는다(1년 immutable 캐시). `MODEL_URL`이 없으면 mock으로 동작. 스크립트 `app/scripts/fetch-model.mjs`

### 지금 모델 패키지 (11/26)
| | |
|---|---|
| 파일 | `chi2026-retriever-2026-11-26b.zip` (GitHub Release `model-2026-11-26b`) |
| 크기 | zip 28.5 MB, 풀면 47.6 MB, 파일 117개 (zip 안은 상대 경로만, 맨 위 폴더 없음) |
| `MODEL_SHA256` | `70a1a8bd2c3ee51aba680f7af35e35320cebf65b3c54a241a9489c1d09ee8ecc` |
| 소스 | 이 폴더 `src/package/`(Python), `src/web/`(JavaScript, 패키지의 `web/`) |
| 다시 만들기 | `python scripts/package_model.py` → `dist/chi2026-retriever/` (아래 "데이터 다시 만들기") |

패키지 안 `README.md`에 입력·출력 JSON과 화면별 예시(`arc_examples/`)가 있다. JavaScript로 바로 돌려 보기:
```bash
node web/cli.mjs arc '{"screen": "start"}'          # 패키지를 푼 폴더에서
```

### Q&A 시드 질문 (14)
엔진이 14 화면에 주는 `questions`(시작 질문)는 **LLM(Qwen2.5-7B-Instruct)이 초록을 읽고 미리 쓴 것**이다(`scripts/gen_summaries.py` → `summaries.json`의 `questions`). 사람이 보낸 질문이 아니므로:
- 앵글 엔진 출력에서는 `{"text": "...", "votes": 0, "seed": true}`로 표시돼 있다. `seed: true`는 사용자 질문과 섞지 말고 빼거나 "Suggested"로 따로 보여 준다
- 투표 수·질문 수·테마(14d `questions` 화면)를 셀 때도 넣지 않는다. 14d `questions` 화면에는 사용자 질문만 넣는다
- 투표와 게시는 앱의 Q&A 서비스 몫이고 이 모델은 다루지 않는다

### 라이선스
| 모델 | 쓰임 | 라이선스 |
|---|---|---|
| `BAAI/bge-m3` | 파인튜닝한 교사 인코더. 논문 벡터를 미리 계산하고, 폰용 정적 인코더(`encoder.json`)가 이것을 증류함 | MIT |
| `BAAI/bge-small-en-v1.5` | 폰용 정적 인코더의 토크나이저와 시작점(student base) | MIT |
| `Qwen/Qwen3-14B` | 빌드 때만: 결과 카드, 일반어, 넓은 이름(`gen_findings`, `gen_concepts`, `gen_results`). 앱에는 들어가지 않음 | Apache 2.0 |
| `Qwen/Qwen2.5-7B-Instruct` | 빌드 때만: 합성 질의, 한 줄 요약과 시드 질문, 확장어(`gen_queries`, `gen_summaries`, `gen_expansions`, `name_clusters`, `gen_offtopic`) | Apache 2.0 |

프로그램 데이터는 ACM CHI 2026 공식 피드, CC BY-NC-SA 4.0.

패키지 파일별:
| 파일 | 라이선스 |
|---|---|
| 코드, 인코더(`encoder.json`, `static_*.npy`), `config.json` | MIT. 인코더는 우리가 만든 것으로, 파인튜닝한 bge-m3(MIT)에서 증류 |
| `tokenizer.json`, `tokenizer_config.json` | MIT, `BAAI/bge-small-en-v1.5` 그대로 |
| `web/vendor/tokenizers.min.mjs` | Apache 2.0, npm `@huggingface/tokenizers` 그대로 |
| `program.json`, `papers.json`, `venue.json`, `program_*.npy` | CC BY-NC-SA 4.0 (프로그램 데이터와 그 초록의 벡터) |
| 결과 카드 `angles.json`, `phrase_*.npy`, `summaries.json`, `expansions.json`, `clusters.json` | CC BY-NC-SA 4.0 (초록 인용에서 나온 것). 쓴 Qwen 모델(Apache 2.0)은 출력물에 권리를 주장하지 않음 |

### 폴더 구성
| 폴더 | 내용 |
|---|---|
| `src/package/` | 패키지의 Python 코드: `retriever.py`(검색), `explorer.py`(기관·나라·저자로 찾기), `arc.py`(Arc 경로·장소·시간), `angles.py`(Supports·Reframes·Challenges, 화면별 응답) |
| `src/web/` | 같은 모델의 JavaScript 버전(폰 브라우저). `load.mjs`가 진입점, `cli.mjs`는 명령줄 |
| `src/config.py` | 경로·모델 이름 공통 설정 |
| `scripts/` | 데이터·모델 만들기(`gen_*` LLM 생성, `train_*` 학습, `build_*` 조립, `eval_*` 평가, `package_model.py` 패키지). `.slurm`은 GPU 노드용 |
| `tests/` | 케이스와 실행기. Python 케이스 검사와 Python↔JavaScript 일치 검사 |
| `docs/` | `angle_model.md`(앵글 엔진 설명과 평가), `arc_api.md`(화면별 API), `ondevice_eval.md`(폰 인코더), `training_report.md`(학습) |

### 데이터 다시 만들기
모든 명령은 이 폴더(`recsys/`)에서 실행한다. `data/`, `models/`, `dist/`는 git에 없다. GPU 단계는 SLURM `sbatch`이고, GPU 한 장이면 `.slurm` 안의 `python …` 줄을 직접 돌려도 된다.
```bash
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
# 0. 원본: 공식 CHI 2026 피드를 data/raw/chi2026_latest.json에 둔다 (저장소 루트의 npm run data:fetch가 받는 것과 같은 피드)
python scripts/preprocess.py                         # data/processed/corpus.json
python scripts/build_program.py                      # data/processed/program.json, venue.json (발표 2,782개, 방·층)

# 1. 검색 인코더 (docs/training_report.md, docs/ondevice_eval.md)
sbatch scripts/gen_queries.slurm                     # 합성 질의 (Qwen2.5-7B)
sbatch scripts/train_retriever.slurm                 # bge-m3 교사 파인튜닝
python scripts/embed_program.py                      # 교사로 전체 발표 벡터 → models/program_emb.npy
sbatch scripts/train_light.slurm --deploy static_d256 --dim 128   # 폰용 정적 인코더 증류
sbatch scripts/gen_expansions.slurm                  # 확장어
python scripts/build_clusters.py && python scripts/build_subclusters.py && sbatch scripts/name_clusters.slurm   # 주제 묶음과 이름
sbatch scripts/gen_offtopic.slurm && python scripts/train_relevance.py   # 주제 밖 판정 (묶음을 씀)
sbatch scripts/gen_summaries.slurm                   # 한 줄 요약과 14 시드 질문 (Qwen2.5-7B)

# 2. 앵글 엔진 (docs/angle_model.md)
sbatch scripts/gen_findings.slurm                    # 결과 카드 (Qwen3-14B)
python scripts/build_angles.py                       # 원문 확인, offsets, 종족, 데뷔
sbatch scripts/gen_concepts.slurm                    # 일반어
CHI_TASK=claims sbatch scripts/gen_concepts.slurm    # 질문 말투 claim
sbatch scripts/gen_results.slurm                     # 넓은 이름, 방향 재확인, 놓친 결과 (11/21, Support 늘림)
sbatch scripts/gen_valence.slurm                     # 결과가 좋아졌나 나빠졌나, 요인이 시험한 것인가 (11/25, Trade-off Challenge)
sbatch scripts/gen_card_questions.slurm              # 결과가 답하는 참석자 질문 (11/25, Support 늘림, valence 다음)
sbatch scripts/gen_card_summary.slurm                # 결과 카드마다 한 문장 요약 (11/25 저녁, 이유 문장)
python scripts/build_angles.py                       # 위를 모두 합쳐 data/processed/angles.json
python scripts/eval_angles.py                        # docs/angle_eval.json

# 3. 패키지와 검사
python scripts/package_model.py                      # dist/chi2026-retriever/
python tests/run_cases.py && python tests/run_arc_cases.py && python tests/run_angle_cases.py
python tests/web_reference.py && node tests/run_web_parity.mjs   # JavaScript = Python
```
LLM 생성 단계는 샤드 파일에 이어 쓰므로 다시 돌리면 끝난 항목은 건너뛴다. LLM 출력은 실행마다 조금 달라질 수 있어서, 같은 패키지를 그대로 원하면 Release zip을 쓴다.

11/25 검사 결과: Python↔JavaScript 일치 266/266, Arc 80/80, 검색 42/42, 앵글 39/40 ("How do people track their sleep?" 화요일 Arc가 7개가 아니라 6개, 11/22부터 그대로). 11/22에 바뀐 것은 `docs/angle_model.md`의 "결과 문장만 근거로, 종족은 입력한 말로", 11/25에 바뀐 것은 "Challenge가 나오게, 판정은 더 정확하게".

### 11/25에 앱이 알아야 할 것
- **새 Challenge subtype `cost`** (라벨 "Trade-off", 이유 문장 "A cost of the same thing." + 그 결과의 한 문장 요약): 질문의 X가, 그 연구가 시험한 그대로, 다른 결과를 나쁘게 만든 발표. Figma 22의 Challenge 설명("Same question, a different finding")보다 넓어서 문구는 디자인 확인이 필요하다. `meta` 화면의 `subtypes`에 라벨이 있다
- **새 화면 `mine`** ("Did you submit a paper?"): `{"screen": "mine", "name": "metatla"}` → 이름이 그렇게 시작하는 CHI 2026 저자와 발표(악센트 무시, 8명까지, `more`는 나머지 수). `{"screen": "mine", "paper": id}` → 그 논문 결과로 만든 질문 3개까지(`question`, 근거 `sentence`). Arc는 그 질문으로 `arc` 화면을 부르고 `"mine": [저자의 발표 id]`를 넘기면 자기 발표는 정류장에서 빠진다
- **Support가 늘었다**: 결과 카드마다 LLM이 미리 쓴 "이 결과가 답하는 질문"과 사용자 질문이 가까우면 Support가 된다. 48개 질문에서 precision 0.65 → 0.70, recall 0.19 → 0.28. 응답 형식은 그대로다
- **주제어 Arc**: 주제어("AI Companions")를 좁힐 때 세 각도가 가장 많이 채워지는 질문을 고른다(팀 제안 3번). `ask`의 제안 순서도 이 순서다. 주제어 98개에서 Challenge 있는 Arc 9% → 20%, Support 있는 Arc 55% → 77%, 11/25 저녁에는 Support 88%, 두 각도 이상 94%. "A and B", "A for B" 같은 입력은 "Does A improve B?"를 먼저 제안한다
- **이유 문장(why)**: 각도별 첫 문장("Goes the way your question expects.", "Found the other way." 등)에 그 결과를 LLM이 미리 요약한 한 문장을 붙인다. 미리 쓴 질문으로 Support가 된 경우는 "Answers yes to “…”"가 붙는다. 응답 형식은 그대로, 문장만 바뀐다
- **문장 위치**: `sentence.start`, `end`, `highlight`는 Python처럼 문자(code point) 단위다. 초록에 "𝑛" 같은 확장 문자가 있는 15개 발표에서 JavaScript가 한 글자씩 밀려 인용하던 것을 고쳤다. 앱에서 위치로 강조할 때는 `Array.from(abstract)`로 자르면 맞는다

## 아래는 옛 플래너 때 문서 (2026-11-20 전)

ARC에서 추천이 맡는 일과, 다른 부분과 맞춰야 할 것을 정리한 문서입니다.

## 추천의 역할

```
              ┌─ 서버 (저장·로그 없음) ─┐   ┌──────────── 기기 안 ────────────┐
연구 문장 ──▶ │ 추천 모델 (recsys/)      │──▶│ 개인 조정 ──▶ 플래너 ──▶ 화면     │
              └──────────────────────────┘   │   ▲  기관·나라 등              │
                                             └───┴────────────────────────────┘
```

- 추천은 **무엇이 관련 있는지만** 판단합니다. 시간·방·겹침·이동은 플래너가 처리하므로 신경 쓰지 않아도 됩니다
- 추천 결과는 **발표**와 **만나볼 사람** 두 가지. 평소 분야 밖이지만 연결되는 발표(새로운 곳, wild)도 포함
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
| `papers.json` | 발표 2,782개. `key`(`chi2026:223018`), `type`(Paper·Posters·…), `title`, `abstract`, `authors[]`(`name`, `institutionKey`·`institution`·`country`: 첫 소속, `affiliations[]`: 모든 소속의 `institutionKey`·`institution`·`country`), `doi`, `video`, `scheduled`(false = 원격 전용), `slots[]` |
| `sessions.json` | 세션 이름(사람이 붙인 주제), 소속 발표 키 |
| `topics.json` | 세션 이름 기반 주제 241개 (너무 잘게 나뉨, 개념 체계 참고용) |
| `aliases.json` | 기관 (ROR 공식 기관으로 정리됨) |

한 줄에 한 레코드라 `JSON.parse` 한 번이면 됩니다 (Python: `json.load`).

### 3. 출력을 플래너에 넣어 보기
계약 `contracts/RecommendResponse.schema.json` 0.1.0이 나왔습니다 (예시 `contracts/examples/RecommendResponse.chi2026-tuesday.json`). 플래너 도구는 아직 이 짧은 형식을 받습니다:
```json
[
  { "paperKey": "chi2026:223509", "relevance": 0.9 },
  { "paperKey": "chi2026:222592", "relevance": 0.6 }
]
```
```bash
node tests/legacy/planner/try.mjs my-output.json            # 학회 전체 일정
node tests/legacy/planner/try.mjs my-output.json --day 2026-04-14
```
예시: `tests/legacy/planner/examples/accessibility.json`

## 입력과 처리 위치
여러 입력으로 더 정확하게 추천하되, 개인을 알아볼 수 있는 조합이 기기 밖으로 나가지 않게 나눕니다.

| 입력 | 처리 위치 | 쓰임 |
|---|---|---|
| 자유 연구 문장 | 서버 모델 (저장·로그 금지) | 관련 발표·사람·개념 |
| 기관 | **기기** | 같은/다른 기관 저자 조정, 만나볼 사람. 값은 `inst:ror-<id>` (V0 기관 검색) |
| 나라 | **기기** | 같은/다른 나라 조정, 새로운 곳 섞기. 값은 ISO 국가 코드 (정리 필요) |
| (추가 예정 항목) | 정하는 중 | |

- 서버에는 **연구 문장만** 보냅니다. 기관·나라는 함께 보내지 않습니다 (문장 + 기관 + 나라 조합은 사실상 특정인)
- 모델을 기기에서 돌릴 수 있으면 연구 문장도 안 보내도 됨 → "실행 위치" 결정과 같이 논의
- 기기 안 조정은 data/build에 이미 있는 저자 기관(`authors[].institutionKey`)과 저자 나라(`authors[].affiliations[].country`, 모든 소속)로 계산 가능
- 나라는 기관에서 추론하지 않음: 같은 기관이 여러 나라에 있음 (CMU 카타르, Microsoft Research 케임브리지 등, chi2026 38곳). 표기는 USA·UK·South Korea만 맞추고 Hong Kong·Macao·China는 저자가 쓴 그대로. 홍콩·마카오는 검색 필터에서 묶어 처리

## 만나볼 사람 추천
- 공식 피드에는 참가자 명단이 없으므로 추천 대상은 **저자·발표자·좌장**뿐 (`people.json`)
- `people[].appearances`(시각순 발표·좌장 일정)로 "언제 어디서 만날 수 있는지"까지 연결 가능
- 사람 키도 `edition:id` (예: `chi2026:214026`)

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
- [ ] **near / adjacent / wild**: 각각의 정의와 비율 (예: 상위 10개 중 6/3/1?). wild(새로운 곳)는 기기 안 조정(다른 기관·나라)과 어떻게 나눌지
- [ ] **사람 추천**: 서버 모델이 사람 목록까지 주는지, 발표 추천에서 기기가 저자를 뽑는지. 사람별 관련도·이유 형식
- [ ] **징검다리 경로**: 무엇과 무엇을 잇는지, 출력 모양 (예: 연구 문장 → 개념 A → 개념 B → 발표)
- [ ] **개념 체계**: 개념 ID를 어떻게 만드는지, 해(edition)가 바뀌어도 유지되는지
- [ ] **이유 인용 형식**: 초록 어느 부분인지 (문자 위치 시작·끝 vs 문장 번호)
- [ ] **몇 개를 돌려주는지**: 상위 N개 (플래너는 200개까지 노트북 1ms 이내, 휴대폰은 V3에서 측정)
- [ ] **입력 언어**: 한국어 연구 문장도 받는지
- [ ] **기기 안 조정 방식**: 기관·나라를 관련도에 어떻게 섞는지 (모델 쪽에서 규칙을 줄지, 앱에서 정할지)
- [ ] **실행 위치**: 서버 함수(`functions/`) vs 브라우저. 모델 크기, 언어(Python?), 의존성, 실행 비용

### 만들어서 줄 것
- [ ] 위 결정 사항 메모 (Dongchan의 계약 설계와 맞추기)
- [ ] 모델 실행 방법 (명령 한 줄, 입력 → 출력 JSON)
- [ ] V1 평가용: 페르소나 10명(`tests/recsys/personas.json`, 팀원 3명 실제 연구 포함)의 출력. 기준선(TF-IDF+LSA)과 같은 평가표로 비교함 (이슈 #2)
- [ ] 측정값: 응답 시간, 결정성 (같은 입력 2회 → 같은 결과인지)

## 일정
- 기술 검증 마일스톤 마감 **2026-11-04** (V1 추천 품질 #2 포함)
- 계약이 확정되면 `contracts/examples/RecommendResponse.<이름>.json`으로 출력 예시를 넣고 `npm run contracts:check`로 검사
