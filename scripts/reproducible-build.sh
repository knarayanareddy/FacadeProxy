#!/usr/bin/env bash
set -euo pipefail

# Build unsigned, deterministic-ish artifacts suitable for reproducibility checks.
# Signed artifacts are intentionally a separate step because signatures often add
# timestamps and platform-specific metadata.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-1735689600}"
export TZ=UTC
export LC_ALL=C
export CARGO_TERM_COLOR=never
export RUSTFLAGS="${RUSTFLAGS:-} --remap-path-prefix=$ROOT=."

rm -rf dist release/repro
mkdir -p dist/proxy release/repro

npm --prefix extension ci
npm --prefix extension run build
cp -R extension/dist dist/extension-chromium
npm --prefix extension run build:firefox
cp -R extension/dist dist/extension-firefox

cargo build --manifest-path proxy/Cargo.toml --release --locked
cp proxy/target/release/facadeproxy dist/proxy/facadeproxy 2>/dev/null || cp proxy/target/release/facadeproxy.exe dist/proxy/facadeproxy.exe

python3 scripts/make-deterministic-zip.py dist/extension-chromium release/repro/facadeproxy-extension-chromium.zip
python3 scripts/make-deterministic-zip.py dist/extension-firefox release/repro/facadeproxy-extension-firefox.zip
python3 scripts/make-deterministic-zip.py dist/proxy release/repro/facadeproxy-proxy-current-platform.zip

(
  cd release/repro
  sha256sum *.zip > SHA256SUMS.txt
)

cat release/repro/SHA256SUMS.txt
