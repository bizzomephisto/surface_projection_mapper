@echo off
cd /d "%~dp0"
if exist "release\0.5.2\win-unpacked\Surface.exe" (
  start "" "release\0.5.2\win-unpacked\Surface.exe"
) else if exist "node_modules\.bin\electron.cmd" (
  call "node_modules\.bin\electron.cmd" .
) else (
  echo Install Node.js 22+, run npm install in this folder, then try again.
  pause
)
