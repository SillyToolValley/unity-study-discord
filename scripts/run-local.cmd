@echo off
rem Collect JS-rendered career sites with the Aside browser on this PC and post new items.
rem Run by Windows Task Scheduler (task "career-feed-local"). Needs Aside running and
rem DISCORD_WEBHOOK_URL in .env. Output goes to local-run.log (not committed).
cd /d "%~dp0.."
set LOG=local-run.log
echo ==== %date% %time% >> %LOG%
git pull --rebase --autostash >> %LOG% 2>&1
node --env-file-if-exists=.env src/run.js --runner local >> %LOG% 2>&1
set RUN_EXIT=%ERRORLEVEL%
git add data/items-local.json >> %LOG% 2>&1
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "chore: update locally collected items" >> %LOG% 2>&1
  git pull --rebase --autostash >> %LOG% 2>&1
  git push >> %LOG% 2>&1
)
echo exit %RUN_EXIT% >> %LOG%
exit /b %RUN_EXIT%
