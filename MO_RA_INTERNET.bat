@echo off
cd /d "%~dp0"
"%~dp0native\node.exe" "%~dp0connect-public.cjs"
pause
