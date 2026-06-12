# Reproducible build process

FacadeProxy separates reproducible unsigned builds from signing/notarization. Unsigned artifacts should be byte-identical across clean environments; signed artifacts may differ because signing tools add timestamps and platform metadata.

## Pinned inputs

- Rust toolchain: `rust-toolchain.toml`
- Node version: `.node-version`
- npm dependencies: `extension/package-lock.json`
- Rust dependencies: `proxy/Cargo.lock`
- deterministic ZIP builder: `scripts/make-deterministic-zip.py`

## Build command

```bash
export SOURCE_DATE_EPOCH=1735689600
scripts/reproducible-build.sh
```

Outputs:

```text
release/repro/facadeproxy-extension-chromium.zip
release/repro/facadeproxy-extension-firefox.zip
release/repro/facadeproxy-proxy-current-platform.zip
release/repro/SHA256SUMS.txt
```

## Verification procedure

Run the same command in two clean environments:

```bash
git clean -xfd
export SOURCE_DATE_EPOCH=1735689600
scripts/reproducible-build.sh
cat release/repro/SHA256SUMS.txt
```

Compare `SHA256SUMS.txt`. For a release gate, the hashes must match for the same OS/architecture.

## Known caveats

- Cross-OS binaries are not byte-identical by design.
- macOS/Windows signed artifacts are not expected to match unsigned hashes.
- If Rust linker metadata changes, proxy binary hashes may differ even when source is identical. Capture the full toolchain and linker version in release notes.
- Extension ZIPs should be deterministic across OSes if line endings remain LF and file permissions are normalized.

## Release rule

Publish:

1. unsigned reproducible artifact hashes;
2. signed artifact hashes;
3. SBOMs;
4. provenance attestations;
5. verification logs.
