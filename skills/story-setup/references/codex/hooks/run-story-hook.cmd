@echo off
setlocal

set "EVENT=%~1"
if /I "%EVENT%"=="session-start" goto event_ok
if /I "%EVENT%"=="pre-tool-prose-guard" goto event_ok
if /I "%EVENT%"=="pre-tool-commit-advisory" goto event_ok
if /I "%EVENT%"=="pre-compact" goto event_ok
if /I "%EVENT%"=="post-compact" goto event_ok
if /I "%EVENT%"=="stop" goto event_ok
exit /b 2

:event_ok
set "HOOK=%~dp0story_codex_hook.py"
if not exist "%HOOK%" exit /b 0
for %%I in ("%~dp0..\..") do set "CODEX_PROJECT_DIR=%%~fI"

set "PYBIN="
for %%P in (python3 python py) do (
  if not defined PYBIN (
    %%P -c "" >nul 2>&1
    if not errorlevel 1 set "PYBIN=%%P"
  )
)
if not defined PYBIN exit /b 0

"%PYBIN%" "%HOOK%" "%EVENT%"
exit /b %ERRORLEVEL%
