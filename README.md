# FacadeProxy

FacadeProxy is a local-first browser persona system built from the FacadeProxy production engineering specification. It combines a Chromium/Firefox browser extension with a localhost Rust proxy to apply coherent, user-selected browser personas across selected JavaScript and request-header surfaces.

> **Production status:** hardened prototype / release-candidate foundation. The codebase now includes strict persona coherence gates, proxy restart re-sync, synchronous MAIN-world bootstrap, browser E2E scaffolding, SBOM/reproducible-build scripts, CI, release placeholders, and operational documentation. Public distribution still requires the external items listed in [`docs/REMAINING_PRODUCTION_TASKS.md`](docs/REMAINING_PRODUCTION_TASKS.md), especially independent security audit, signing certificates, store submission, and real browser-matrix verification.

## What FacadeProxy does

FacadeProxy lets a user select a coherent persona, for example:

- User-Agent: Linux Chrome
- Accept-Language: `nl-NL,nl;q=0.9,en;q=0.8`
- Timezone: `Europe/Amsterdam`
- Screen: `1920x1080`
- Platform: `Linux x86_64`

The system then attempts to keep browser JavaScript-visible values and outgoing HTTP request headers aligned with that persona.

## What FacadeProxy does **not** do

FacadeProxy is not Tor, a VPN, or a complete anti-fingerprinting browser.

It does **not** provide:

- IP anonymity;
- Tor-style traffic routing;
- TLS ClientHello / JA3 / JA4 mutation;
- complete protection against all Canvas/WebGL/Audio/font/timing fingerprinting;
- mobile browser support;
- guaranteed evasion against commercial fingerprinting systems.

## Architecture

```text
Browser extension MV3
├── background service worker
│   ├── validates personas
│   ├── configures PAC proxy
│   ├── installs DNR header rules
│   ├── health-polls localhost proxy
│   ├── re-syncs proxy persona after proxy restart
│   └── rolls back persona on any coherence failure
├── MAIN-world injected script
│   ├── synchronous persona bootstrap from localhost proxy
│   ├── navigator/screen/Intl/Date overrides
│   ├── basic plugins/mimeTypes masking
│   ├── basic Canvas/WebGL/Audio perturbation
│   └── function-toString masking for patched functions
├── isolated content script
│   ├── Firefox/script-tag fallback injection
│   ├── per-tab sessionStorage bootstrap cache
│   └── bridge for persona updates
└── popup UI
    ├── persona selector
    ├── status/metrics
    └── proxy control token input

Rust localhost proxy
├── binds only to 127.0.0.1 / loopback
├── /health, /metrics, /persona, /persona/current, /personas
├── token-protected mutation APIs
├── plaintext HTTP header mutation
├── CONNECT tunneling without TLS interception
├── persona TOML mirroring
└── rotating debug log with 0600 permissions
```

More detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Key hardening features

### Strict coherence activation

A persona is not exposed to page JavaScript unless all activation gates pass:

1. persona validates locally;
2. proxy health is reachable;
3. proxy accepts `/persona` update;
4. proxy `/health.persona` matches the desired persona;
5. PAC proxy configuration succeeds;
6. DNR header rules install;
7. DNR rules verify as present.

If any step fails, FacadeProxy clears DNR rules, clears PAC proxy settings, removes the active persona, and broadcasts `CLEAR_PERSONA` to page scripts.

### Proxy restart re-sync

If the Rust proxy restarts, its in-memory persona becomes `unset`. The extension now checks `/health.persona` during polling. If the proxy persona differs from the extension's active persona, the extension immediately re-POSTs the persona. If re-sync fails, it rolls back the browser persona to avoid incoherent JS-vs-network signals.

### Synchronous MAIN-world bootstrap

The injected MAIN-world script runs at `document_start` and synchronously calls:

```http
GET http://127.0.0.1:7878/persona/current
```

If the proxy reports an active persona, the script applies overrides immediately before normal page scripts continue. If the proxy is unreachable or reports `unset`, stale page session state is cleared and no JS-only persona is applied.

### RFC-correct CONNECT behavior

The proxy now attempts to connect to the target upstream server before returning `200 Connection Established` to the browser. Upstream failure returns an appropriate `502 Bad Gateway` or `504 Gateway Timeout` instead of prematurely reporting tunnel success.

### Token-protected control API

Start the proxy with:

```bash
export FACADEPROXY_AUTH_TOKEN="replace-with-a-random-32-byte-secret"
./dist/proxy/facadeproxy --personas personas/defaults/personas.toml --auth-token "$FACADEPROXY_AUTH_TOKEN"
```

Then save the same token in the extension popup. Mutation endpoints require:

```http
X-FacadeProxy-Token: <token>
```

Read-only `/persona/current` intentionally does not require the token so the MAIN-world bootstrap can synchronously verify the proxy persona.

## Repository layout

```text
facadeproxy/
├── extension/                 # MV3 browser extension
│   ├── src/background/         # service worker
│   ├── src/content/            # isolated bridge/fallback
│   ├── src/injected/           # MAIN-world script
│   ├── src/popup/              # popup UI
│   ├── e2e/                    # Playwright extension/proxy tests
│   └── scripts/                # Firefox manifest transform
├── proxy/                      # Rust localhost proxy
├── personas/defaults/          # default persona TOML
├── docs/                       # architecture, audit, release, store docs
├── scripts/                    # reproducible build/SBOM/store scripts
├── packaging/                  # generated store/release packages
├── .github/workflows/          # CI/release workflows
├── Makefile
├── rust-toolchain.toml
└── .node-version
```

## Prerequisites

- Node.js `20.20.2` or compatible Node 20 LTS
- npm 10+
- Rust `1.96.0` via `rustup`
- GNU Make
- Chrome/Chromium for E2E tests

Install Rust toolchain:

```bash
rustup toolchain install 1.96.0 --component rustfmt --component clippy
```

Install extension dependencies:

```bash
npm --prefix extension ci
```

## Build

```bash
# Build Chromium extension and Rust proxy
make all

# Chromium extension only
make ext

# Firefox manifest variant
make ext-firefox

# Proxy only
make proxy

# Tests
make test

# Rust formatting and clippy
make fmt
make clippy
```

## Run locally

### 1. Start proxy

```bash
make proxy
export FACADEPROXY_AUTH_TOKEN="dev-secret-change-me"
./dist/proxy/facadeproxy \
  --personas personas/defaults/personas.toml \
  --auth-token "$FACADEPROXY_AUTH_TOKEN" \
  --debug
```

Verify:

```bash
curl http://127.0.0.1:7878/health
curl http://127.0.0.1:7878/persona/current
```

### 2. Load extension

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `dist/extension`.
5. Open the popup.
6. Paste the proxy control token.
7. Select a persona.
8. Apply.

## Browser E2E

```bash
make all
npx --prefix extension playwright install chromium
make test-e2e
```

The E2E scaffold verifies:

- extension loading;
- persona application;
- early page JS seeing persona values;
- HTTP server-observed request headers.

These tests are a required starting point, not a substitute for full manual browser-matrix QA.

## Reproducible unsigned artifacts

```bash
scripts/reproducible-build.sh
```

Outputs:

```text
release/repro/facadeproxy-extension-chromium.zip
release/repro/facadeproxy-extension-firefox.zip
release/repro/facadeproxy-proxy-current-platform.zip
release/repro/SHA256SUMS.txt
```

See [`docs/REPRODUCIBLE_BUILDS.md`](docs/REPRODUCIBLE_BUILDS.md).

## Store packages

```bash
scripts/package-store.sh
```

Outputs:

```text
packaging/store/facadeproxy-chromium-store.zip
packaging/store/facadeproxy-firefox-store.zip
packaging/store/SHA256SUMS.txt
```

See [`docs/STORE_SUBMISSION.md`](docs/STORE_SUBMISSION.md).

## SBOM

```bash
scripts/generate-sbom.sh
```

Outputs under `release/sbom/`.

## Documentation index

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — implementation architecture
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md) — local operation, logging, troubleshooting
- [`docs/REPRODUCIBLE_BUILDS.md`](docs/REPRODUCIBLE_BUILDS.md) — deterministic build process
- [`docs/RELEASE_PROCESS.md`](docs/RELEASE_PROCESS.md) — release/signing/notarization process
- [`docs/STORE_SUBMISSION.md`](docs/STORE_SUBMISSION.md) — Chrome/Edge/Firefox store checklist
- [`docs/PRIVACY_POLICY_DRAFT.md`](docs/PRIVACY_POLICY_DRAFT.md) — privacy policy draft
- [`docs/audit/SECURITY_AUDIT_PACKAGE.md`](docs/audit/SECURITY_AUDIT_PACKAGE.md) — independent audit package
- [`docs/REMAINING_PRODUCTION_TASKS.md`](docs/REMAINING_PRODUCTION_TASKS.md) — external actions still required
- [`SECURITY.md`](SECURITY.md) — vulnerability reporting and security posture

## Current production-readiness assessment

With the latest hardening pass, the repo is a strong release-candidate foundation. It is still not a self-certified 9.5/10 production build until the external gates are completed:

- independent security audit;
- reproducibility verification on clean machines;
- signing/notarization with real certificates;
- store submission/review;
- browser-matrix QA.

See [`docs/REMAINING_PRODUCTION_TASKS.md`](docs/REMAINING_PRODUCTION_TASKS.md).

## License

MIT, unless changed by the repository owner.
