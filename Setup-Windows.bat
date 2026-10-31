@echo off
REM ==========================================================================
REM  Minnesota Mayhem - one-time setup for Windows
REM  1) installs dependencies   2) builds the game   3) creates a desktop shortcut
REM  Requires Node.js 20+ (https://nodejs.org). No admin rights needed.
REM  Nothing here disables Windows security features.
REM ==========================================================================
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)
echo Installing dependencies (first time only, needs internet)...
call npm install --no-audit --no-fund
if errorlevel 1 ( echo npm install failed. & pause & exit /b 1 )
echo Building the game...
call npm run build
if errorlevel 1 ( echo Build failed. & pause & exit /b 1 )
echo Creating desktop shortcut...
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\Minnesota Mayhem.lnk');$s.TargetPath='%~dp0Play-Minnesota-Mayhem.bat';$s.WorkingDirectory='%~dp0';$s.WindowStyle=7;$s.Description='Minnesota Mayhem';$s.Save()"
echo.
echo Done! Double-click "Minnesota Mayhem" on your desktop to play.
pause
