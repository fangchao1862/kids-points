@echo off
cd /d %~dp0
if not exist node_modules (
  echo Installing dependencies, please wait...
  call npm install
)
echo Starting server...
start "" http://localhost:3000/admin
node server.js
pause
