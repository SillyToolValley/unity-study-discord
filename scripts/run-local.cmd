@echo off
rem Collect JS-rendered career sites with the Aside browser on this PC and post new items.
rem Run by Windows Task Scheduler (task "career-feed-local"). Needs Aside running and
rem DISCORD_WEBHOOK_JOBS / DISCORD_WEBHOOK_EVENTS in .env. Output goes to local-run.log (not committed).
setlocal
cd /d "%~dp0.."
set LOG=local-run.log
echo ==== %date% %time% >> %LOG%

rem State is read from and pushed to main only. On another branch, skip this run.
set BRANCH=
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set BRANCH=%%b
if not "%BRANCH%"=="main" (
  echo skip: checked out branch is "%BRANCH%", not main >> %LOG%
  exit /b 1
)

rem Without the cloud runner's latest state we could post duplicates, so stop if the pull fails.
git pull --rebase --autostash >> %LOG% 2>&1
if errorlevel 1 (
  echo skip: git pull failed >> %LOG%
  exit /b 1
)

node --env-file-if-exists=.env src/run.js --runner local >> %LOG% 2>&1
set RUN_EXIT=%ERRORLEVEL%

rem Commit only the state file, even if the owner has other changes staged.
git diff --quiet HEAD -- data/items-local.json
if errorlevel 1 git commit -m "chore: update locally collected items" -- data/items-local.json >> %LOG% 2>&1

rem Push whenever main is ahead of origin. This also retries a push that failed last time.
set TRIES=0
:push
set AHEAD=0
for /f %%n in ('git rev-list --count origin/main..HEAD') do set AHEAD=%%n
if "%AHEAD%"=="0" goto done
set /a TRIES+=1
git push origin main >> %LOG% 2>&1
if not errorlevel 1 goto done
if %TRIES% geq 3 goto pushfail
git pull --rebase --autostash >> %LOG% 2>&1
goto push

:pushfail
echo push failed 3 times; will retry next run >> %LOG%
set RUN_EXIT=1

:done
echo exit %RUN_EXIT% >> %LOG%
exit /b %RUN_EXIT%
