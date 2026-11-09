@echo off
setlocal
cd /d "%~dp0"
echo [HeroLand] Stop the game server and website before migration.
echo [HeroLand] Legacy folders will be kept in retail\migration-backups.
node Server\tools\migrate-stage30.js --apply
if errorlevel 1 goto failed
echo [HeroLand] Migration completed. Start START_SERVER.bat.
pause
exit /b 0
:failed
echo [HeroLand] Migration stopped. Resolve the reported conflict before retrying.
pause
exit /b 1
