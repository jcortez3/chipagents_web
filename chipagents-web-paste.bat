@echo off
setlocal
set "CA_APP=%~dp0paste-proxy"
set "CA_DESKTOP="
for /f "usebackq delims=" %%D in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"`) do set "CA_DESKTOP=%%D"
if not defined CA_DESKTOP set "CA_DESKTOP=%USERPROFILE%\Desktop"
set "WSLENV=CA_APP/p:CA_DESKTOP/p:%WSLENV%"
echo Starting ChipAgents web with image paste ...
echo   app folder: %CA_APP%
echo   desktop:    %CA_DESKTOP%
wsl.exe -- bash -lc "exec bash \"$CA_APP/start.sh\""
echo.
echo ChipAgents web stopped.
pause
