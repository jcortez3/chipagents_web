@echo off
setlocal
set WORKDIR=/mnt/c/Users/jcortez3/Desktop
set STOPOLD=/mnt/c/Users/jcortez3/Desktop/chiagents\ web/paste-proxy/stop-old.sh
set PROXY=/mnt/c/Users/jcortez3/Desktop/chiagents\ web/paste-proxy/paste-proxy.js
echo Starting ChipAgents web with image paste ...
wsl.exe -- bash -lc "bash %STOPOLD% ; cd %WORKDIR% && export NODE_EXTRA_CA_CERTS=$HOME/certs/adi-ca-bundle.pem && HUB_PORT=4242 PASTE_PROXY_PORT=4300 /usr/bin/node %PROXY%"
echo.
echo ChipAgents web stopped.
pause
