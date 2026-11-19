@echo off
rem Collect JS-rendered career sites with the Aside browser on this PC and post new items,
rem then start the cloud collection on GitHub Actions (its own schedule is often late or skipped).
rem Run by Windows Task Scheduler (task "career-feed-local") through run-local-hidden.js.
rem Needs DISCORD_WEBHOOK_JOBS / DISCORD_WEBHOOK_EVENTS in .env and the GitHub CLI signed in.
rem Output goes to local-run.log (not committed). Exit code 1 means something failed; see the log.
setlocal
cd /d "%~dp0.."
set LOG=local-run.log
set RUN_EXIT=0
echo ==== %date% %time% >> %LOG%

rem State is read from and pushed to main only. On another branch, skip local collection.
set BRANCH=
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set BRANCH=%%b
if not "%BRANCH%"=="main" (
  echo skip local collection: checked out branch is "%BRANCH%", not main >> %LOG%
  set RUN_EXIT=1
  goto cloud
)

rem Without the cloud runner's latest state we could post duplicates, so skip if the pull fails.
git pull --rebase --autostash >> %LOG% 2>&1
if errorlevel 1 (
  echo skip local collection: git pull failed >> %LOG%
  set RUN_EXIT=1
  goto cloud
)

rem The Aside app must be running. Start it minimized if it is not, and wait up to a minute.
set ASIDE_WAIT=0
:aside_check
aside repl "console.log('CF_READY')" 2>nul | find "CF_READY" >nul
if not errorlevel 1 goto aside_ready
if "%ASIDE_WAIT%"=="0" (
  echo Aside is not running; starting it >> %LOG%
  start "" /min "%ProgramFiles%\Aside\Application\Aside.exe"
)
set /a ASIDE_WAIT+=1
if %ASIDE_WAIT% gtr 12 (
  echo Aside did not become ready >> %LOG%
  goto aside_ready
)
ping -n 6 127.0.0.1 >nul
goto aside_check
:aside_ready

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
if "%AHEAD%"=="0" goto cloud
set /a TRIES+=1
git push origin main >> %LOG% 2>&1
if not errorlevel 1 goto cloud
if %TRIES% geq 3 goto pushfail
git pull --rebase --autostash >> %LOG% 2>&1
goto push

:pushfail
echo push failed 3 times; will retry next run >> %LOG%
set RUN_EXIT=1

:cloud
rem Start the cloud collection now. The scheduled cloud run skips itself if this one ran recently.
gh workflow run collect.yml --ref main >> %LOG% 2>&1
if errorlevel 1 (
  echo could not start the cloud collection >> %LOG%
  set RUN_EXIT=1
) else (
  echo started the cloud collection >> %LOG%
)

echo exit %RUN_EXIT% >> %LOG%
exit /b %RUN_EXIT%
