# FacadeProxy implementation architecture

## Overview

FacadeProxy applies selected browser personas through a local-first two-container architecture:

1. **Browser extension** — owns browser permissions, persona activation state, DNR request-header rules, PAC proxy configuration, and page-context JavaScript overrides.
2. **Rust localhost proxy** — owns control endpoints, persona validation, plaintext HTTP header mutation, CONNECT tunneling, metrics, logging, and persona TOML mirroring.

The system is designed around one primary invariant:

> Do not expose spoofed JavaScript values unless the network-layer persona is confirmed ready.

## Components

```text
extension/
├── background/background.ts
│   ├── persona validation
│   ├── strict activation gates
│   ├── proxy health + persona sync
│   ├── PAC proxy config
│   ├── DNR rule install/verification
│   └── rollback on coherence failure
├── injected/injected.ts
│   ├── MAIN-world document_start bootstrap
│   ├── synchronous /persona/current lookup
│   ├── navigator/screen/Intl/Date overrides
│   ├── plugins/mimeTypes masking
│   ├── Canvas/WebGL/Audio perturbation
│   └── restoreOriginals()
├── content/content.ts
│   ├── Firefox/script-tag fallback
│   ├── page sessionStorage bootstrap cache
│   └── async bridge for persona updates
└── popup/
    ├── persona selector
    ├── control-token input
    └── status/metrics

proxy/
├── proxy.rs
│   ├── /health
│   ├── /metrics
│   ├── /persona
│   ├── /persona/current
│   ├── /personas
│   ├── CONNECT tunnel handling
│   └── plaintext HTTP forwarding
├── persona.rs
│   ├── schema
│   ├── coherence validation
│   └── TOML load/save
├── headers.rs
│   └── HTTP header mutation
└── logging.rs
    └── rotating debug log
```

## Activation flow

```text
User selects persona
  ↓
background validates persona
  ↓
background confirms proxy health
  ↓
background POSTs /persona with X-FacadeProxy-Token
  ↓
background confirms /health.persona == selected persona
  ↓
background configures PAC proxy
  ↓
background installs DNR request-header rules
  ↓
background verifies DNR rules are present
  ↓
activePersonaId is stored in session storage
  ↓
content scripts receive persona update
  ↓
MAIN-world script applies JS overrides
```

If any step fails, activation rolls back and the extension reports DEGRADED/INVALID instead of ACTIVE.

## Synchronous page bootstrap

The MAIN-world script runs at `document_start` and synchronously queries:

```http
GET http://127.0.0.1:7878/persona/current
```

Outcomes:

| Proxy result | Page action |
|---|---|
| active persona returned | apply JS overrides immediately |
| `persona: null` | clear stale session persona, do not spoof JS |
| proxy unreachable | clear stale session persona, do not spoof JS |

This mitigates the async content-script/service-worker race for early inline page scripts.

## Proxy restart coherence

The extension polls `/health`. If an active browser persona exists but `/health.persona` is different:

1. re-POST the active persona to `/persona`;
2. re-check `/health.persona`;
3. if it matches, remain ACTIVE;
4. if it fails, clear active persona, DNR, PAC, and page JS.

## CONNECT behavior

The proxy attempts `TcpStream::connect(authority)` before returning `200 Connection Established`. If upstream connection fails, the proxy returns `502 Bad Gateway` or `504 Gateway Timeout`.

The proxy does not inspect TLS traffic and does not mutate encrypted HTTPS headers. HTTPS header mutation depends on browser DNR rules.

## Security boundaries

- Proxy bind address must be loopback.
- No remote telemetry.
- Mutation endpoints require token when configured.
- Remote web origins cannot mutate persona.
- Read-only `/persona/current` exposes only the active fake persona and exists to support synchronous page bootstrap.
- Debug logs are local and rotated; request/response bodies are not logged.

## Known limitations

- TLS fingerprinting is not modified.
- Advanced fingerprinting coverage is partial.
- Firefox package uses fallback injection and requires separate QA.
- Reproducibility/signing/store/audit are release gates, not runtime features.
