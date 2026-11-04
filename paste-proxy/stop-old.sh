#!/usr/bin/env bash
set -u
me=$(id -u)
skip=" $$ $PPID "
list() {
  ps -u "$me" -o pid=,ppid=,comm=,args= | awk -v skip="$skip" '
    index(skip, " " $1 " ") { next }
    $3 == "node" && /paste-proxy\/paste-proxy\.js/ { print $1; next }
    $3 ~ /^chipagents-linu/ && / web( |$)/ { print $1 }'
}
pids=$(list | tr '\n' ' ')
if [ -z "${pids// /}" ]; then
  echo "[launcher] no old instance running"
  exit 0
fi
echo "[launcher] stopping old instance (pids: $pids)"
[ "${DRY_RUN:-0}" = 1 ] && exit 0
kill -TERM $pids 2>/dev/null
for _ in 1 2 3 4 5 6 7 8 9 10; do
  sleep 0.5
  [ -z "$(list)" ] && { echo "[launcher] old instance stopped"; exit 0; }
done
left=$(list | tr '\n' ' ')
echo "[launcher] force-stopping (pids: $left)"
kill -KILL $left 2>/dev/null
sleep 0.5
exit 0
