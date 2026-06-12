# Remaining tasks for a 9.5/10 production release

This document separates what has been implemented in-repo from what must still be executed externally by the project owner or release/security partners.

## Status summary

Implemented in repo:

- strict network+JS coherence gating;
- proxy restart persona re-sync;
- synchronous MAIN-world bootstrap from `/persona/current`;
- RFC-correct CONNECT success behavior;
- token-protected mutation endpoints;
- rotating local debug log with `0600` file permissions on Unix;
- persona TOML mirroring endpoint;
- Chromium + Firefox extension packaging paths;
- Playwright E2E scaffold;
- reproducible unsigned artifact script;
- SBOM generation script;
- CI matrix and release workflow scaffolding;
- audit/store/release documentation.

Still required externally:

| ID | Task | Owner | Blocking? | Why it cannot be completed by the agent alone |
|---|---|---:|---:|---|
| EXT-01 | Independent security audit | Project owner + third-party auditor | Yes | Must be performed by a person/team independent of implementation. |
| EXT-02 | Reproducibility verification on clean machines | Release engineer | Yes | Requires separate trusted machines/runners and artifact comparison. |
| EXT-03 | Apple Developer signing + notarization | Project owner | Yes for macOS release | Requires Apple account, Developer ID cert, app-specific password, and legal acceptance. |
| EXT-04 | Windows Authenticode signing | Project owner | Yes for Windows release | Requires code-signing certificate/private key and timestamp setup. |
| EXT-05 | Linux GPG/Sigstore release identity | Project owner | Yes for Linux release | Requires release key ownership and secure key custody. |
| EXT-06 | Chrome Web Store submission | Project owner | Yes for public extension release | Requires developer account, legal acceptance, listing ownership. |
| EXT-07 | Edge Add-ons submission | Project owner | Optional/Yes if Edge advertised | Requires Microsoft Partner Center/Add-ons account. |
| EXT-08 | Firefox Add-ons submission | Project owner | Yes if Firefox advertised | Requires AMO account and Firefox compatibility validation. |
| EXT-09 | Legal/privacy review | Project owner/legal | Yes | Privacy policy and claims must be approved by project owner/legal counsel. |
| EXT-10 | Browser matrix QA | QA/release engineer | Yes | Must run against real Chrome/Edge/Firefox versions on Windows/macOS/Linux. |

## Exit criteria for 9.5/10

A release can be considered 9.5/10 production-ready only when all of the following are true:

- [ ] all CI jobs pass on `main`;
- [ ] Playwright E2E passes in CI and on at least one local clean machine;
- [ ] manual QA matrix completed for Chrome/Edge on macOS, Windows, and Linux;
- [ ] Firefox package either passes AMO-compatible QA or Firefox support is explicitly removed from claims;
- [ ] independent audit has no unresolved critical/high findings;
- [ ] unsigned reproducible artifacts have matching hashes across two clean environments;
- [ ] release artifacts have SBOMs and provenance attestations;
- [ ] platform binaries are signed/notarized as applicable;
- [ ] extension store package passes store validation;
- [ ] privacy policy and support contact are live;
- [ ] vulnerability disclosure channel is live;
- [ ] rollback plan tested.

## Recommended release decision

Do not publish a stable public release until all blocking items above are complete. Private alpha/beta distribution is acceptable only with clear disclaimers and opt-in testers.
