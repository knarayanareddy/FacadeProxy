# FacadeProxy browser extension

MV3 extension for applying coherent browser personas with a localhost FacadeProxy proxy.

## Build

```bash
npm ci
npm run build          # Chromium manifest
npm run build:firefox  # Firefox-compatible manifest variant
```

## Test

```bash
npm run typecheck
npm run test:unit
npm run test:e2e
```

E2E requires the Rust proxy binary to exist. From repo root:

```bash
make all
make test-e2e
```

## Runtime behavior

The background service worker activates personas only after:

1. local persona validation;
2. proxy health check;
3. successful `/persona` POST;
4. proxy `/health.persona` match;
5. PAC proxy configuration;
6. DNR rule installation and verification.

If any gate fails, the extension rolls back to avoid JS-only spoofing.

## MAIN-world injection

Chromium package uses declarative `content_scripts.world = MAIN` for `assets/injected.js` at `document_start`. Firefox package removes this field and relies on content-script script-tag fallback.

The injected script synchronously queries `/persona/current` before applying values so early page scripts do not depend on async service-worker messaging.

## Permissions

- `proxy`: local PAC routing through `127.0.0.1`.
- `declarativeNetRequest`, `declarativeNetRequestWithHostAccess`: local request-header persona rules.
- `storage`: local personas/settings/session state.
- `scripting`: programmatic injection compatibility path.
- `tabs`: broadcast persona updates/clears.
- `<all_urls>`: apply selected persona consistently across pages.

No remote telemetry is implemented.
