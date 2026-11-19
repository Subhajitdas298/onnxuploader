#!/usr/bin/env bash
# Runs the browser tests against the real stack on this machine:
#   Azurite (blob emulator) + the Spring Boot API + the React UI.
#
#   scripts/e2e.sh                 UI dev server, API reached through its proxy
#   E2E_MODE=prod scripts/e2e.sh   built UI served from another origin than the API, like the real deployment
#                                  (exercises CORS for the API and for direct uploads to blob storage)
#
# Extra arguments go to Playwright, for example: scripts/e2e.sh e2e/upload.spec.ts -g "overwrites"
# Needs Java 25, Node 22 and a Chromium for Playwright (set PW_CHROMIUM_PATH to use an existing one).
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${E2E_MODE:-dev}"
WORK="$(mktemp -d)"
PIDS=()
cleanup() {
  for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null || true; done
  # children of npx wrappers (Azurite, Vite) are not covered by the pids above
  pkill -f "$WORK" 2>/dev/null || true
  pkill -f "frontend/node_modules/.bin/vite" 2>/dev/null || true
  pkill -f "backend/build/libs/app.jar" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

for port in 10000 8080 5173; do
  if (echo > "/dev/tcp/127.0.0.1/$port") 2>/dev/null; then echo "Port $port is already in use. Stop whatever listens there and run again." >&2; exit 1; fi
done

wait_for() { # url, seconds
  for _ in $(seq 1 "$2"); do curl -fs -o /dev/null "$1" && return 0; sleep 1; done
  echo "Timed out waiting for $1" >&2; return 1
}

CONNECTION="DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;"

echo "▶ blob storage emulator"
mkdir -p "$WORK/azurite"
npx --yes -p azurite@3.35.0 azurite-blob --silent --skipApiVersionCheck --location "$WORK/azurite" --blobHost 127.0.0.1 > "$WORK/azurite.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 60); do (echo > /dev/tcp/127.0.0.1/10000) 2>/dev/null && break; sleep 1; done
(echo > /dev/tcp/127.0.0.1/10000) 2>/dev/null || { echo "Azurite did not start" >&2; cat "$WORK/azurite.log" >&2; exit 1; }

echo "▶ API"
if [ -z "${E2E_SKIP_BUILD:-}" ] || [ ! -f backend/build/libs/app.jar ]; then (cd backend && ./gradlew --no-daemon -q bootJar -x test); fi
STORAGE_CONNECTION_STRING="$CONNECTION" STORAGE_CONFIGURE_CORS=true \
  java --enable-native-access=ALL-UNNAMED -jar backend/build/libs/app.jar > "$WORK/api.log" 2>&1 &
PIDS+=($!)
wait_for "http://localhost:8080/actuator/health" 90

echo "▶ UI ($MODE)"
cd frontend
[ -d node_modules ] || npm ci
if [ "$MODE" = "prod" ]; then
  VITE_API_BASE_URL="http://localhost:8080" npm run build --silent
  npx vite preview --host localhost --port 5173 --strictPort > "$WORK/ui.log" 2>&1 &
else
  npx vite --host localhost --port 5173 --strictPort > "$WORK/ui.log" 2>&1 &
fi
PIDS+=($!)
wait_for "http://localhost:5173/" 60

echo "▶ browser tests"
AZURITE_CONNECTION_STRING="$CONNECTION" npx playwright test "$@" || { echo "---- API log (tail) ----"; tail -30 "$WORK/api.log"; exit 1; }
