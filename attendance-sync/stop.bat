@echo off
echo Stopping attendance-sync...
for /f "tokens=2" %%a in ('wmic process where "commandline like '%%attendance-sync%%index.js%%'" get processid 2^>nul ^| findstr /r "[0-9]"') do (
    taskkill /f /pid %%a >nul 2>&1
    echo Killed process %%a
)
echo Stopped.
pause
