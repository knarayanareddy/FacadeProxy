

---

```markdown
<!--
════════════════════════════════════════════════════════════════════════════════
  FACADEPROXY — PRODUCTION ENGINEERING SPECIFICATION
  Single Source of Truth (SSOT) | Approved
════════════════════════════════════════════════════════════════════════════════
-->

# FacadeProxy — Production Engineering Specification

| Field            | Value                                              |
|------------------|----------------------------------------------------|
| **Title**        | FacadeProxy — Production Engineering Specification |
| **Version**      | 1.0.0                                              |
| **Status**       | Draft → In Review → Approved *(current: Draft)*    |
| **Owner**        | @knarayanareddy                                    |
| **Last Updated** | 2025-06-11                                         |
| **Replaces**     | FacadeProxydesigndoc.md (v0, informal blueprint)   |

---

## Changelog

| Version | Date       | Author           | Summary                            |
|---------|------------|------------------|------------------------------------|
| 1.0.0   | 2025-06-11 | @knarayanareddy  | Full production spec, first draft  |

---

## Pre-Production Gates (Human Sign-Off Required)

The following items MUST be resolved before any public distribution:

| Gate | Owner | Status |
|------|-------|--------|
| Security audit completed (see §8) | TBD | ⬜ Open |
| Threat model reviewed by second engineer | TBD | ⬜ Open |
| Firefox MV3 MAIN-world compatibility confirmed | TBD | ⬜ Open |
| Release channel strategy confirmed (§10) | TBD | ⬜ Open |
| Vulnerability disclosure policy published | TBD | ⬜ Open |
| CI/CD pipeline live and green | TBD | ⬜ Open |

---

## Table of Contents

1. [Context and Problem Statement](#1-context-and-problem-statement)
2. [Goals and Non-Goals](#2-goals-and-non-goals)
3. [Design Philosophy and Core Invariants](#3-design-philosophy-and-core-invariants)
4. [System Architecture](#4-system-architecture)
   - 4.1 [C4 Level 1 — System Context](#41-c4-level-1--system-context)
   - 4.2 [C4 Level 2 — Container Diagram](#42-c4-level-2--container-diagram)
   - 4.3 [C4 Level 3 — Component Breakdown](#43-c4-level-3--component-breakdown)
   - 4.4 [Traffic Flow — Step-by-Step](#44-traffic-flow--step-by-step)
   - 4.5 [Persona Lifecycle State Machine](#45-persona-lifecycle-state-machine)
5. [Component Specifications](#5-component-specifications)
   - 5.1 [Browser Extension (MV3)](#51-browser-extension-mv3)
   - 5.2 [Local Proxy (Rust)](#52-local-proxy-rust)
   - 5.3 [Persona Engine](#53-persona-engine)
   - 5.4 [Config & Storage Layer](#54-config--storage-layer)
6. [Architectural Decision Records (ADRs)](#6-architectural-decision-records-adrs)
   - ADR-001: Local Proxy vs Purely In-Extension Header Mutation
   - ADR-002: Obfuscation-First vs Blocking-First Strategy
   - ADR-003: Persona Scope — Per-Session vs Per-Domain
   - ADR-004: Rust for Proxy Binary
   - ADR-005: MV3 over MV2
   - ADR-006: No Remote Telemetry by Default
7. [Platform Support Matrix](#7-platform-support-matrix)
8. [Security Model and Threat Boundaries](#8-security-model-and-threat-boundaries)
   - 8.1 [Protected Assets](#81-protected-assets)
   - 8.2 [Threat Actors](#82-threat-actors)
   - 8.3 [Attack Surfaces and Mitigations](#83-attack-surfaces-and-mitigations)
   - 8.4 [Permission Justification (Extension)](#84-permission-justification-extension)
   - 8.5 [Supply-Chain Integrity](#85-supply-chain-integrity)
   - 8.6 [Vulnerability Disclosure Policy](#86-vulnerability-disclosure-policy)
9. [Performance Targets and SLOs](#9-performance-targets-and-slos)
   - 9.1 [Latency Budget](#91-latency-budget)
   - 9.2 [Operational SLOs](#92-operational-slos)
   - 9.3 [Degraded Mode Triggers](#93-degraded-mode-triggers)
10. [Build, Packaging, and Release](#10-build-packaging-and-release)
    - 10.1 [Monorepo Layout](#101-monorepo-layout)
    - 10.2 [Build Prerequisites](#102-build-prerequisites)
    - 10.3 [Build Commands](#103-build-commands)
    - 10.4 [Release Channels](#104-release-channels)
    - 10.5 [Release Checklist](#105-release-checklist)
    - 10.6 [Rollback Strategy](#106-rollback-strategy)
11. [CI/CD Pipeline Spec](#11-cicd-pipeline-spec)
12. [Testing Strategy](#12-testing-strategy)
    - 12.1 [Test Pyramid](#121-test-pyramid)
    - 12.2 [Test Coverage Gates](#122-test-coverage-gates)
13. [Error Handling and Graceful Degradation](#13-error-handling-and-graceful-degradation)
14. [Observability and Monitoring](#14-observability-and-monitoring)
    - 14.1 [Local Telemetry (Opt-In)](#141-local-telemetry-opt-in)
    - 14.2 [Instrumentation Points](#142-instrumentation-points)
    - 14.3 [Troubleshooting Runbooks](#143-troubleshooting-runbooks)
15. [Rollout Plan](#15-rollout-plan)
16. [Known Limitations and Open Questions](#16-known-limitations-and-open-questions)
17. [Glossary](#17-glossary)

---

## 1. Context and Problem Statement

### 1.1 Background

Modern web tracking, geo-fencing, and behavioral fingerprinting systems build persistent user profiles through a combination of:
- HTTP request headers (`Accept-Language`, `User-Agent`, `Referer`)
- JavaScript runtime environment signatures (`navigator.*`, `screen.*`, `Intl.*`)
- Network-level signals (IP geolocation, ASN patterns)
- Behavioral consistency signals (same persona seen across many requests)

Existing tools (VPNs, header-manipulation extensions, traditional blockers) address these in isolation and produce **incoherent signals** — a mismatched combination of headers and JS globals that is *more* detectable than doing nothing.

### 1.2 The Core Problem

There is no single-user-controlled tool that:
1. Maintains **internally coherent browser personas** across the network and JavaScript layers simultaneously.
2. Prefers **obfuscation and plausible noise injection** over outright blocking (which is trivially detected).
3. Operates **entirely local** — no cloud dependency, no external credential, no data exfiltration.
4. **Degrades gracefully** — never breaks page load, never fails loudly, passes through cleanly if the proxy is absent.

FacadeProxy is that tool.

---

## 2. Goals and Non-Goals

### 2.1 Goals

| ID | Goal | Priority |
|----|------|----------|
| G-01 | Intercept and mutate outgoing HTTP request headers at the network layer to match a chosen persona | MUST |
| G-02 | Inject coherent JavaScript overrides into page context (MAIN world) matching the same persona | MUST |
| G-03 | Ensure proxy binds only to `127.0.0.1` — zero external network exposure | MUST |
| G-04 | Degrade gracefully if proxy is not running — page loads MUST NOT be disrupted | MUST |
| G-05 | Support configurable persona profiles (geo, language, UA, timezone, screen) | MUST |
| G-06 | Support multiple active personas with session-level isolation | SHOULD |
| G-07 | Provide a dev/debug mode with request/mutation logging to local console only | SHOULD |
| G-08 | Build and run on macOS, Linux, and Windows (Chromium-based browser) | MUST |
| G-09 | Firefox support (MV3, subject to known MAIN-world injection limitations) | SHOULD |

### 2.2 Non-Goals

| ID | Not in scope | Rationale |
|----|--------------|-----------|
| NG-01 | Full traffic anonymization / Tor-style onion routing | Out of scope; use Tor for that |
| NG-02 | HTTPS termination or certificate pinning bypass | Security boundary violation |
| NG-03 | Content blocking / ad blocking | Different threat model; use uBlock |
| NG-04 | Cloud-based persona synchronization | Contradicts local-first invariant |
| NG-05 | Bypassing browser security policies (CSP, CORS) | MUST NOT; non-negotiable |
| NG-06 | Mobile browser support (Chrome for Android, Safari) | Extension API not available |
| NG-07 | Guarantee detection evasion (no 100% guarantee is possible) | Explicitly a known limitation |

---

## 3. Design Philosophy and Core Invariants

These invariants are non-negotiable. They MUST NOT be violated by any change:

> **INV-1 — Never break page load.**
> If the proxy is unreachable, if a persona is misconfigured, or if injection fails, the extension MUST pass the request through unmodified and silently log the failure. No user-visible error, no broken page.

> **INV-2 — Local-first, zero exfiltration.**
> No user data, persona configuration, or browsing signal MUST ever be transmitted outside `localhost`. This applies to all channels: telemetry, crash reporting, update checks, and config sync.

> **INV-3 — Coherence over completeness.**
> A partial persona (e.g., only headers mutated, no JS override) is worse than no persona. If a persona cannot be applied coherently across both the network and JS layers, the system MUST either apply it fully or not at all, and log the decision.

> **INV-4 — Obfuscation, not blocking.**
> The system injects plausible, internally consistent noise. It does not remove headers or return empty values; that pattern is itself a strong fingerprinting signal.

> **INV-5 — Least privilege.**
> The extension MUST NOT request permissions beyond what is listed in §8.4. The proxy MUST NOT open any port other than the configured localhost port.

---

## 4. System Architecture

### 4.1 C4 Level 1 — System Context

```
┌────────────────────────────────────────────────────────────┐
│                          User                              │
│               (operates browser + installs extension)      │
└───────────────────────────┬────────────────────────────────┘
                            │  installs / configures
                            ▼
┌────────────────────────────────────────────────────────────┐
│                      FacadeProxy                           │
│   [Browser Extension (MV3)]  ◄──►  [Local Proxy (Rust)]   │
│                                     (127.0.0.1 only)       │
└───────────────────────────┬────────────────────────────────┘
                            │  mutated HTTP requests
                            ▼
┌────────────────────────────────────────────────────────────┐
│                  Target Web Services                        │
│           (see only persona-consistent signals)            │
└────────────────────────────────────────────────────────────┘
```

**External actors:**
- **User** — installs extension, optionally starts proxy binary, configures personas.
- **Browser** — Chrome/Edge (MV3), Firefox (MV3, partial).
- **Target Web Services** — arbitrary; FacadeProxy has no knowledge of or trust in them.

### 4.2 C4 Level 2 — Container Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Browser Extension (MV3)                                                │
│                                                                         │
│  ┌─────────────────┐   ┌──────────────────┐   ┌──────────────────────┐ │
│  │  Service Worker  │   │  Content Script  │   │  Injected Page Script│ │
│  │  (background)    │   │  (ISOLATED world)│   │  (MAIN world)        │ │
│  │                  │   │                  │   │                      │ │
│  │ • webRequest hook│   │ • Bridge between │   │ • navigator.*        │ │
│  │ • declarativeNet │   │   worker ↔ page  │   │ • screen.*           │ │
│  │ • Proxy config   │   │ • Injects script │   │ • Intl.*             │ │
│  │ • Persona state  │   │   into MAIN world│   │ • Date.*             │ │
│  └────────┬─────────┘   └──────────────────┘   └──────────────────────┘ │
│           │ HTTP(S) via PAC / declarativeNetRequest                      │
└───────────┼─────────────────────────────────────────────────────────────┘
            │
            │ localhost:PORT (configurable, default 7878)
            ▼
┌───────────────────────────────────────────────────────────┐
│  Local Proxy (Rust binary)                                │
│                                                           │
│  ┌────────────────┐  ┌─────────────────┐  ┌───────────┐  │
│  │ Request Router │  │  Header Mutator │  │  Persona  │  │
│  │                │  │                 │  │  Store    │  │
│  │ • Accept conns │  │ • Applies active│  │  (TOML /  │  │
│  │   on 127.0.0.1 │  │   persona rules │  │   JSON)   │  │
│  │ • Forward to   │  │ • Injects noise │  │           │  │
│  │   target origin│  │ • Coherence     │  │           │  │
│  │                │  │   validation    │  │           │  │
│  └────────────────┘  └─────────────────┘  └───────────┘  │
└───────────────────────────────────────────────────────────┘
```

### 4.3 C4 Level 3 — Component Breakdown

| Component | Language | Owns | Key Constraint |
|-----------|----------|------|----------------|
| Service Worker | TypeScript (Vite/MV3) | webRequest interception, proxy PAC config, persona state sync | MUST use declarativeNetRequest for static rules; dynamic rules via chrome.declarativeNetRequest.updateDynamicRules |
| Content Script | TypeScript | Bridge: worker ↔ page; script injection trigger | Runs in ISOLATED world; cannot directly access page's JS globals |
| Page Script Injector | TypeScript | MAIN-world override of `navigator`, `screen`, `Intl`, `Date` | MUST be injected before any page script runs; use `document_start` run_at |
| Local Proxy | Rust (tokio + hyper) | HTTP/HTTPS proxy, header mutation, persona coherence | MUST bind only to 127.0.0.1; MUST NOT log request bodies |
| Persona Engine | Rust (shared lib) | Persona schema, coherence validation, noise generation | Single source of truth for persona consistency rules |
| Config & Storage | TOML + chrome.storage.local | Persona definitions, active persona ID, user settings | MUST NOT store browsing history or URL data |

### 4.4 Traffic Flow — Step-by-Step

```
1. Browser makes outbound HTTP(S) request
         │
2. Service Worker intercepts via webRequest / declarativeNetRequest
         │
3. Extension checks: is active persona set AND proxy reachable?
   ├── NO  → Pass through unmodified (INV-1)
   └── YES →
         │
4. Route request through PAC script to 127.0.0.1:PORT
         │
5. Local Proxy receives request
         │
6. Persona Engine validates coherence (geo + UA + language + timezone)
   ├── INCOHERENT → Log + Pass through (INV-3)
   └── COHERENT  →
         │
7. Header Mutator applies persona headers:
   (User-Agent, Accept-Language, Referer policy, geo-hint headers)
         │
8. Proxy forwards mutated request to target origin
         │
9. Response returned to browser unmodified
         │
10. Simultaneously (tab load event):
    Content Script triggers Page Script Injector
         │
11. Page Script runs in MAIN world at document_start:
    Overrides navigator.language, screen.width/height,
    Intl.DateTimeFormat, Date timezone offset to match
    the same persona applied in step 7
```

### 4.5 Persona Lifecycle State Machine

```
          ┌──────────┐
          │  UNSET   │ ◄─────────────────────────────────────┐
          └────┬─────┘                                        │
               │ user selects persona                         │ user clears
               ▼                                              │
          ┌──────────┐    coherence check fails    ┌──────────┴───┐
          │ PENDING  │ ──────────────────────────► │   INVALID    │
          └────┬─────┘                             └──────────────┘
               │ coherence check passes
               ▼
          ┌──────────┐    proxy unreachable        ┌──────────────┐
          │  ACTIVE  │ ──────────────────────────► │  DEGRADED    │
          │          │ ◄────────────────────────── │  (pass-thru) │
          └────┬─────┘    proxy reconnects         └──────────────┘
               │ session ends / tab closes
               ▼
          ┌──────────┐
          │ EXPIRED  │ (session persona only) → back to UNSET
          └──────────┘
```

**State definitions:**
- **UNSET** — No active persona; all requests pass through unmodified.
- **PENDING** — Persona selected; coherence validation in progress.
- **ACTIVE** — Persona fully applied: headers mutated + JS overrides live.
- **DEGRADED** — Proxy unreachable; JS overrides still applied but header mutation suspended; user badge indicator shown.
- **INVALID** — Persona config failed coherence check; system falls back to UNSET and logs error.
- **EXPIRED** — Session-scoped persona; tab/session closed.

---

## 5. Component Specifications

### 5.1 Browser Extension (MV3)

**Manifest permissions (see §8.4 for justification of each):**
```json
{
  "manifest_version": 3,
  "permissions": [
    "declarativeNetRequest",
    "declarativeNetRequestWithHostAccess",
    "storage",
    "scripting",
    "tabs"
  ],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js" }
}
```

**Service Worker responsibilities:**
- Maintain active persona state in `chrome.storage.local`.
- Register and update declarativeNetRequest rules when persona changes.
- Poll proxy health endpoint (`GET http://127.0.0.1:PORT/health`) every 30s; transition to DEGRADED state on failure.
- Expose internal message bus for content script communication.

**Content Script responsibilities:**
- Inject page script at `document_start`, `run_at: document_start`.
- Bridge persona payload from service worker to page script context.
- MUST NOT access or log page content, form data, or URL query params.

**Page Script (MAIN world) responsibilities:**
- Override `navigator.language`, `navigator.languages`, `navigator.userAgent`, `navigator.platform`.
- Override `screen.width`, `screen.height`, `screen.colorDepth`.
- Override `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- Override `Date` to return timezone-consistent values.
- All overrides MUST be applied atomically before any page script runs.
- MUST restore originals on persona UNSET (no permanent side effects).

### 5.2 Local Proxy (Rust)

**Runtime requirements:**
- Bind exclusively to `127.0.0.1:PORT` (default `7878`, user-configurable).
- Expose `GET /health` endpoint returning `200 OK` + JSON `{"status":"ok","persona":"<id>"}`.
- Expose `POST /persona` endpoint to receive persona updates from extension.
- Accept HTTP CONNECT for HTTPS tunneling; MUST NOT attempt to intercept TLS.
- Apply header mutations to outgoing CONNECT tunnels at the HTTP layer only.
- MUST NOT log request bodies, URL query strings, or response bodies.
- MUST NOT store request history beyond in-memory ring buffer (last 100 entries, debug mode only).

**Proxy config:**
```toml
[proxy]
bind_address = "127.0.0.1"
port = 7878
request_timeout_ms = 5000
max_connections = 100
log_level = "warn"   # "debug" in dev mode; never in release by default

[persona_defaults]
passthrough_on_failure = true
coherence_strict = false   # true = fail-closed on coherence; false = warn + apply
```

### 5.3 Persona Engine

A persona is the canonical unit of state shared between the proxy and the extension.

**Persona schema (TOML):**
```toml
[persona.example_eu]
id            = "example_eu"
display_name  = "EU / Firefox User"
user_agent    = "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0"
accept_lang   = "nl-NL,nl;q=0.9,en;q=0.8"
timezone      = "Europe/Amsterdam"
geo_region    = "NL"
screen_width  = 1920
screen_height = 1080
color_depth   = 24
platform      = "Linux x86_64"
```

**Coherence rules (enforced by Persona Engine):**
| Rule ID | Description | Failure action |
|---------|-------------|----------------|
| CR-01 | `timezone` MUST be consistent with `geo_region` (e.g., NL → Europe/Amsterdam) | Reject persona |
| CR-02 | `accept_lang` primary language MUST match `geo_region` locale | Warn or reject (per config) |
| CR-03 | `user_agent` platform token MUST match `platform` field | Reject persona |
| CR-04 | `screen_width` × `screen_height` MUST be a known-valid resolution | Warn |

### 5.4 Config & Storage Layer

- Personas stored in `chrome.storage.local` (extension) and mirrored to `~/.facadeproxy/personas.toml` (proxy).
- Active persona ID stored in `chrome.storage.session` (clears on browser close).
- MUST NOT use `chrome.storage.sync` (would exfiltrate data to Google servers — violates INV-2).
- Config file location: `~/.facadeproxy/config.toml` (Linux/macOS), `%APPDATA%\FacadeProxy\config.toml` (Windows).

---

## 6. Architectural Decision Records (ADRs)

> Format: **Context → Decision → Rationale → Consequences → Alternatives Rejected**

---

### ADR-001: Local Proxy vs Purely In-Extension Header Mutation

**Context:** MV3 extensions have restricted ability to modify arbitrary request headers via `declarativeNetRequest`. Some headers (e.g., `User-Agent`) are blocked from modification in certain browser versions. An alternative is to route traffic through a local proxy that has full header access.

**Decision:** Use a local Rust proxy for header mutation; use the extension for JS-layer overrides and proxy routing.

**Rationale:** A local proxy has unrestricted access to all headers before they leave the machine. It allows coherence validation in a single place and decouples network-layer mutation from browser API limitations.

**Consequences:**
- Users must install a companion binary (increases onboarding friction).
- Extension MUST degrade gracefully when proxy is absent (see INV-1).
- Binary distribution requires code signing and update channel management (see §10).

**Alternatives Rejected:**
- *Pure extension (declarativeNetRequest only):* Too restrictive in MV3; cannot mutate `User-Agent` reliably across all versions. Incoherent partial coverage is worse than no coverage (INV-3).
- *WebExtension native messaging only (no standalone proxy):* Native messaging requires persistent background page, not available in MV3 service workers.

---

### ADR-002: Obfuscation-First vs Blocking-First Strategy

**Context:** Traditional privacy tools block tracking requests entirely. This is detectable (empty responses, missing pixels, failed beacons are fingerprinting signals).

**Decision:** Inject plausible, coherent noise. Allow requests to proceed; mutate the signals they carry.

**Rationale:** A tracker that receives internally consistent but false signals cannot distinguish the persona from a real user. Blocking creates absence-of-signal, which is itself a distinguishing pattern.

**Consequences:**
- Tracking requests are not prevented — only polluted.
- Users expecting "blocking" behavior will be confused without clear UX communication.
- Detection evasion is probabilistic; a determined, well-resourced adversary can still detect obfuscation (see Known Limitations §16).

**Alternatives Rejected:**
- *Request blocking:* Highly detectable; out of scope (NG-03).
- *Header stripping (sending empty values):* Empty `Accept-Language` is a stronger fingerprint than a fake one.

---

### ADR-003: Persona Scope — Per-Session vs Per-Domain

**Context:** Should a persona be applied to all traffic globally for a session, or scoped per-domain?

**Decision:** Default to per-session, global scope. Per-domain scope is a Phase 2 feature behind an explicit UI toggle.

**Rationale:** Per-domain scope requires persistent mapping state that risks leaking domain-visit patterns (violates INV-2 spirit). Per-session is simpler, coherent, and sufficient for the primary use case.

**Consequences:**
- All tabs in a session share the same persona (desired for coherence).
- Per-tab or per-domain personas are deferred to Phase 2.

**Alternatives Rejected:**
- *Per-domain:* Adds storage complexity; domain-visit patterns become a side-channel.
- *Per-tab:* Extension messaging complexity increases significantly; coherence becomes harder to guarantee.

---

### ADR-004: Rust for Proxy Binary

**Context:** The proxy binary needs high concurrency, low latency overhead, and a small footprint with no runtime dependency.

**Decision:** Rust with `tokio` async runtime and `hyper` HTTP library.

**Rationale:** Rust provides memory safety without GC pauses, tokio handles high-concurrency I/O efficiently, and the binary compiles to a self-contained executable — no Node.js / Python runtime required on user machines.

**Consequences:**
- Build toolchain requires Rust stable + cargo.
- Cross-compilation for Windows (MSVC target) requires additional setup.

**Alternatives Rejected:**
- *Go:* Larger binary; GC pauses (minor but present); comparable ergonomics.
- *Node.js:* Requires runtime install; too heavy for a background proxy; startup time too slow.
- *Python:* Unsuitable for a distributed binary; startup latency unacceptable.

---

### ADR-005: MV3 over MV2

**Context:** Chrome is deprecating MV2. Firefox has partial MV3 support.

**Decision:** Target MV3 as the primary manifest version.

**Rationale:** MV2 deprecation timeline makes it an unsustainable target for new development. MV3 service workers and declarativeNetRequest are the supported path.

**Consequences:**
- Firefox MAIN-world injection has known gaps (see §7, Platform Support Matrix).
- Some header mutation capabilities differ between Chrome and Firefox MV3 implementations.

**Alternatives Rejected:**
- *MV2:* Deprecated; Chrome store will stop accepting MV2 updates.
- *Dual MV2/MV3 build:* Maintenance overhead doubles; inconsistent behavior surface.

---

### ADR-006: No Remote Telemetry by Default

**Context:** Crash reporting and telemetry would help developers; however, any remote transmission violates INV-2.

**Decision:** Zero remote telemetry. All observability is local-only (see §14). An explicit opt-in flag in config may enable local structured logging to file; no network transmission is ever permitted.

**Rationale:** The entire value proposition of FacadeProxy is local-first privacy. A tool that leaks usage data undermines its own purpose.

**Consequences:**
- No crash aggregation; issues must be reproduced locally.
- Debug mode produces verbose local logs; users must share logs manually when reporting issues.

**Alternatives Rejected:**
- *Opt-in remote crash reporting:* Violates INV-2 regardless of opt-in framing; trust model requires zero exfiltration.
- *Anonymized telemetry:* No anonymization scheme is provably zero-leakage for a fingerprinting-aware tool.

---

## 7. Platform Support Matrix

| Browser | OS | MV3 Support | MAIN-world Injection | Header Mutation | Status |
|---------|-----|-------------|----------------------|-----------------|--------|
| Chrome 115+ | macOS, Linux, Windows | ✅ Full | ✅ Full | ✅ Full | **Tier 1 — Fully Supported** |
| Edge 115+ | macOS, Linux, Windows | ✅ Full | ✅ Full | ✅ Full | **Tier 1 — Fully Supported** |
| Firefox 120+ | macOS, Linux, Windows | ⚠️ Partial | ⚠️ Partial (no `MAIN` world scripting in some versions) | ⚠️ Partial | **Tier 2 — Best Effort** |
| Brave | macOS, Linux, Windows | ✅ (Chromium-based) | ✅ | ✅ | **Tier 1** |
| Safari | macOS | ❌ No MV3 ext API parity | ❌ | ❌ | **Not Supported** |
| Chrome Android | Android | ❌ No desktop extensions | ❌ | ❌ | **Not Supported (NG-06)** |

**Firefox-specific known gaps:**
- `scripting.executeScript` with `world: "MAIN"` is not available in all Firefox MV3 versions.
- Workaround: inject via `<script>` tag from ISOLATED world content script.
- Risk: race condition between injected script and page's own scripts at `document_start`.
- This MUST be called out in user documentation.

---

## 8. Security Model and Threat Boundaries

### 8.1 Protected Assets

| Asset | Sensitivity | Location |
|-------|-------------|----------|
| User's real browser fingerprint | High | Browser runtime; never transmitted |
| Persona configuration (incl. UA strings) | Medium | Local disk + chrome.storage.local |
| Active persona state | Medium | chrome.storage.session (clears on close) |
| Request log ring buffer (debug only) | High | In-memory only; never persisted |
| Proxy binary integrity | Critical | Distribution channel (see §8.5) |

### 8.2 Threat Actors

| Actor | Motivation | Capability |
|-------|------------|------------|
| Tracking networks | Re-identify user despite persona | High: statistical analysis of behavioral patterns |
| Malicious web pages | Extract real navigator values via timing attacks or error paths | Medium |
| Supply-chain attacker | Compromise proxy binary to exfiltrate data | High |
| Local adversary (shared machine) | Read persona config from disk | Low–Medium |
| Browser extensions (other) | Access chrome.storage if manifest allows | Low (scoped storage) |

### 8.3 Attack Surfaces and Mitigations

| Surface | Attack Vector | Mitigation | Status |
|---------|--------------|------------|--------|
| Proxy binary distribution | Tampered binary exfiltrates traffic | Code-sign all release binaries; publish SHA-256 checksums; see §8.5 | ⬜ Phase 1 |
| Extension update channel | Malicious update via store | Chrome Web Store review process; pin store listing | ⬜ Phase 1 |
| localhost port | Another local process connects to proxy and routes malicious traffic | Proxy MUST validate `Origin` header on `/persona` POST; reject non-localhost callers | ⬜ Phase 1 |
| JS override completeness | Page accesses `navigator` via non-standard path (e.g., `Object.getOwnPropertyDescriptor`) | Use `Object.defineProperty` with non-configurable descriptors where possible | ✅ Designed |
| Debug log leakage | Verbose logs written to world-readable file | Logs written only to `~/.facadeproxy/debug.log`; `chmod 600` on creation | ⬜ Phase 1 |
| config.toml plaintext | Another process reads persona config | Config file `chmod 600` on creation; document risk | ⬜ Phase 1 |
| Incoherent persona detection | Adversary detects mismatched headers + JS values | Coherence engine enforces CR-01–CR-04; see §5.3 | ✅ Designed |

### 8.4 Permission Justification (Extension)

| Permission | Justification | Could be removed if... |
|------------|---------------|------------------------|
| `declarativeNetRequest` | Required to route traffic through local proxy via PAC | N/A — core function |
| `declarativeNetRequestWithHostAccess` | Required to modify headers on cross-origin requests | Header mutation dropped |
| `storage` | Store persona config and active persona ID locally | Personas stored only in proxy config |
| `scripting` | Inject page script into MAIN world for JS overrides | JS override feature dropped |
| `tabs` | Detect active tab changes to apply correct session persona | Per-tab persona dropped |
| `<all_urls>` host permission | Route all HTTP(S) traffic through persona-aware proxy | Scope reduced to allowlisted domains only (future option) |

> **Review commitment:** Every new permission request MUST be reviewed and justified in the PR that introduces it.

### 8.5 Supply-Chain Integrity

| Control | Description |
|---------|-------------|
| Binary code signing | All release binaries MUST be signed (Apple notarization for macOS; Authenticode for Windows; GPG detached sig for Linux) |
| SHA-256 checksums | Published alongside every release on GitHub Releases page |
| Dependency pinning | `Cargo.lock` MUST be committed and pinned; `package-lock.json` MUST be committed |
| Dependency audit | `cargo audit` and `npm audit` MUST run in CI and block on high/critical findings |
| Build reproducibility | Release builds MUST be reproducible (deterministic output); documented in `build/README.md` |

### 8.6 Vulnerability Disclosure Policy

- **Reporting channel:** GitHub Security Advisory (private) or `security@[project-domain]` (TBD).
- **Acknowledgment SLA:** 48 hours.
- **Patch SLA:** 14 days for critical; 30 days for high; 90 days for medium/low.
- **Disclosure:** Coordinated public disclosure after patch is published.
- **Scope:** Proxy binary, extension code, and persona engine only. Out-of-scope: browser vulnerabilities, OS-level issues.

---

## 9. Performance Targets and SLOs

### 9.1 Latency Budget

| Operation | Target (p50) | Target (p95) | Hard Limit | Failure action |
|-----------|-------------|-------------|------------|----------------|
| Proxy header mutation per request | < 2 ms | < 5 ms | 50 ms | Pass through unmodified |
| JS override injection (page_start) | < 5 ms | < 10 ms | 50 ms | Log + skip override |
| Persona coherence check | < 1 ms | < 3 ms | 20 ms | Reject persona |
| Proxy health poll response | < 20 ms | < 100 ms | 500 ms | Transition to DEGRADED |
| Full persona switch (end-to-end) | < 100 ms | < 300 ms | 1 s | Rollback to previous persona |

### 9.2 Operational SLOs

These SLOs are measured locally in debug/dev mode against the local telemetry ring buffer (see §14):

| SLO | Target | Measurement |
|-----|--------|-------------|
| Hook install success rate | ≥ 99% of page loads where extension is active | `hooks_installed / page_loads` |
| Proxy reachability rate (when user has started proxy) | ≥ 99.5% of health polls | `health_ok / health_polls` |
| Request mutation success rate | ≥ 99% of proxied requests | `mutated / total_proxied` |
| Coherence validation pass rate | ≥ 95% of configured personas | `coherent / validated` |
| Page load error rate attributable to extension | 0% | Zero broken page loads tolerated |

### 9.3 Degraded Mode Triggers

| Trigger | System Action | User Indicator |
|---------|---------------|----------------|
| Proxy health poll fails 3× in a row | Transition to DEGRADED; suspend header mutation; JS overrides continue | Extension badge turns yellow; tooltip: "Proxy unreachable — start FacadeProxy" |
| Coherence check fails on active persona | Transition to INVALID; fall back to UNSET | Extension badge turns red; tooltip: "Persona invalid — check config" |
| JS injection fails (scripting API error) | Log error; allow page load; persona partially applied | Console warning (debug mode only) |
| Proxy latency exceeds hard limit | Pass request through; log timeout | No visible indicator (silent pass-through per INV-1) |

---

## 10. Build, Packaging, and Release

### 10.1 Monorepo Layout

```
facadeproxy/
├── extension/               # Browser extension (TypeScript, Vite, MV3)
│   ├── src/
│   │   ├── background/      # Service worker
│   │   ├── content/         # Content scripts
│   │   ├── injected/        # MAIN-world page scripts
│   │   └── popup/           # Extension popup UI
│   ├── manifest.json
│   └── vite.config.ts
│
├── proxy/                   # Local proxy (Rust)
│   ├── src/
│   │   ├── main.rs
│   │   ├── proxy.rs
│   │   ├── persona.rs       # Persona engine + coherence validation
│   │   └── headers.rs       # Header mutation logic
│   └── Cargo.toml
│
├── personas/                # Default persona definitions (TOML)
│   └── defaults/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/                 # Playwright
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
│
├── Makefile
└── README.md
```

### 10.2 Build Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Rust stable | ≥ 1.77 | Proxy binary |
| cargo | bundled with Rust | Proxy build |
| Node.js | ≥ 20 LTS | Extension build |
| pnpm | ≥ 9 | Extension dependency management |
| Vite | ≥ 5 | Extension bundler |
| Playwright | ≥ 1.43 | E2E tests |

### 10.3 Build Commands

```bash
# Build everything
make all

# Extension only
make ext             # → dist/extension/

# Proxy only (current platform)
make proxy           # → dist/proxy/facadeproxy

# Cross-compile proxy for all platforms
make proxy-all       # requires cross / cargo cross

# Run all tests
make test

# Dev mode (proxy + extension hot reload)
make dev

# Package for release
make release         # → release/<version>/
```

### 10.4 Release Channels

| Channel | Audience | Update cadence | Stability |
|---------|----------|----------------|-----------|
| `stable` | All users | On milestone completion | High; all tests passing |
| `beta` | Opt-in testers | Bi-weekly | Medium; RC builds |
| `dev` | Contributors | Per-commit (nightly) | Low; may be broken |

- Stable and beta extension releases go through the Chrome Web Store review process.
- Proxy binary releases are GitHub Releases with signed binaries + checksums.
- Users on `stable` MUST NOT be auto-updated to `beta` without explicit opt-in.

### 10.5 Release Checklist

Before any public release:

**Code Quality**
- [ ] All CI checks passing (lint + typecheck + unit + integration + E2E)
- [ ] `cargo audit` — zero high/critical findings
- [ ] `npm audit` — zero high/critical findings
- [ ] No `TODO(release)` or `FIXME` markers in release-tagged code

**Security**
- [ ] Extension permissions diff reviewed vs previous release
- [ ] Proxy binary code-signed (platform-specific — see §8.5)
- [ ] SHA-256 checksums generated and attached to release
- [ ] `Cargo.lock` + `package-lock.json` committed and up to date

**Documentation**
- [ ] CHANGELOG.md updated
- [ ] Platform support matrix updated if browser support changed
- [ ] Any new known limitations documented in §16

**Compatibility**
- [ ] Tested on Chrome latest stable
- [ ] Tested on Firefox latest stable (Tier 2 matrix)
- [ ] Tested on macOS, Linux, Windows

**Rollout**
- [ ] Beta release published and soaked for ≥ 72 hours before stable promotion
- [ ] Rollback plan documented (link to previous stable release)

### 10.6 Rollback Strategy

| Scenario | Rollback Action |
|----------|----------------|
| Bad extension update (store) | Submit emergency update to store; document in GitHub issue; pin previous release SHA in README |
| Bad proxy binary release | GitHub Release marked as pre-release; previous release re-pinned as `latest` in release notes |
| Incompatible proxy ↔ extension version | Version compatibility table maintained in `proxy/COMPATIBILITY.md`; extension reports version mismatch to user |

> **Version compatibility contract:** The extension MUST embed `MIN_PROXY_VERSION` and `MAX_PROXY_VERSION` constants. On startup, the proxy version MUST be checked. Incompatible versions MUST surface a non-blocking warning, not a hard failure (INV-1).

---

## 11. CI/CD Pipeline Spec

### ci.yml — triggers: push to any branch, PR to main

```yaml
jobs:
  lint-typecheck:
    - pnpm install
    - pnpm run lint
    - pnpm run typecheck

  unit-tests:
    - pnpm run test:unit
    - cargo test --workspace

  integration-tests:
    - cargo test --test integration
    - pnpm run test:integration

  e2e-tests:
    - make proxy            # build proxy binary
    - make ext              # build extension
    - pnpm exec playwright test

  security-audit:
    - cargo audit
    - npm audit --audit-level=high

  build-check:
    - make proxy-all        # cross-compile; must succeed
    - make ext              # extension bundle must build
```

### release.yml — triggers: tag push `v*`

```yaml
jobs:
  build-release:
    - make release          # build all platforms
    - Sign binaries
    - Generate SHA-256 checksums

  publish-extension:
    - Upload to Chrome Web Store (beta or stable per tag suffix)

  publish-binaries:
    - Create GitHub Release
    - Attach signed binaries + checksums
```

**Branch policy:**
- `main` is protected; requires PR + passing CI + at least 1 review.
- Direct pushes to `main` MUST NOT be permitted.
- Release tags MUST be signed (`git tag -s`).

---

## 12. Testing Strategy

### 12.1 Test Pyramid

```
                 ┌─────────────────┐
                 │   E2E (Playwright)│  ← Fewest; full browser, real DOM
                 │  ~10–20 tests    │
                 └────────┬────────┘
               ┌──────────┴──────────┐
               │  Integration Tests  │  ← Proxy + extension API boundary
               │  ~30–50 tests       │
               └──────────┬──────────┘
          ┌───────────────┴───────────────┐
          │         Unit Tests             │  ← Most; pure logic, fast
          │  ~100–200 tests                │
          └────────────────────────────────┘
```

**Unit tests cover:**
- Persona coherence rules (CR-01 through CR-04)
- Header mutation logic (known inputs → expected output)
- JS override generation (persona → expected `Object.defineProperty` calls)
- State machine transitions (all valid + invalid transitions)
- Config parsing (valid TOML, malformed TOML, missing fields)

**Integration tests cover:**
- Proxy starts and binds to 127.0.0.1 only
- Health endpoint returns correct persona ID
- POST /persona updates active headers on next request
- Extension → proxy communication (message bus)
- Version compatibility check (min/max version contract)

**E2E tests cover (Playwright):**
- Page load succeeds with extension active + proxy running (INV-1 baseline)
- Page load succeeds with extension active + proxy NOT running (INV-1 degraded)
- `navigator.language` equals persona's `accept_lang` primary language post-injection
- `screen.width` / `screen.height` equals persona's values post-injection
- No page JS errors introduced by extension on a reference set of public pages
- Extension badge reflects ACTIVE / DEGRADED / INVALID states correctly

### 12.2 Test Coverage Gates

| Layer | Minimum line coverage | CI gate |
|-------|----------------------|---------|
| Persona engine (Rust) | 90% | Hard block |
| Header mutation (Rust) | 90% | Hard block |
| Service worker (TS) | 80% | Hard block |
| Page injector (TS) | 85% | Hard block |
| Content script (TS) | 75% | Warn |

---

## 13. Error Handling and Graceful Degradation

### Core principle: **silent success or silent pass-through; never silent corruption**

| Error class | Extension behavior | Proxy behavior | User visibility |
|-------------|-------------------|----------------|-----------------|
| Proxy unreachable | Route request normally; record DEGRADED state | N/A | Badge indicator |
| Coherence validation failure | Reject persona; revert to UNSET | Log + reject persona config | Badge + tooltip |
| JS injection failure (API error) | Log; allow page load | N/A | None (debug log only) |
| Persona config parse error | Mark persona INVALID; surface in popup | Log + skip persona | Popup error message |
| Proxy request timeout | Pass through unmodified | Return 504; extension routes direct | None |
| Extension message bus timeout | Log; use last known state | N/A | None |
| Unexpected JS error in injected script | catch block; restore original values | N/A | None |

**"Never break the page" enforcement:**
- Every function in the page injector script MUST be wrapped in `try/catch`.
- Catch blocks MUST call `restoreOriginals()` before re-throwing or swallowing.
- The proxy MUST return `200 CONNECT established` to the browser for HTTPS tunnels even if header mutation fails, then log the failure.

---

## 14. Observability and Monitoring

### 14.1 Local Telemetry (Opt-In)

**No data ever leaves the machine.** All observability is local.

By default: no persistent logging.
In debug mode (`log_level = "debug"` in `config.toml`): structured JSON logs to `~/.facadeproxy/debug.log`.

Log file rotation: max 10 MB; max 5 rotated files. Older files auto-deleted.
Log file permissions: `chmod 600` on creation.

### 14.2 Instrumentation Points

The proxy MUST maintain an in-memory ring buffer (last 100 entries, debug mode only) with the following counters, exposed at `GET /metrics` (localhost only):

```json
{
  "requests_total": 0,
  "requests_mutated": 0,
  "requests_passthrough": 0,
  "requests_timeout": 0,
  "persona_validations_passed": 0,
  "persona_validations_failed": 0,
  "health_polls_received": 0,
  "degraded_transitions": 0,
  "uptime_seconds": 0,
  "active_persona": "example_eu"
}
```

The extension popup SHOULD display a simplified version of these metrics when the proxy is reachable.

### 14.3 Troubleshooting Runbooks

**Runbook: Extension badge is yellow ("Proxy unreachable")**
1. Check if proxy binary is running: `ps aux | grep facadeproxy`
2. Check proxy is listening: `curl http://127.0.0.1:7878/health`
3. Check port conflict: `lsof -i :7878`
4. Check proxy config for correct bind address: `~/.facadeproxy/config.toml`
5. Restart proxy: `./facadeproxy`
6. If still unreachable, run `./facadeproxy --debug` and share `~/.facadeproxy/debug.log`

**Runbook: Extension badge is red ("Persona invalid")**
1. Open extension popup; note the specific validation error.
2. Check `personas.toml` for the failing persona.
3. Verify coherence rules CR-01 through CR-04 (§5.3).
4. Fix the offending field or select a different persona.

**Runbook: Page appears broken after enabling persona**
1. Open DevTools console on the broken page.
2. Check for errors mentioning `facadeproxy` or `navigator` override.
3. Disable persona (set to UNSET); confirm page loads correctly.
4. If page loads after disable: file a bug with the URL and persona config (redact personal data).
5. The broken-page scenario MUST NOT occur per INV-1; this is a P0 bug.

**Runbook: navigator.language doesn't reflect persona value**
1. Confirm extension is ACTIVE (green badge).
2. Open DevTools console; run `navigator.language`.
3. If still showing real value: check if page loaded before extension injected script (race condition).
4. Reload page with extension active; re-test.
5. If Firefox: see §7 Firefox MAIN-world injection known gap.

---

## 15. Rollout Plan

### Phase 0 — Foundation (Current)
- [ ] Proxy binary: HTTP CONNECT, header mutation, persona store, /health, /metrics
- [ ] Extension: Service worker, proxy routing via PAC, persona state management
- [ ] Coherence engine (CR-01 through CR-04)
- [ ] CI/CD pipeline (ci.yml)
- [ ] Unit + integration tests at coverage gates

### Phase 1 — Alpha (Private)
- [ ] JS override injection (MAIN world): navigator, screen, Intl, Date
- [ ] State machine full implementation (UNSET → ACTIVE → DEGRADED → INVALID)
- [ ] Extension popup UI (persona selector, status indicator, metrics)
- [ ] E2E test suite (Playwright)
- [ ] Code signing pipeline (release.yml)
- [ ] Security audit (threat model review)
- [ ] Pre-production gates (§0) completed

### Phase 2 — Beta (Opt-In Public)
- [ ] Per-domain persona scoping (ADR-003 Phase 2)
- [ ] Firefox Tier 2 support (MAIN-world workaround)
- [ ] Debug log viewer in extension popup
- [ ] Persona import/export (local file only)
- [ ] Beta channel soaked for ≥ 2 weeks

### Phase 3 — Stable Release
- [ ] Chrome Web Store submission (stable)
- [ ] Signed binary releases (GitHub Releases, all platforms)
- [ ] Public documentation site
- [ ] Vulnerability disclosure channel live

---

## 16. Known Limitations and Open Questions

### Known Limitations

| ID | Limitation | Severity | Mitigation / Status |
|----|------------|----------|---------------------|
| KL-01 | No guarantee of detection evasion; statistical behavioral analysis by sophisticated trackers may still re-identify | High (by design) | Documented in user-facing README; INV-4 is best-effort |
| KL-02 | Firefox MV3 MAIN-world injection is partial; JS overrides may not apply before page scripts in some versions | Medium | See §7; workaround documented; tracked as Phase 2 |
| KL-03 | HTTPS body traffic is not inspected (correct by design); header mutation applies to CONNECT tunnel only | Low | By design; out of scope |
| KL-04 | `navigator.webdriver` and `navigator.plugins` are not overridden in v1.0 | Medium | Planned for Phase 2 |
| KL-05 | Canvas fingerprinting, WebGL fingerprinting, AudioContext fingerprinting are not addressed | High (scope) | Out of scope for v1.0; separate ADR needed for v2 |
| KL-06 | Proxy binary requires separate install; onboarding friction for non-technical users | Medium | Package manager install scripts planned (Phase 3) |

### Open Questions

| ID | Question | Owner | Target Phase |
|----|----------|-------|--------------|
| OQ-01 | Should the proxy support SOCKS5 passthrough for users behind corporate proxies? | @knarayanareddy | Phase 2 |
| OQ-02 | Should per-tab persona be introduced, or is per-session sufficient for 90% of use cases? | @knarayanareddy | Phase 2 planning |
| OQ-03 | Is there a viable Firefox-compatible workaround for `world: "MAIN"` that avoids the race condition? | TBD | Phase 1 spike |
| OQ-04 | What is the long-term binary distribution strategy beyond GitHub Releases? (Homebrew, winget, apt?) | @knarayanareddy | Phase 3 |
| OQ-05 | Should coherence rules be user-extensible (custom TOML rules) or locked to engine-defined rules? | TBD | Phase 2 |

---

## 17. Glossary

| Term | Definition |
|------|-----------|
| **Persona** | A coherent set of browser identity signals: User-Agent, Accept-Language, timezone, geo-region, screen dimensions, platform |
| **Coherence** | The property that all signals in a persona are internally consistent (e.g., timezone matches geo-region) |
| **Obfuscation** | Injection of plausible false signals, as opposed to blocking or stripping signals |
| **MAIN world** | The JavaScript execution context shared with page scripts; distinct from the extension's ISOLATED world |
| **ISOLATED world** | The extension content script's execution context; shares the DOM but not the JS global scope with MAIN world |
| **Degraded mode** | The state where the proxy is unreachable; JS overrides continue but header mutation is suspended |
| **PAC script** | Proxy Auto-Configuration script; used by the extension to route browser traffic through the local proxy |
| **MV3** | Manifest Version 3; the current Chrome Extension manifest format |
| **declarativeNetRequest** | Chrome MV3 API for modifying network requests via static/dynamic rule sets |
| **INV-N** | Core invariant N; non-negotiable system constraint (see §3) |
| **ADR** | Architectural Decision Record; documents a significant design decision with context, rationale, and alternatives rejected |
| **SLO** | Service Level Objective; a measurable target for system behavior |
| **CR-N** | Coherence Rule N; a rule enforced by the Persona Engine (see §5.3) |
| **SSOT** | Single Source of Truth; this document is the authoritative spec for FacadeProxy |

---

*FacadeProxy Production Engineering Specification — v1.0.0 — SSOT*
*Owned by @knarayanareddy — Replace prior informal blueprint FacadeProxydesigndoc.md with this file.*
```

---

## What this doc adds over the original — at a glance

| Dimension | Original doc | This replacement |
|---|---|---|
| Doc governance | None | Version table, changelog, SSOT declaration, pre-production gates |
| Goals/Non-Goals | ✅ Present | ✅ Retained + RFC-2119 priority column (MUST/SHOULD) |
| Architecture diagrams | 1 flat diagram | C4 L1 + C4 L2 + C4 L3 component table |
| Persona state machine | Not present | Full UNSET → ACTIVE → DEGRADED → INVALID state machine |
| ADRs / Alternatives | Not present | 6 ADRs with full context/rationale/alternatives-rejected |
| Security / Threat model | Mentioned | Full threat actor table + attack surface + mitigation matrix |
| Permission justification | Not present | Per-permission justification table |
| Supply-chain integrity | Not present | Signing, checksums, audit, reproducible builds |
| Vuln disclosure policy | Not present | SLAs + channel + scope |
| Performance / SLOs | Perf targets only | Latency budget + SLO table + degraded mode triggers |
| Observability | Not present | Metrics endpoint spec + in-memory ring buffer + log rotation |
| Troubleshooting runbooks | Not present | 4 runbooks (proxy unreachable, invalid persona, broken page, lang mismatch) |
| Release / Rollback | Build commands only | Release channels + full checklist + rollback strategy + version compat contract |
| CI/CD | Not present | Full ci.yml + release.yml job specs |
| Known limitations | Partial | Full table with severity + mitigation status |
| Open questions | Partial | Formal table with owner + target phase |
