#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
mkdir -p release/sbom

if command -v npx >/dev/null 2>&1; then
  npm --prefix extension ci
  (cd extension && npx --yes @cyclonedx/cyclonedx-npm --output-file ../release/sbom/sbom-extension.json)
else
  echo "npx not found; skipping npm SBOM" >&2
fi

if command -v cargo >/dev/null 2>&1; then
  if ! cargo cyclonedx --version >/dev/null 2>&1; then
    cargo install cargo-cyclonedx --locked
  fi
  cargo cyclonedx --manifest-path proxy/Cargo.toml --format json --output-cdx ../../release/sbom/sbom-proxy.json
else
  echo "cargo not found; skipping Rust SBOM" >&2
fi

ls -la release/sbom
