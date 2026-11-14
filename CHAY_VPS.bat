@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Mizze Connect
if exist "native\node\node.exe" (set NODE="native\node\node.exe") else (set NODE=node)
%NODE% --version >nul 2>&1 || (echo Chua co Node.js. Cai Node 20+ hoac dat node.exe vao native\node\ & pause & exit /b 1)
if not exist "native\xray.exe" (echo Thieu native\xray.exe. Chep xray.exe tu bo VPS cu vao thu muc native. & pause & exit /b 1)
:loop
%NODE% server.cjs
echo May chu da dung. Tu chay lai sau 5 giay (Ctrl+C de thoat)...
timeout /t 5 >nul
goto loop
