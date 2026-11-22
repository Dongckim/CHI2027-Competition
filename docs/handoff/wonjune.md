# 원준에게: 모델 쪽에서 고칠 것 (2026-11-22)

모델 `model-2026-11-21`(sha256 461f38e4…)을 앱에 연결하며 찾은 것이다. 근거와 숫자는 docs/validation/V9-ondevice.md에 있다.
앱은 지금 어댑터(`app/src/engine/ondevice-map.js`)에서 임시로 막아 두었다. 모델이 고쳐지면 어댑터의 임시 코드를 지운다.

## 꼭 고칠 것

1. **시각이 2시간 늦다.**
   - 원인: 패키지가 피드의 epoch ms를 진짜 UTC로 읽는다.
     - 예: 세션 225080. 원본은 09:00Z인데, 패키지는 `2026-04-14T11:00:00+02:00`이다.
     - 우리 결정 001(docs/decisions/001)은 피드 값을 개최지 벽시계로 본다. 실제 시작은 바르셀로나 09:00이다.
   - 영향: "지금 이후 발표", 12b 앞뒤 90분, 걷는 시간 계산이 모두 2시간 밀린다.
   - 앱의 임시 처리: 엔진에 주는 `now`를 같은 만큼 민다(`engineNow`).
   - 고치면 `tests/engine/ondevice.test.mjs`가 실패하면서 `engineNow`를 지우라고 알려 준다.

2. **Challenge 카드에 목표 문장이 `result`로 들어 있다.**
   - 예: 222623 "This study investigated how haptic feedback influences …". status `result`, effect `no_effect`로 적혀 있다.
   - 우리 규칙(#52): Challenge는 그 연구 자신의 결과 문장만 쓴다.
   - 앱의 임시 처리: 다음 문장은 Challenge에서 빼고 Reframe(Same subject)으로 둔다(`resultQuote`).
     - 초록 첫 문장
     - 목표 문장("This study …", "We explore …")
     - 선행 연구, 연구 공백 문장
   - 부탁: `gen_findings`에서 status를 판정할 때 목표·배경 문장을 `aim`/`prior`로 분류해 달라.

3. **패키지 초록이 앞뒤 공백을 지운 것이다.**
   - Python `strip()` 때문에 공식 피드와 10개 발표에서 위치가 1–4자 어긋난다.
   - 앱의 임시 처리: 우리 data/build 초록에서 같은 문장을 다시 찾는다(`onOurAbstract`, 15,484문장 모두 맞음).
   - 부탁: 초록은 피드 그대로 두고, 위치는 그 문자열 기준으로 달라.
   - 참고: 위치는 Python 코드포인트 기준이고, 앱이 UTF-16으로 바꾼다. 그대로 둬도 된다.

## 확인해 줄 것

4. **어색한 종족 3개**: 지금은 그대로 둔다(사용자 결정 「답 오기 전에는 그대로」).
   - "accessible indoor navigation for blind people" → Society (예상: Accessibility)
   - "privacy of smart home devices" → Learning (예상: Society)
   - "Robotics could be helpful to the human daily life?" → Design (예상: Devices)

5. **07b 조합 문장의 문법**: 앱이 `brokenQuestion`으로 깨진 문장을 걸러 낸다. 템플릿에서 고치면 걸러지는 문장이 줄어든다.
   - 동사 뒤 동사: "Do older adults improve participate in the gig economy?"
   - Do/Does를 마지막 단어로 정함: "Do digitalisation of public services improve …". 주어의 머리 명사는 "of" 앞(digitalisation)이다.

6. **계약과 인터페이스 추가분** (원준 확인 필요)
   - Arc 0.2.0: 노드의 선택 필드 `kind`(subject · factor · measure · people). 원준 엔진의 Reframe subtype(related → subject)에서 온다.
   - `tribeOf`의 선택 필드 `runnerUp`: 엔진의 2위 종족. 11 Change 목록 맨 위에 쓴다.
   - `wildcard`: 15의 Wildcard 칩. 원준 엔진의 `edit` + `filter: "wildcard"`로 연결했다.

7. **라이선스 두 칸** (README "Models and licences")
   - 원준 정적 인코더(`static_*.npy`, `encoder.json`)와 결과 카드(`angles.json`)
   - 앱에 들어가는 `recsys/src/web/vendor/tokenizers.min.mjs`: 파일 안에 라이선스 문구가 없다. 원본 패키지와 버전을 알려 줘.

8. **버전 이름**: 엔진이 내는 버전이 `2026-11-17`(angles.json의 version)이고, Release 이름은 `model-2026-11-21`이다. 앱의 Arc는 `ondevice@2026-11-17`로 저장된다. 의도한 것이면 그대로 둔다.

## 참고: 엔진 모양

- Support가 적다: 질문 14개에서 ↑10 ↻85 ⊣2. 원준 문서의 Support recall 0.14와 같다. Figma의 "2 support · 2 reframe · 1 challenge" 모양은 거의 나오지 않는다.
- 결과 문장이 없는 Reframe(Same subject)은 인용이 없다. 질문 3개는 노드 7개 중 1–2개만 인용이 있다.
- 14 Q&A 시드 질문(`seed: true`)은 쓰지 않는다(사용자 결정 「14 시드 질문: 계속 뺌」).
