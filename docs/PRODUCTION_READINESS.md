# Production readiness assessment

## Current state

FacadeProxy is now a hardened release-candidate foundation, not merely a prototype. The repo includes in-code remediations for the most serious expert-reviewed issues and scaffolding for production release operations.

## Expert feedback remediation status

| Finding | Status | Notes |
|---|---|---|
| Async injection race | Mitigated in repo | MAIN script loads at `document_start` and synchronously queries `/persona/current`; stale sessionStorage is cleared if proxy is unset/unreachable. |
| Proxy restart state desync | Fixed | Background polls `/health.persona` and re-POSTs active persona or rolls back. |
| Premature CONNECT success | Fixed | Proxy now connects upstream before returning `200 Connection Established`. |
| Firefox MAIN-world compatibility | Mitigated | Added Firefox build script that removes declarative MAIN world and uses script-tag fallback. Requires AMO QA. |
| Advanced fingerprint surfaces | Partially mitigated | Added plugins/mimeTypes, basic Canvas/WebGL/Audio perturbation, but not complete anti-fingerprinting. |
| Debug log rotation/permissions | Fixed | Rotating JSON debug log, 10 MB x 5 files, `0600` file permissions on Unix. |
| Persona TOML sync | Implemented | Extension can POST persona list to proxy `/personas`; proxy writes TOML with restricted permissions. |
| CI/CD/release automation | Scaffolded | CI, E2E scaffold, SBOM, reproducible build, release placeholders added. Real signing secrets still required. |

## Honest rating

- Code-level readiness: ~8/10.
- Operational public-release readiness before external gates: ~7/10.
- Production readiness after external audit/signing/store/QA gates: target 9+.

## Why not self-certify 9.5 yet?

A 9.5/10 production rating requires independent verification and operational controls outside the codebase:

- third-party security audit;
- clean-machine reproducibility verification;
- signed/notarized platform artifacts;
- browser store review;
- legal/privacy approval;
- browser matrix QA.

These are tracked in `docs/REMAINING_PRODUCTION_TASKS.md`.
