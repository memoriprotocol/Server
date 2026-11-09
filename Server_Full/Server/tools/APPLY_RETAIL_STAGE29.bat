@echo off
setlocal EnableExtensions DisableDelayedExpansion
set "ROOT=%~dp0..\.."
cd /d "%ROOT%" || exit /b 1
echo [HeroLand] Stage29: moving reference-only files to retail...
if not exist "retail\previous_root_files" mkdir "retail\previous_root_files"
call :move "ALL_NPCS_3127.json" "retail\npcs\ALL_NPCS_3127.json"
call :move "ALL_NPCS_3127.csv" "retail\npcs\ALL_NPCS_3127.csv"
call :move "ALL_NPCS_PLACEMENTS_3127.csv" "retail\npcs\ALL_NPCS_PLACEMENTS_3127.csv"
call :move "COVERAGE_STAGE11_226.json" "retail\audits\COVERAGE_STAGE11_226.json"
call :move "MAP2_GIFT_STAGE25_AUDIT.json" "retail\audits\MAP2_GIFT_STAGE25_AUDIT.json"
call :move "MAP2_STAGE26_AUDIT.json" "retail\audits\MAP2_STAGE26_AUDIT.json"
call :move "STAGE27_AUDIT.json" "retail\audits\STAGE27_AUDIT.json"
call :move "STAGE28_AUDIT.json" "retail\audits\STAGE28_AUDIT.json"
call :move "PROTO_TYPES_FROM_CLIENT_3127.json" "retail\client-reference\PROTO_TYPES_FROM_CLIENT_3127.json"
call :move "Server\config\client-native-assets-3127.json" "retail\client-reference\client-native-assets-3127.json"
call :move "README_STAGE25_RU.txt" "retail\release-notes\README_STAGE25_RU.txt"
call :move "README_STAGE26_RU.txt" "retail\release-notes\README_STAGE26_RU.txt"
call :move "README_STAGE27_RU.txt" "retail\release-notes\README_STAGE27_RU.txt"
call :move "README_STAGE28_RU.txt" "retail\release-notes\README_STAGE28_RU.txt"
echo [HeroLand] Completed. Documentation: retail\README_RU.txt
pause
exit /b 0

:move
if not exist "%~1" goto :eof
if exist "%~2" (
  fc /b "%~1" "%~2" >nul 2>nul
  if not errorlevel 1 (
    del /q "%~1"
    echo [retail] Removed identical old reference: %~1
    goto :eof
  )
  if exist "retail\previous_root_files\%~nx1" (
    echo [retail] Conflict; leaving file in place: %~1
    goto :eof
  )
  move "%~1" "retail\previous_root_files\%~nx1" >nul
  echo [retail] Preserved locally changed version: %~1
  goto :eof
)
for %%D in ("%~dp2.") do if not exist "%%~fD" mkdir "%%~fD"
move "%~1" "%~2" >nul
echo [retail] Moved old reference: %~1
goto :eof
