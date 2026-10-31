@echo off
REM Starts the local game server (http://localhost:4173) and opens your browser.
REM Close this window to stop the game. Your progress is saved in the browser.
cd /d "%~dp0"
title Minnesota Mayhem
if not exist "dist\index.html" (
  echo The game has not been built yet - running setup first...
  call npm run build || ( pause & exit /b 1 )
)
node server.mjs --open
pause
