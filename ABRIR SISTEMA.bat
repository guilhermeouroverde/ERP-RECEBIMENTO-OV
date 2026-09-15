@echo off
chcp 65001 >nul
title Ouro Verde ERP
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo O Node.js nao foi encontrado neste computador.
  echo Instale o Node.js LTS e execute este arquivo novamente.
  echo Site oficial: https://nodejs.org
  echo.
  pause
  exit /b 1
)
start "" http://127.0.0.1:3213
node server.js
if errorlevel 1 pause
