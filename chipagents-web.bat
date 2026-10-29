@echo off
setlocal
set WORKDIR=/mnt/c/Users/jcortez3/Desktop
set PORT=

echo Looking for a free port ...
set HELPER=/mnt/c/Users/jcortez3/Desktop/chiagents\ web/ca-freeport.sh
for /f "delims=" %%p in ('wsl.exe -- bash -lc "bash %HELPER% 4242 4299"') do set PORT=%%p

if "%PORT%"=="" goto :noport
if "%PORT%"=="none" goto :noport

echo Starting ChipAgents web on port %PORT% ...
start "" http://localhost:%PORT%/hub
wsl.exe -- bash -lc "cd %WORKDIR% && export NODE_EXTRA_CA_CERTS=$HOME/certs/adi-ca-bundle.pem && export CHIPAGENTS_DISABLE_UID_CHECK=true && HUB_PORT=%PORT% ~/.local/bin/chipagents web"
CHIPAGENTS_DISABLE_UID_CHECK=true
goto :done

:noport
echo ERROR: no free port found in range 4242-4299.
echo An existing instance may already be running - check your browser tabs.

:done

echo.
echo ChipAgents web stopped.
pause
