# 원준에게: 모델 쪽에서 고칠 것 (2026-11-25, 모델 `model-2026-11-25` 반영 뒤)

`model-2026-11-22`(sha256 6388932f…, PR #80)을 앱에 붙여 검사한 결과다. 숫자는 docs/validation/V9-ondevice.md "새 모델" 절에 있다.
앱은 어댑터(`app/src/engine/ondevice-map.js`)에서 임시로 막아 둔 것이 있다. 모델이 고쳐지면 어댑터의 임시 코드를 지운다.

## 11/25 모델 (#94) 확인
- 패키지 sha·버전 맞음, 계약 오류 0, 엔진 Challenge가 앱 지도에 그대로 다 올라감(38문항 10 → 10).
- 남은 것: 주제만 적은 질문(우리 14개 중 12개)은 여전히 Challenge 0. 좁히는 질문이 방향 있는 꼴("Does X improve Y?")이면 나온다. 3번 부탁 그대로.
- 디자인 결정 대기(사용자·디자이너): `cost`(Trade-off)를 22 도움말 "Same question, a different finding."에 맞출지, `mine`(Did you submit a paper?) 화면은 Figma에 없어 앱에 아직 안 붙임.

## 고쳐진 것 (11/22 모델)
- Challenge 목표 문장: 222623은 엔진이 직접 Reframe(factor)으로 낸다. 앱의 `resultQuote`는 그대로 둔다(이중 안전장치).
- 어색한 종족 3개: indoor navigation → Accessibility & aging, smart home privacy → Society & communities, Robotics … daily life → Health & wellbeing.
- 라이선스: README "Models and licences"에 채움(인코더 MIT, 카드 CC BY-NC-SA 4.0, tokenizers.min.mjs Apache 2.0).
- 초록 공백: 엔진은 그대로, 앱의 재검색(`onOurAbstract`)이 맞다는 답. 그대로 둔다.

## 아직 고칠 것

1. **시각이 2시간 늦다** (11/22 모델에도 그대로).
   - 원인: 패키지가 피드의 epoch ms를 진짜 UTC로 읽는다. 세션 225080: 원본 09:00Z → 패키지 `2026-04-14T11:00:00+02:00`. 결정 001은 피드 값을 개최지 벽시계로 본다(실제 시작 바르셀로나 09:00).
   - 영향: "지금 이후 발표", 12b 앞뒤 90분, 걷는 시간 계산이 2시간 밀린다.
   - 앱의 임시 처리: 엔진에 주는 `now`를 같은 만큼 민다(`engineNow`). 고치면 `tests/engine/ondevice.test.mjs`가 실패하면서 알려 준다.

2. **방법 문장이 여전히 `result`로 들어 있다.**
   - 예: 230223 (mental health apps) "We assessed changes in subjective distress (SUDS), measured trust across five dimensions, and analyzed open-ended responses …" → status `result`, effect `no_effect`. 방법(We assessed / measured / analyzed) 문장이다.
   - 같은 발표의 진짜 결과 문장 "Overall, the human counselor condition received higher trust ratings, …"는 11-21 모델에서 Challenge였는데 11-22에서 빠졌다.
   - 부탁: `aim` 분류에 "We assessed/measured/analyzed …" 같은 방법 문장도 넣고, 결과 문장이 빠지지 않았는지 확인.

3. **Challenge가 거의 안 나온다.** 같은 질문 14개(V9)에서 ↑ 10 → 7, ⊣ 1 → 0. 화면 23 "No clear challenge"가 사실상 늘 나온다.
   - 11-21 모델도 Challenge는 2개뿐이었다. haptic(222623)은 목표 문장이라 앱이 Reframe으로 옮겼고, 진짜는 mental health 1개였다.
   - 그 1개가 사라진 이유: 엔진이 고른 좁힌 질문이 바뀌었다. "mental health apps" → 11-21 "Does large language models (LLMs) improve mental health support?"(230223이 반대 결과), 11-22 "How does mental health affect overall wellbeing?"(반대할 방향이 없음).
   - 14개 중 10개가 "How does X affect Y?"로 좁혀진다. 방향이 없는 질문에는 Support·Challenge가 거의 붙지 않는다. 좁힌 질문도 어색한 것이 많다("How does ta agent performance affect design implications?", "How do AI explanations affect daily life insights?").
   - 부탁: 좁힐 때 방향이 있는 질문("Does X improve Y?")과 반대 결과 카드가 있는 질문을 우선해 줄 수 있는지.

## 확인해 줄 것

4. **07b 조합 문장**: 문법 필터(`brokenQuestion`)에 걸린 문장 0/24(주제 8개). 다만 뜻이 어색한 것이 있다.
   - "How does device complexity affect effects?", "Does multi-agent system improve presence?"(관사), "Does presence reduce privacy concern?"
5. **계약과 인터페이스 추가분** (원준 확인 필요)
   - Arc 0.2.0: 노드의 선택 필드 `kind`(subject · factor · measure · people). Reframe subtype(related → subject)에서 온다.
   - `tribeOf`의 선택 필드 `runnerUp`: 엔진의 2위 종족. 11 Change 목록 맨 위에 쓴다.
   - `wildcard`: 15의 Wildcard 칩. `edit` + `filter: "wildcard"`로 연결했다.
6. **버전 이름**: 엔진 버전 `2026-11-22`, Release `model-2026-11-22`로 이제 같다. 앱의 Arc는 `ondevice@2026-11-22`로 저장된다.

## 참고: 엔진 모양
- 결과 문장이 없는 Reframe(Same subject)은 인용이 없다.
- 14 Q&A 시드 질문(`seed: true`)은 쓰지 않는다(사용자 결정 「14 시드 질문: 계속 뺌」).
