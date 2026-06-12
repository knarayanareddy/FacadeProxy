# Changelog

## 0.1.0 - unreleased

### Added

- Rust localhost proxy with `/health`, `/metrics`, `/persona`, `/persona/current`, and `/personas` endpoints.
- Token-protected persona mutation endpoints.
- RFC-correct CONNECT handling that connects upstream before returning `200`.
- Persona coherence validation.
- Persona TOML mirroring from extension to proxy.
- Rotating debug log with restricted Unix permissions.
- Chromium MV3 extension with PAC proxy routing, DNR header rules, and popup UI.
- Synchronous MAIN-world bootstrap from proxy `/persona/current`.
- Proxy restart re-sync logic.
- Firefox manifest build variant.
- Playwright E2E scaffold.
- Reproducible unsigned artifact script.
- SBOM generation script.
- CI and release workflow scaffolding.
- Audit, release, store, privacy, and operations documentation.

### Known limitations

- Not a complete anti-fingerprinting browser.
- TLS ClientHello / JA3 / JA4 fingerprints are not modified.
- Firefox support requires additional AMO/browser validation.
- Public release requires external audit, signing, notarization, and store review.
