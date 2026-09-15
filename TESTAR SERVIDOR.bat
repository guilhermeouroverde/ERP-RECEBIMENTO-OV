@echo off
chcp 65001 >nul
cd /d "%~dp0"
node --version
node server.js
pause
