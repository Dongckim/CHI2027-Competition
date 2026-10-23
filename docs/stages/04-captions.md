# 04 실시간 자막 (V4)

브랜치 `stage/04-captions` · 이슈 #5 · 검증 문서 [V4-captions.md](../validation/V4-captions.md)

## ① 만든 것
- `functions/soniox-key.mjs`: Soniox 임시 키 발급 (60초, 1회용, 세션 최대 2시간, 기기별 시간당 6개, 하루 2,000개). 웹 표준 핸들러라 호스트 무관
- `app/src/captions/captions.js`
  - `sessionContext`: 세션의 공개 프로그램 데이터로 용어집 (저자 이름, 제목의 약어·합성어, 이름은 번역 안 함)
  - `createCaptions`: 원문·번역 자막. 미확정은 바꿔 끼우고 확정은 이어 붙임, 말이 멈추면(`<end>`)·사람이 바뀌면 새 문단, 스트림당 1,000자만 유지
  - `createConversation(a, b)`: 대면 대화. 양방향 번역 토큰의 언어로 두 사람 화면을 나눔
- `app/src/captions/soniox-languages.json`: Soniox stt-rt-v5 지원 60개 언어 (API에서 받음)
- 확인 페이지 (`npm run bench`, 키는 `.env.local`)
  - `tests/captions/bench.html`: 발표 자막 + 번역, 용어집 O/X, 발화자 표시, 지연·끊김·비용 측정
  - `tests/captions/conversation.html`: 휴대폰을 두 사람 사이에 눕혀 위아래로 나눈 화면, 각자 언어 선택
- `tests/serve.mjs`: 확인 페이지 서버 (venue 것을 옮김), `functions/`를 `/api/`로 연결, `.env.local` 읽음
- `tests/captions/latency.py`: 마이크 없이 지연 측정
- 테스트 7개 (전체 37/37)

## ② 통과 기준 결과
- 지연: 처음 글자 0.41초 (90% 0.46), 번역은 원문 확정 뒤 0.48초. 기준 약 2초 → 통과 (합성 음성, 마이크 없음)
- 용어집 효과: 측정 전 (측정표)
- 비용: $0.12/시간 (번역 포함) → 1인 하루 6시간 $0.72. 예산 미정
- 판정: 조건부 통과

## ③ 결정과 이유
- 음성은 우리 서버를 거치지 않음: 휴대폰이 임시 키로 Soniox에 직접 연결. 서버는 키만 발급하고 아무것도 기록하지 않음 (원칙: 서버 무상태, 로그 금지)
- 키는 WebSocket protocols 목록으로 전달: 시작 메시지의 `api_key`는 2027-01-15부터 거부됨
- Soniox SDK 대신 WebSocket 직접: 의존성 없이 60줄 정도. 오디오는 `MediaRecorder` 120ms 조각 + `audio_format: auto`
- 대면 대화는 발화자 분리 대신 언어로 나눔: 토큰마다 언어가 붙어 와서 목소리가 비슷해도 안 섞임. 대신 두 사람 언어가 같으면 안 됨
- 줄바꿈은 브라우저가: 글자 수로 자르면 한국어처럼 넓은 글자가 화면 밖으로 잘림. 모델은 문단만 넘기고, 화면은 마지막 3줄만 보이게 잘라냄 (한국어는 단어 단위)
- 제한 카운터는 메모리에만: 호스트가 정해지지 않아서. 진짜 상한은 Soniox 콘솔 지출 한도

## ④ 남은 문제
- 실제 발표 영상 측정표 6줄 (용어집 효과, 번역 품질, 화면 꺼짐·앱 전환 끊김), 발화자 분리 정확도
- 휴대폰 실기기 (마이크에 HTTPS 필요 → V3)
- 화면이 꺼지거나 앱을 바꾸면 연결이 끊길 수 있음. 자동 재연결 없음 (다시 Start, 키 1개 더 씀)
- 기기 구분이 IP 기준이라 학회장 와이파이(같은 IP 여러 명)에서는 시간당 6개가 모자랄 수 있음 → V8에서 호스트의 제한 기능으로
- 문단이 너무 잘게 나뉘면 `max_endpoint_delay_ms` 조정
- 1인 하루 예산 금액

## ⑤ 다음 단계가 알아야 할 것
- 자막 텍스트는 어디에도 저장하지 않음 (계약에도 넣지 않음). Stop = `clear()`
- CaptionSession 계약 후보: 세션 키, 모드(발표/대면), 언어(들), 용어집 사용, 상태(연결 중·듣는 중·끊김·종료)
- 키 발급은 `POST /api/soniox-key` → `{ apiKey, expiresAt, sessionMaxSeconds }`. 60초 안에 연결해야 함
- 지원 언어가 바뀌면 `soniox-languages.json`을 `GET /v1/models`로 다시 받기
- 문서 기준 모델 `stt-rt-v5`

## ⑥ 비용·토큰
- Soniox: 개발 중 측정·확인 몇 분 (1센트 미만)
- Claude 토큰: 측정하지 않음
