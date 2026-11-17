# 이 PC에서 Aside 소스를 수집해 게시한다. Windows 작업 스케줄러에 등록해서 쓴다.
# 전제: Aside 브라우저가 켜져 있고, 프로젝트 폴더의 .env에 DISCORD_WEBHOOK_URL이 있다.
# 클라우드 쪽 수집 기록과 중복을 맞추려고 실행 전후로 저장소를 동기화한다.
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent)

git pull --rebase --autostash
node --env-file-if-exists=.env src/run.js --runner local
$runExit = $LASTEXITCODE

git add data/items-local.json
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git commit -m "chore: update locally collected items"
  git pull --rebase --autostash
  git push
}
exit $runExit
