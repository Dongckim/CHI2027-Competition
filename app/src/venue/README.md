# venue: 길 안내 (현재 메뉴에 없음)

S5·S5b에서 만든 학회장 길 안내(09 Getting there, 3D 평면도, Hear the turns)입니다. 결정 006 이후 Arc 메뉴에는 없고,
옛 화면 주소(`#/directions/<paperKey>`, `#/directions/place/<id>`)로만 열립니다. 코드는 지우지 않습니다.

- 경로 계산 `route.js` (프로그램을 불러올 때 `data/load.ts` → `planner/plan.js`의 이동 시간 계산으로 Arc 쪽도 import함), 문장 `directions.js`, 걷는 시간 `walk.js`, 장소 `places.js`, 3D `view3d.js`, 소리 `sound.js`
- 데이터: `data/venue/ccib.json`(공식 평면도, 결정 003·005)
- 기록: `docs/stages/legacy-planner/S5-wayfinding.md`, `S5b-directions-entry.md`, 검사 `tests/legacy/venue/`
