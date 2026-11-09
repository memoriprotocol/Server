@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
echo HeroLand 3.12.7 - local item grant. STOP the game server first.
node Server/tools/grant-items.js
pause
