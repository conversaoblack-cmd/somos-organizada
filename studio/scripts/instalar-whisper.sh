#!/usr/bin/env bash
# Instala o whisper.cpp (transcrição local, só como GUIA DE ORDEM das palavras; seção 6.5) em studio/modelos/.
# A pasta modelos/ não vai para o Git: na nuvem o contêiner é apagado e isto roda de novo (~3 min + 0,5 GB).
# Uso: bash scripts/instalar-whisper.sh [small|large-v3-turbo]   (nuvem: small; Mac: large-v3-turbo)
set -euo pipefail
cd "$(dirname "$0")/.."
COMMIT=0c7be696371069e0baa2515ed7aa08d5a5473aa6   # whisper.cpp, 12/10/2026 (MIT)
MODELO="${1:-small}"
mkdir -p modelos
if [ ! -x modelos/whisper.cpp/build/bin/whisper-cli ]; then
  if [ ! -d modelos/whisper.cpp/.git ]; then
    git clone --filter=blob:none https://github.com/ggml-org/whisper.cpp.git modelos/whisper.cpp
  fi
  git -C modelos/whisper.cpp fetch --depth 1 origin "$COMMIT" 2>/dev/null || true
  git -C modelos/whisper.cpp checkout -q "$COMMIT"
  cmake -S modelos/whisper.cpp -B modelos/whisper.cpp/build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DWHISPER_BUILD_TESTS=OFF >/dev/null
  cmake --build modelos/whisper.cpp/build -j "$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)" --target whisper-cli >/dev/null
fi
ARQ="modelos/ggml-$MODELO.bin"
if [ ! -s "$ARQ" ]; then
  curl -fSL -o "$ARQ.parcial" "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$MODELO.bin"
  mv "$ARQ.parcial" "$ARQ"
fi
modelos/whisper.cpp/build/bin/whisper-cli --help >/dev/null 2>&1 && echo "whisper-cli ok · modelo $ARQ ($(du -h "$ARQ" | cut -f1))"
