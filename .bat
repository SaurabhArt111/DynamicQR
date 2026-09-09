@echo off
echo Starting services on network...
echo.
echo This will open 3 terminal windows:
echo.
timeout /t 2

REM Get the directory where this script is located
cd /d "%~dp0"

REM Start server in new window
echo Starting server...
start "server" cmd /k "cd server && npm run dev"
timeout /t 2

REM Start admin in new window
echo Starting admin...
start "admin" cmd /k "cd admin && npm run dev"
timeout /t 2

REM Start landing client in new window
echo Starting landing...
start "landing" cmd /k "cd landing && npm run dev"
timeout /t 2
