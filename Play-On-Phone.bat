@echo off
REM Starts the server on your local network so a phone on the same Wi-Fi can play.
REM Windows may ask whether to allow Node.js on private networks: choose "Private networks" only.
cd /d "%~dp0"
title Minnesota Mayhem (LAN)
if not exist "dist\index.html" ( call npm run build || ( pause & exit /b 1 ) )
node server.mjs --lan --open
pause
