@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Wallpaper.ps1" -Restore %*
set "rc=%errorlevel%"
echo.
if not "%rc%"=="0" echo Restore failed. Review the message above. Your backup is retained.
pause
exit /b %rc%