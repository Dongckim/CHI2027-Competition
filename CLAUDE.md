# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# ARC (Academic Research Compass)
CHI 2027 Digital Experience Competition 출품작. 모바일 웹, 로그인 없음, 오픈소스, 비상업.
제출 마감 2026-12-04. 학회 2027-05-10~14, Pittsburgh (David L. Lawrence Convention Center).

## 현재 상태
- 빈 뼈대: 커밋 없음, 모든 폴더 비어 있음. 빌드·린트·테스트 명령은 도구 정해지면 여기에 추가
- git은 반드시 `arc/` 안에서 실행. 상위 `chi2027-arc/`는 자체 레포가 아니라 홈 디렉토리(`/Users/dongchankim`) 레포로 잡힘

## 현재 단계: 기능 검증 (화면 만들지 않음)
- Figma는 최종 디자인이 아님. UI 컴포넌트·스타일 작업 금지
- 검증은 CLI 스크립트 또는 /bench 테스트 페이지(무디자인)로만
- 모든 출력은 contracts/ 형식을 따를 것 (나중에 화면에 그대로 연결)
- 검증마다 docs/validation/Vn-이름.md에 기록: 가설 / 방법 / 통과 기준 / 결과(숫자) / 판정(통과·조건부·실패) / 다음 행동

## 데이터 원천: CHI 공식 프로그램 데이터 (유일한 데이터 원천)
- 안내: https://chidigitalexperience.org/programme-data/
- 스키마: https://chidigitalexperience.org/programme-data/schema/ , 기계용 /data/schema/v1.json
- 피드 (모두 같은 구조, schemeVersion 7, camelCase)
  - 개발 기준: /data/chi2026/latest.json (실제, 고정)
  - 견고성 테스트: /data/chi2025, chi2024, chi2023 (실제, 고정), /data/sandbox/latest.json (가짜)
  - 실서비스: /data/chi2027/latest.json (2027년 4월부터 공개, 그전엔 없음)
- 업데이트: version.json을 ?t=타임스탬프 붙여 조회 → 리비전이 바뀌었을 때만 revisions/NNN.json 받기
  - version.json 조회는 30초에 1번 이하 (권장 1분에 1번)
  - latest.json 반복 다운로드 금지, revisions 파일은 변하지 않으므로 영구 캐시
  - 호스팅이 모든 파일을 10분 캐시함 → latest.json은 최대 10분 늦을 수 있음
- 시간: epoch ms (시간대 없음). 화면 표시 시간대는 data/venue/<edition>.json의 IANA 시간대로 변환
  - chi2026 = Europe/Madrid, chi2027 = America/New_York
- ID: 정수, 같은 해(edition) 안에서만 고정 → 내부 키는 항상 edition과 함께 다룸 (예: chi2026:222795)
- 데이터 버전: publicationInfo.version (version.json의 리비전과 함께 기록)
- 제공되지 않는 것: 로그인, 참가자 명단, 논문 전문·PDF(→ DOI·ACM DL 링크만), status/last_modified 필드
- 라이선스: CC BY-NC-SA 4.0 (각 피드의 cc_licence 필드)
  - 화면에 출처 표기: "Programme data © ACM CHI 2027, licensed under CC BY-NC-SA 4.0." (연도는 사용 중인 edition)
  - data/ 아래 파생 데이터는 CC BY-NC-SA 4.0, 앱 코드는 MIT
- 문의: app@chi2027.acm.org (평면도 등)

## 원칙 (절대 어기지 말 것)
- 개인 데이터는 기기에만 저장 (DeviceState 하나로 통일). 계정·서버 저장 없음
- 서버는 무상태, 요청 내용 로그 금지
- AI는 공개 프로그램 데이터만 사용. 논문 내용을 지어내지 않음. 이유는 개념 ID + 초록 원문 인용
- 음성·대화 저장 금지 (자막은 화면 3줄만, 종료 시 삭제)
- 최소화 대상 아님: 테스트, contracts 스키마 검사, 공식 스키마 검사, 접근성, 개인정보 처리, 출처 표기

## 구조
- data/raw/<edition>/rev-<NNN>.json : 받은 원본 (수정 금지)
- data/build/<edition>/ : 정규화 결과 (단일 데이터 원천, 앱·추천·지니 모두 이것만 읽음)
- data/venue/<edition>.json : 시간대, 방·층, 랜드마크, 이동 시간 (해마다 교체)
- contracts/ : 기능 간 계약 JSON 스키마 (바꾸면 schema_version 올리고 CHANGELOG 기록)
- app/ : Vite + React + TS + Tailwind, 토큰은 app/src/tokens.css
- functions/ : 서버 함수 (Soniox 임시 키, 추천 API, 지니 API)
- recsys/ : 원준 추천 모델 (contracts만 맞추면 됨)

## 디자인
- 지금 Figma는 초안. 최종 디자인은 사용자가 따로 알려줄 때까지 아래 규칙은 적용하지 않음 (UI 작업 금지)
- Figma: https://www.figma.com/design/UfKtv7eGMTOrCZEzszq9GS (페이지: 피드백 반영본)
- 390×844 기준, 본문·입력창 16px, 터치 44px, 대비 4.5:1, safe area, dvh
- Figma 코드 초안은 그대로 쓰지 말고 app/src/components 부품으로 바꿔 끼울 것
- [대괄호] 자리는 contracts 데이터 필드로 연결

## 외부 문서
- 모르는 라이브러리 API는 Context7로 조회
- Soniox: https://soniox.com/docs (임시 키: /docs/guides/temporary-api-keys)
- Claude API 도구 호출은 기본 API 사용 (OpenAI 호환 주소 사용 금지)

## 작업 방식
- 단계마다 브랜치 stage/NN-이름, 끝나면 docs/stages/NN-이름.md 정리
- 중요한 결정은 docs/decisions/NNN-제목.md (이유 포함)
- 정리 문서 형식: ① 만든 것 ② 통과 기준 결과(숫자) ③ 결정과 이유 ④ 남은 문제 ⑤ 다음 단계가 알아야 할 것 ⑥ 비용·토큰
