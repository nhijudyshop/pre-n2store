@echo off
echo.
echo  ATTENDANCE SYNC - SETUP
echo  ========================
echo.

:: Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found! Install from https://nodejs.org
    pause
    exit /b 1
)
for /f "tokens=*" %%a in ('node -v') do set NV=%%a
echo Node.js: %NV%

:: Check Firebase key
if not exist "serviceAccountKey.json" (
    echo [ERROR] Missing serviceAccountKey.json
    echo   Copy your Firebase service account key to this folder.
    pause
    exit /b 1
)
echo Firebase key: OK

:: Install dependencies
echo.
echo Installing dependencies...
call npm install --production
if errorlevel 1 (
    echo [ERROR] npm install failed
    pause
    exit /b 1
)
echo Dependencies: OK

:: Quick connection test
echo.
echo Testing device connection...
node test.js
echo.

:: Kill any existing instance
taskkill /f /fi "WINDOWTITLE eq attendance-sync" >nul 2>&1
for /f "tokens=2" %%a in ('wmic process where "commandline like '%%attendance-sync%%index.js%%'" get processid 2^>nul ^| findstr /r "[0-9]"') do taskkill /f /pid %%a >nul 2>&1

:: Create startup VBS with hardcoded absolute path
set "SYNC_DIR=%~dp0"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "STARTUP_VBS=%STARTUP_DIR%\attendance-sync.vbs"

echo Creating startup script...
> "%STARTUP_VBS%" echo Set sh = CreateObject("WScript.Shell")
>>"%STARTUP_VBS%" echo sh.CurrentDirectory = "%SYNC_DIR:~0,-1%"
>>"%STARTUP_VBS%" echo sh.Run "cmd /c node index.js >> logs\service.log 2>&1", 0, False
echo Startup: OK (runs on boot)

:: Start service NOW (hidden)
echo.
echo Starting service (hidden)...
if not exist "logs" mkdir logs
start "" wscript.exe "%STARTUP_VBS%"
echo Service: RUNNING

echo.
echo  ========================
echo  SETUP COMPLETE!
echo  - Service is running in background
echo  - Will auto-start on Windows boot
echo  - Use stop.bat to stop
echo  - Logs: %SYNC_DIR%logs\
echo  ========================
echo.
pause
