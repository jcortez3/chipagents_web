@echo off
setlocal
set "CA_APP=%~dp0"
set "CA_DESKTOP="
for /f "usebackq delims=" %%D in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"`) do set "CA_DESKTOP=%%D"
if not defined CA_DESKTOP set "CA_DESKTOP=%USERPROFILE%\Desktop"
set "WSLENV=CA_APP/p:CA_DESKTOP/p:%WSLENV%"
set PORT=

echo Looking for a free port ...
for /f "delims=" %%p in ('wsl.exe -- bash -lc "bash \"$CA_APP/ca-freeport.sh\" 4242 4299"') do set PORT=%%p

if "%PORT%"=="" goto :noport
if "%PORT%"=="none" goto :noport

echo Starting ChipAgents web on port %PORT% ...
start "" http://localhost:%PORT%/hub
wsl.exe -- bash -lc "cd \"$CA_DESKTOP\" && export NODE_EXTRA_CA_CERTS=$HOME/certs/adi-ca-bundle.pem && export CHIPAGENTS_DISABLE_UID_CHECK=true && HUB_PORT=%PORT% ~/.local/bin/chipagents web"
goto :done

:noport
echo ERROR: no free port found in range 4242-4299.
echo An existing instance may already be running - check your browser tabs.

:done

echo.
echo ChipAgents web stopped.
pause
