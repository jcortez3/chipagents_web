@rem jcortez3
@echo off
setlocal
set "CA_APP=%~dp0paste-proxy"
set "CA_DESKTOP="
for /f "usebackq delims=" %%D in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"`) do set "CA_DESKTOP=%%D"
if not defined CA_DESKTOP set "CA_DESKTOP=%USERPROFILE%\Desktop"
set "CA_BAT=%~f0"
set "CA_DIR=%~dp0"
set "CA_ICO=%~dp0chipagents.ico"
powershell -NoProfile -Command "$l=Join-Path $env:CA_DESKTOP 'ChipAgents Web.lnk'; $w=New-Object -ComObject WScript.Shell; if ((Test-Path $l) -and $w.CreateShortcut($l).TargetPath -eq $env:CA_BAT) { exit }; $s=$w.CreateShortcut($l); $s.TargetPath=$env:CA_BAT; $s.WorkingDirectory=$env:CA_DIR; if (Test-Path $env:CA_ICO) { $s.IconLocation=$env:CA_ICO+',0' }; $s.Description='Start ChipAgents Web'; $s.Save(); Write-Host 'Created Desktop shortcut: ChipAgents Web (use it next time)'"
set "WSLENV=CA_APP/p:CA_DESKTOP/p:%WSLENV%"
echo Starting ChipAgents web with image paste ...
echo   app folder: %CA_APP%
echo   desktop:    %CA_DESKTOP%
wsl.exe -- bash -lc "exec bash \"$CA_APP/start.sh\""
echo.
echo ChipAgents web stopped.
pause
