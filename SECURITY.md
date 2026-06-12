# Security policy

FacadeProxy is a local-first privacy/fingerprinting research tool. Treat every release as security-sensitive.

## Supported versions

No public stable release exists yet. The current `0.1.x` line is a prototype/hardening branch.

## Reporting vulnerabilities

Before a public project domain exists, report privately through GitHub Security Advisories. Do not file public issues for exploitable vulnerabilities.

When reporting, include:

- FacadeProxy version/commit.
- Browser and OS.
- Proxy command-line/configuration.
- Reproduction steps.
- Whether `--auth-token` was configured.

Do not include browsing history, cookies, request bodies, or secrets.

## Current security posture

Implemented controls:

- Proxy refuses non-loopback bind addresses.
- Proxy does not terminate TLS and does not inspect request/response bodies.
- `/persona` rejects non-local/non-extension web origins.
- `/persona` supports a shared secret via `X-FacadeProxy-Token`.
- Control endpoint CORS is origin-echoed for allowed origins only; no wildcard control CORS.
- Extension refuses JS-only persona activation when proxy/PAC/DNR readiness is not confirmed.
- Extension rolls back persona state on `chrome.proxy.onProxyError` and health-check failures.
- No remote telemetry.

Required before public release:

- Independent threat-model review.
- External security audit.
- Signed and reproducible release binaries.
- Chrome Web Store / Edge Add-ons permission review.
- Firefox MV3 compatibility decision.
- SBOM generation and dependency provenance review.
