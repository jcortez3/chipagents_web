#!/usr/bin/env bash
set -u
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
say() { echo "[launcher] $*"; }
desktop="${CA_DESKTOP:-}"
if [ -z "$desktop" ] || [ ! -d "$desktop" ]; then
  win_user="$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r')"
  desktop="/mnt/c/Users/${win_user}/Desktop"
fi
if [ ! -d "$desktop" ]; then
  say "Desktop folder not found: $desktop"
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  say "Node.js was not found in WSL. Install Node.js 18 or newer, then try again."
  exit 1
fi
chipagents_bin="${CHIPAGENTS_BIN:-$HOME/.local/bin/chipagents}"
if [ ! -x "$chipagents_bin" ]; then
  chipagents_bin="$(command -v chipagents || true)"
fi
if [ -z "$chipagents_bin" ]; then
  say "ChipAgents CLI was not found in WSL. Install it and log in first (chipagents login)."
  exit 1
fi
export CHIPAGENTS_BIN="$chipagents_bin"
export_ca() {
  local out="$1" tmp ps enc
  ps='$c = foreach($s in @("Cert:\LocalMachine\Root","Cert:\LocalMachine\CA","Cert:\CurrentUser\Root","Cert:\CurrentUser\CA")){ Get-ChildItem $s -ErrorAction SilentlyContinue }; $c | Where-Object { $_.Subject -match "Analog|goskope|Netskope" -and $_.Subject -notmatch "EFS" } | Sort-Object Thumbprint -Unique | ForEach-Object { "# " + $_.Subject; "-----BEGIN CERTIFICATE-----"; [Convert]::ToBase64String($_.RawData,"InsertLineBreaks"); "-----END CERTIFICATE-----" }'
  enc="$(printf '%s' "$ps" | iconv -f UTF-8 -t UTF-16LE | base64 -w0)"
  tmp="$(mktemp)"
  powershell.exe -NoProfile -NonInteractive -EncodedCommand "$enc" 2>/dev/null | tr -d '\r' > "$tmp"
  if [ "$(grep -c 'BEGIN CERTIFICATE' "$tmp")" -gt 0 ]; then
    mkdir -p "$(dirname "$out")"
    mv "$tmp" "$out"
    chmod 644 "$out"
    return 0
  fi
  rm -f "$tmp"
  return 1
}
for cert in "${NODE_EXTRA_CA_CERTS:-}" "$HOME/certs/adi-ca-bundle.pem" "$APP_DIR/../adi-ca-bundle.pem" "$desktop/adi-ca-bundle.pem"; do
  if [ -n "$cert" ] && [ -f "$cert" ]; then
    export NODE_EXTRA_CA_CERTS="$cert"
    break
  fi
done
if [ -z "${NODE_EXTRA_CA_CERTS:-}" ]; then
  say "no ADI CA bundle found; exporting ADI certificates from the Windows certificate store ..."
  if export_ca "$HOME/certs/adi-ca-bundle.pem"; then
    export NODE_EXTRA_CA_CERTS="$HOME/certs/adi-ca-bundle.pem"
    say "saved $(grep -c 'BEGIN CERTIFICATE' "$NODE_EXTRA_CA_CERTS") certificates to $NODE_EXTRA_CA_CERTS"
  else
    say "warning: could not export ADI certificates; logins may fail with 'self signed certificate in certificate chain'"
  fi
fi
bash "$APP_DIR/stop-old.sh"
export PASTE_DIR="${PASTE_DIR:-$desktop/screens}"
say "user: $(whoami), desktop: $desktop"
cd "$desktop" || exit 1
exec env HUB_PORT="${HUB_PORT:-4242}" PASTE_PROXY_PORT="${PASTE_PROXY_PORT:-4300}" node "$APP_DIR/paste-proxy.js"
