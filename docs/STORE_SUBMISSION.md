# Browser store submission guide

## Packages

Generate store packages:

```bash
scripts/package-store.sh
```

Outputs:

```text
packaging/store/facadeproxy-chromium-store.zip
packaging/store/facadeproxy-firefox-store.zip
packaging/store/SHA256SUMS.txt
```

## Chrome Web Store checklist

- [ ] Chrome developer account created.
- [ ] Extension ZIP uploaded.
- [ ] Single-purpose description: local coherent persona mutation.
- [ ] Permission justifications filled in.
- [ ] Privacy policy URL live.
- [ ] Support contact live.
- [ ] Screenshots uploaded.
- [ ] Promotional tile uploaded.
- [ ] Data-use declaration completed: no remote telemetry, local storage only.
- [ ] Remote code declaration: no remote code.
- [ ] Host permission justification: all URLs needed for selected persona JS and request-header surfaces.
- [ ] `proxy` permission justification: required for localhost PAC routing.

## Permission justification copy

### `proxy`

FacadeProxy configures a local PAC proxy to route browser HTTP(S) traffic through a user-controlled `127.0.0.1` proxy process. This is necessary to maintain network-layer persona coherence and is never used to route traffic to a remote service.

### `declarativeNetRequest`, `declarativeNetRequestWithHostAccess`

Required to apply request-header persona rules such as `User-Agent`, `Accept-Language`, and client-hint platform values. Rules are local and generated from user-selected personas.

### `storage`

Stores persona definitions, extension settings, and session activation state locally. The extension does not use `chrome.storage.sync`.

### `tabs`

Used to broadcast persona activation/clear messages to existing tabs and update page-context scripts.

### `scripting`

Reserved for MV3 programmatic injection and browser compatibility paths.

### `<all_urls>`

Needed to apply selected persona JavaScript overrides consistently across pages the user visits. No page content, form data, request bodies, or browsing history are collected or transmitted.

## Store listing draft

### Short description

Local-first browser persona control for coherent request-header and JavaScript-visible identity signals.

### Long description

FacadeProxy is a local-first privacy research tool that lets users apply coherent browser personas across selected request-header and JavaScript-visible browser surfaces. It combines a browser extension with a localhost Rust proxy and does not send telemetry or browsing data to any remote service.

FacadeProxy is not a VPN, Tor replacement, ad blocker, or complete anti-fingerprinting browser. It does not hide your IP address and cannot guarantee evasion from advanced fingerprinting systems.

### Privacy summary

- No remote telemetry.
- No account required.
- No cloud sync.
- Persona settings are stored locally.
- Proxy binds only to loopback.
- Request/response bodies are not logged.

## Firefox / AMO note

Firefox MV3 MAIN-world support differs from Chromium. The Firefox package uses an isolated content script plus script-tag fallback. Do not advertise Firefox as Tier 1 unless AMO validation and manual QA pass.
