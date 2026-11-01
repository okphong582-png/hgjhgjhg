@echo off
cd /d "%~dp0"
"%~dp0native\node.exe" "%~dp0run-vps.cjs"
pause
