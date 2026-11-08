@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Wallpaper.ps1" %*
set "rc=%errorlevel%"
echo.
if not "%rc%"=="0" echo Operation failed. Review the message above. Your backup is retained.
pause
exit /b %rc%