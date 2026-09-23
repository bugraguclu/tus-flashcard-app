#!/bin/bash
# Flappy Plane'i yerel sunucuda başlatır. Çift tıklayarak da açabilirsin.
cd "$(dirname "$0")" || exit 1
PORT=8000
while lsof -i :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; do PORT=$((PORT+1)); done
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)

echo "🛩  Flappy Plane"
echo "   Bu Mac       : http://localhost:$PORT/"
[ -n "$IP" ] && echo "   Aynı Wi-Fi   : http://$IP:$PORT/   (iPhone/iPad buradan açar)"
echo "   Durdurmak için: Ctrl+C"
echo

( sleep 1; open "http://localhost:$PORT/" ) &
exec python3 -m http.server "$PORT" --bind 0.0.0.0
