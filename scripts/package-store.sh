#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

rm -rf packaging/store/chromium packaging/store/firefox
mkdir -p packaging/store

npm --prefix extension ci
npm --prefix extension run build
cp -R extension/dist packaging/store/chromium
python3 scripts/make-deterministic-zip.py packaging/store/chromium packaging/store/facadeproxy-chromium-store.zip

npm --prefix extension run build:firefox
cp -R extension/dist packaging/store/firefox
python3 scripts/make-deterministic-zip.py packaging/store/firefox packaging/store/facadeproxy-firefox-store.zip

(
  cd packaging/store
  sha256sum *.zip > SHA256SUMS.txt
)
cat packaging/store/SHA256SUMS.txt
