@echo off
cd /d "%~dp0"
type nul > "%~dp0private\stop-request"
"%~dp0native\node.exe" "%~dp0control.cjs"
pause
