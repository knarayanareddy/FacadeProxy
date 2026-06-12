# FacadeProxy independent security audit package

## Audit objective

Determine whether FacadeProxy safely enforces its local-first privacy invariants and does not create incoherent persona states that make users more fingerprintable.

## Scope

### In scope

- Rust proxy source under `proxy/`.
- Browser extension source under `extension/src/`.
- MV3 manifest permissions.
- Localhost control API.
- Persona validation/coherence engine.
- PAC and DNR activation logic.
- MAIN-world injection and synchronous bootstrap.
- Proxy restart and rollback behavior.
- Debug logging and privacy guarantees.
- Release workflow and SBOM/reproducible-build scripts.

### Out of scope unless separately contracted

- Full anonymity claims.
- Tor/VPN-level traffic analysis.
- Mobile browsers.
- Legal review.
- Chrome Web Store policy review.

## Security invariants to verify

1. Proxy binds only to loopback.
2. No remote telemetry exists.
3. No request/response bodies are logged.
4. Persona is not applied to JS unless proxy/DNR/PAC readiness is confirmed.
5. Proxy restart does not leave JS spoofing active with network passthrough.
6. `/persona` mutation endpoints require token when configured.
7. CORS does not allow remote web pages to mutate persona.
8. CONNECT handler does not report success before upstream TCP connection succeeds.
9. Debug logs use restricted permissions and rotation.
10. Extension cannot silently enter an incoherent ACTIVE state.

## High-risk files

- `extension/src/background/background.ts`
- `extension/src/content/content.ts`
- `extension/src/injected/injected.ts`
- `extension/public/manifest.json`
- `proxy/src/proxy.rs`
- `proxy/src/persona.rs`
- `proxy/src/headers.rs`
- `proxy/src/logging.rs`
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`

## Required auditor tests

- Kill/restart proxy while persona is active; verify extension re-syncs or rolls back.
- Block `/persona` token; verify no JS-only active state remains.
- Force DNR install failure; verify persona activation fails.
- Force PAC permission failure; verify persona activation fails.
- Test early inline page fingerprint script.
- Test malicious remote origin attempting `/persona` mutation.
- Test local process attempting mutation without token.
- Test malformed CONNECT requests.
- Test upstream CONNECT failure.
- Test logs for URL query/body leakage.

## Deliverables requested from auditor

- Executive summary.
- Severity-ranked findings.
- Reproduction steps.
- Affected files/functions.
- Recommended remediations.
- Retest results.
- Final release recommendation.

## Finding severity rubric

| Severity | Definition |
|---|---|
| Critical | Direct privacy breach, remote persona mutation, or guaranteed incoherent ACTIVE state. |
| High | Practical exploit or common failure causing privacy/coherence degradation. |
| Medium | Harder-to-exploit issue, incomplete hardening, or misleading UX. |
| Low | Defense-in-depth, maintainability, minor policy gaps. |
