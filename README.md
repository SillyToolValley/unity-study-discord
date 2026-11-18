# career-feed-bot

Unity · Unreal · Godot · 생성형 AI 관련 **채용, 해커톤, 공모전, 게임잼** 공고를 여러 사이트에서 모아 디스코드 커리어 채널에 올리는 봇입니다.

- 마감 캘린더: https://sillytoolvalley.github.io/unity-study-discord/
  - 구글·애플 캘린더 구독: 페이지 위쪽 "내 캘린더에 구독하기"

## 동작 방식

1. `config/sources.json`에 등록된 사이트를 정해진 시간에 돌며 공고 목록만 읽습니다. 모든 요청 전에 robots.txt를 확인하고, 막힌 곳은 건너뜁니다.
2. `config/topics.json`의 조건으로 거릅니다.
   - 채용: 신입·인턴·경력 3년 이하, 개발·기획·PM·AI 직무, 국내 또는 국가 제한 없는 원격 근무
   - 대외활동(해커톤·공모전·게임잼): 엔진·생성형 AI 관련이면 지역 제한 없음
3. 처음 보는 공고만 디스코드 웹훅으로 올립니다(한 번에 15건까지, 마감이 가까운 순).
4. 본 공고는 `data/items-*.json`에 기록해 같은 공고를 다시 올리지 않습니다.
5. 기록으로 마감 캘린더 페이지와 `.ics` 파일을 만들어 GitHub Pages에 올립니다.

| 실행 위치 | 대상 | 시간 |
|---|---|---|
| GitHub Actions (`.github/workflows/collect.yml`) | 공개 API·HTML로 읽을 수 있는 사이트 | 매일 09:37, 15:37, 21:37 (KST, GitHub 사정으로 늦어질 수 있음) |
| 운영자 PC (`scripts/run-local.cmd`, 작업 스케줄러) | 자바스크립트로 그려지는 사이트 (Aside 브라우저 사용) | 매일 09:10, 15:10, 21:10 (PC가 켜져 있고 main 브랜치일 때) |

- 마감일이 적혀 있지 않은 공고는 목록에서 마지막으로 본 뒤 10일이 지나면 캘린더에서 내립니다.
- 디스코드가 내용 문제로 거부한 공고는 기록에 `postError`를 남기고 건너뜁니다.

## 명령

```bash
npm run dry          # 클라우드 소스를 수집만 해 보고 게시·저장 안 함
npm run dry:local    # 이 PC 소스(Aside 필요)를 수집만 해 봄
npm run calendar     # site/ 폴더에 캘린더 페이지 생성
node src/run.js --runner cloud --dry-run --only <소스id>   # 소스 하나만 시험
```

## 소스 추가

`config/sources.json`의 `sources`에 항목을 추가합니다. 필드 설명은 같은 파일의 `_help`에 있습니다. 추가한 뒤 `--only <id> --dry-run`으로 공고가 제대로 읽히는지 확인하세요. robots.txt나 접속 차단 때문에 넣지 않은 사이트는 `_excluded`에 이유와 함께 적어 둡니다.

## 설정값

| 이름 | 위치 | 설명 |
|---|---|---|
| `DISCORD_WEBHOOK_JOBS` | 저장소 Secrets, PC의 `.env` | 채용 공고를 올릴 포럼(💼┃채용-알림) 웹훅 |
| `DISCORD_WEBHOOK_EVENTS` | 저장소 Secrets, PC의 `.env` | 해커톤·공모전·게임잼을 올릴 포럼(🏆┃대외활동-알림) 웹훅 |
| `DISCORD_WEBHOOK_URL` | 저장소 Secrets, PC의 `.env` | (선택) 위 둘 대신 한 채널에 모두 올릴 때 |
| `DISCORD_FORUM` | 저장소 Variables, PC의 `.env` | 포럼 채널이면 `1` (공고마다 글 하나) |
| `MAX_POSTS_PER_RUN` | 환경 변수 | 한 번에 올릴 최대 건수, 기본 15 |
