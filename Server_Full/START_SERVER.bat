@echo off
setlocal
cd /d "%~dp0"
set "HEROS_CITY_SPAWN_MODE=deferred"
echo [HeroLand] Map2 main city. Ctrl+R: restart server. Ctrl+C: stop.
where node >nul 2>nul
if errorlevel 1 goto missing_node
node server.js
set "EXITCODE=%ERRORLEVEL%"
echo [HeroLand] Server exited: %EXITCODE%
pause
exit /b %EXITCODE%
:missing_node
echo [HeroLand] Node.js 20 or newer required in PATH.
pause
exit /b 1
