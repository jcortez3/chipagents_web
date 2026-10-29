#!/usr/bin/env bash
# Print the first free TCP port in a range (default 4242-4299) on 127.0.0.1.
START="${1:-4242}"
END="${2:-4299}"

for ((p=START; p<=END; p++)); do
  if node -e "
const net=require('net');const s=net.createServer();
s.once('error',()=>process.exit(1));
s.once('listening',()=>s.close(()=>process.exit(0)));
s.listen($p,'127.0.0.1');
" 2>/dev/null; then
    echo "$p"
    exit 0
  fi
done

echo "none"
exit 1
