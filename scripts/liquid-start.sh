#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODEL_DIR="$ROOT/.runtime/models"
mkdir -p "$MODEL_DIR"
# Reuse only a healthy local runtime advertising this exact model alias.
# Explicit LIQUID_PORT takes precedence over a previously selected fallback.
REUSE_PORT="$(python3 - "$ROOT/.runtime/liquid.env" "${LIQUID_PORT:-}" <<'PYCODE'
import json,pathlib,sys,urllib.request
ports=[]
if sys.argv[2]: ports.append(sys.argv[2])
else:
    try:
        values=dict(line.split('=',1) for line in pathlib.Path(sys.argv[1]).read_text().splitlines())
        ports.append(values.get('LIQUID_PORT','8089'))
    except (OSError,ValueError): pass
    ports.append('8089')
for value in dict.fromkeys(ports):
    try:
        port=int(value)
        if not 1<=port<=65535: continue
        base=f'http://127.0.0.1:{port}'
        with urllib.request.urlopen(base+'/health',timeout=1) as response:
            if json.load(response).get('status') != 'ok': continue
        with urllib.request.urlopen(base+'/v1/models',timeout=1) as response:
            models=json.load(response).get('data',[])
        if any(m.get('id')=='LFM2.5-VL-450M' for m in models):
            print(port);break
    except (OSError,ValueError,KeyError): pass
PYCODE
)"
if [ -n "$REUSE_PORT" ]; then
  printf 'LIQUID_BASE_URL=http://127.0.0.1:%s/v1\nLIQUID_PORT=%s\n' "$REUSE_PORT" "$REUSE_PORT" > "$ROOT/.runtime/liquid.env"
  echo "Reusing healthy Liquid LFM2.5-VL-450M at http://127.0.0.1:$REUSE_PORT/v1"
  exit 0
fi
if ! command -v llama-server >/dev/null; then
  echo 'Installing local llama.cpp runtime (Liquid AI recommended migration from LEAP).'
  HOMEBREW_NO_AUTO_UPDATE=1 brew install llama.cpp
fi
BASE=https://huggingface.co/LiquidAI/LFM2.5-VL-450M-GGUF/resolve/main
for FILE in LFM2.5-VL-450M-Q4_K_M.gguf mmproj-LFM2.5-VL-450m-Q8_0.gguf; do
  if [ ! -s "$MODEL_DIR/$FILE" ]; then
    curl -fL --retry 3 --continue-at - "$BASE/$FILE" -o "$MODEL_DIR/$FILE.part"
    mv "$MODEL_DIR/$FILE.part" "$MODEL_DIR/$FILE"
  fi
done
PORT="$(python3 - "${LIQUID_PORT:-8089}" <<'PY'
import socket,sys
for p in range(int(sys.argv[1]),int(sys.argv[1])+20):
    with socket.socket() as s:
        try: s.bind(('127.0.0.1',p)); print(p); break
        except OSError: pass
else: raise SystemExit('No available local Liquid port')
PY
)"
printf 'LIQUID_BASE_URL=http://127.0.0.1:%s/v1\nLIQUID_PORT=%s\n' "$PORT" "$PORT" > "$ROOT/.runtime/liquid.env"
echo "Liquid LFM2.5-VL-450M: http://127.0.0.1:$PORT/v1 — keyless local inference"
exec llama-server -m "$MODEL_DIR/LFM2.5-VL-450M-Q4_K_M.gguf" --mmproj "$MODEL_DIR/mmproj-LFM2.5-VL-450m-Q8_0.gguf" --host 127.0.0.1 --port "$PORT" --alias LFM2.5-VL-450M -c 8192 -np 1 -ngl 99 --jinja
