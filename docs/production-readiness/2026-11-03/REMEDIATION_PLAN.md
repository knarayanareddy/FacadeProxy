# FacadeProxy remediation plan

Future work only; findings are in [REVIEW.md](REVIEW.md). Pin the revision and preserve tests and gates. Commands are **planned**, not run.

## Dependency map and phases

| Phase | Task | Depends on | Exit criterion |
|---|---|---|---|
| 0: baseline | T1 | Owner approves isolated environment | Reproductions or explicitly scoped unknowns |
| 1: controls | T2 | T1 | Origin/auth negative tests pass |
| 1: coherence | T3 | T1, T2 | No unverified activation on tested paths |
| 2: correctness | T4 | T1, T3 | Date-specific behavior independently checked |
| 3: automation | T5 | T1–T4 | CI covers proxy, failure and browser boundaries |
| 4: UX and operations | T6 | T3, T5 | User state and recovery observed |
| 5: release acceptance | T7 | T1–T6 and owner approvals | Independent evidence, release decision recorded |

### T1 — Capture baseline and explain failures (F1–F6)

**Prerequisites:** owner approval for a disposable environment; pinned checkout and access to historical Actions logs. **Observed paths:** `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `extension/package.json`, `proxy/Cargo.toml`.

1. Record SHA, toolchains and historical failed steps; preserve log links without secrets.
2. Reproduce origin, message, bootstrap, timezone and E2E findings; distinguish browser blocks from server acceptance.
3. After approval, run existing checks, for example planned `npm --prefix extension run test:unit` and `cargo test --manifest-path proxy/Cargo.toml --all-targets`. Record results and environment.

**Deliverable:** reproduction matrix and CI root causes. **Verification:** second reviewer repeats against the same SHA. **DoD:** [ ] Findings reproduced or marked inconclusive; [ ] failures attributed to observed steps.

### T2 — Fix control API trust boundaries (F1; preventive data protection)

**Prerequisites:** T1 and owner decision on allowed local/extension origins, token provisioning and compatibility. **Observed path:** `proxy/src/proxy.rs`; extension settings in `extension/src/background/background.ts`.

1. Parse origins and compare exact scheme, host and port; define missing, malformed, IPv6 and extension-ID handling.
2. Require a strong production mutation token; define provisioning, rotation, logging and local-process trust. Review read endpoints, payload limits and persona exposure.
3. Test lookalike hosts, remote/extension/no-origin requests, tokens and oversized or malformed bodies, preserving legitimate clients.

**Deliverable:** control API policy, implementation and tests. **Verification:** independent HTTP tests assert status, CORS and unchanged persona on denial; browser test checks network restrictions. **DoD:** [ ] Lookalikes denied; [ ] unauthorized mutation fails; [ ] owner approves secret and persona handling.

### T3 — Make activation and page injection coherent (F2–F3)

**Prerequisites:** T1, T2 and a threat model acknowledging that MAIN-world page scripts are untrusted. **Observed paths:** `extension/src/injected/injected.ts`, `extension/src/background/background.ts`, `extension/public/manifest.json`.

1. Design the activation protocol so page-controlled messages cannot authorize persona changes and a proxy persona alone cannot prove PAC/DNR readiness; explicitly document limits of any same-page channel.
2. Wire the chosen mechanism through actual startup, activation, navigation, restart and rollback paths; avoid reporting ACTIVE until the required state is verified. Decide and document direct-fallback behavior.
3. Test a malicious page forging APPLY/CLEAR, proxy preloaded independently, blocked PAC/DNR setup, restart during navigation, and cleanup failures; check both page values and real network traffic.

**Deliverable:** reviewed trust-boundary design and integrated change. **Verification:** independent browser observer checks early inline JS, proxy traffic and extension state; deliberately remove the readiness gate and confirm a negative test fails. **DoD:** [ ] Tested unauthorized messages cannot change trusted activation; [ ] Failure and recovery do not silently claim coherence; [ ] remaining browser limitations are documented.

### T4 — Correct timezone semantics (F4)

**Prerequisites:** T1, T3; owner chooses accurate historical/DST behavior or an explicitly reduced support claim. **Observed path:** `extension/src/injected/injected.ts`.

1. Define `getTimezoneOffset` for each instant, DST transitions, invalid dates and explicit offsets.
2. Implement independently checked timezone rules or reject unsupported configurations; align claims and formatting.
3. Test Amsterdam winter/summer, transition boundaries, another zone and invalid dates against an independent reference.

**Deliverable:** date-aware behavior or an explicit, tested limitation. **Verification:** change one expected offset or revert date awareness and confirm the test fails. **DoD:** [ ] Dates and transition cases match reference; [ ] unsupported cases fail or are disclosed rather than silently misrepresented.

### T5 — Strengthen browser and supply-chain gates (F5–F6)

**Prerequisites:** T1–T4. **Observed paths:** `extension/e2e/facadeproxy.spec.ts`, `.github/workflows/ci.yml`, `extension/package-lock.json`, `proxy/Cargo.lock`.

1. Add a controlled non-PAC-bypassed destination with an independently observable proxy request/tunnel; retain the existing localhost early-script assertion as a separate test.
2. Add proxy-down, CONNECT failure, DNR/PAC rejection, bad token, worker restart and browser-matrix cases. Ensure proxy-disabled or forwarding-broken mutations fail the relevant test; isolate ports and clean up processes.
3. Repair actual failed CI steps, align supported toolchains and pin/review third-party actions and audit/SBOM tools; inspect both lockfiles and investigate advisories without suppressing gates.

**Deliverable:** reproducible CI jobs and meaningful cross-boundary tests. **Verification:** independently inspect job logs and artifacts on the candidate SHA; repeat on clean runners and verify negative controls fail. **DoD:** [ ] Proxy traversal is measured, not inferred from headers; [ ] no failed/skipped required gate is represented as passing; [ ] dependency findings are tracked to closure or owner acceptance.

### T6 — UX, recovery and operations (F2–F3, F6; preventive)

**Prerequisites:** T3 and T5; owner confirms supported browsers and whether local persona files require backup. **Observed paths:** `extension/src/background/background.ts`, `extension/src/popup/popup.ts`, `proxy/src/main.rs`; popup source remains uninspected.

1. Review popup and badge states against actual transitions; make degraded and token errors understandable without relying on color alone, and document routing/privacy limitations.
2. Test keyboard access, screen-reader status announcements and contrast on the supported browser matrix; add targeted automated checks where feasible and record manual results.
3. Document secure persona/config backup, restore, token replacement, extension removal and proxy recovery; exercise a restore on disposable data and verify resulting state and permissions.

**Deliverable:** accessible operational guidance and a recovery runbook. **Verification:** independent operator follows it on a clean profile, observes restored data and confirms failure messaging. **DoD:** [ ] Keyboard and assistive-technology results recorded; [ ] restore and degraded-state drill observed; [ ] no real tokens or browsing data captured in evidence.

### T7 — Independent acceptance and controlled release (F6; preventive)

**Prerequisites:** T1–T6, external auditor and platform/store account access. **Observed paths:** `.github/workflows/release.yml`, `docs/REMAINING_PRODUCTION_TASKS.md`; any new release policy file is proposed, not observed.

1. Commission independent review of the exact candidate and retest outstanding security findings; verify browser/OS support and approved privacy claims.
2. Compare clean-machine build hashes, verify SBOM and provenance against the actual artifacts, implement applicable platform signing/notarization and verify signatures independently; never treat placeholders as signing.
3. Require explicit owner approval before store submission or publication; record candidate SHA, artifact hashes, evidence links and outstanding risks. Rehearse rollback to a previously verified signed version and document revocation/key compromise response.

**Deliverable:** signed acceptance record and release/rollback policy. **Verification:** independent reviewer checks artifact-to-SHA binding, signature verification, audit closure, and an observed rollback; do not infer deployment from a workflow exit code. **DoD:** [ ] Owner approves supported platforms and credentials; [ ] mandatory audit, CI, browser, reproducibility and recovery evidence exists; [ ] release remains blocked if any required gate is unresolved.

## Production acceptance and approvals

- [ ] F1–F5 corrected or explicitly dispositioned with independently observed evidence; no test-count substitute for coverage.
- [ ] F6 failures resolved at the release SHA; platform signing, store review and legal/privacy approval completed where applicable.
- [ ] Security-sensitive architecture, token policy, public claims, signing identities and publication approved by the owner.
- [ ] Release is staged before publication; retain prior verified artifacts and documented rollback procedure. A rollback or restore is complete only when independently observed, not when a command merely exits successfully.
