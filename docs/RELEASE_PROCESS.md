# Release process

## Release channels

| Channel | Audience | Requirements |
|---|---|---|
| dev | contributors | CI green on branch |
| alpha | private testers | CI green, unsigned artifacts, known limitations accepted |
| beta | opt-in public testers | audit started, signed artifacts, store beta listing |
| stable | public users | all production gates complete |

## Pre-release checklist

- [ ] Version bumped in `extension/package.json`, `proxy/Cargo.toml`, and manifests.
- [ ] CHANGELOG/release notes updated.
- [ ] `make test` passes.
- [ ] `make clippy` passes.
- [ ] `npm --prefix extension audit --audit-level=high` passes.
- [ ] `cargo audit` passes.
- [ ] `cargo deny check` passes.
- [ ] Playwright E2E passes.
- [ ] SBOM generated.
- [ ] Reproducible unsigned artifacts generated twice and hashes match.
- [ ] Security audit findings triaged.
- [ ] Store package tested as unpacked extension.

## Build unsigned artifacts

```bash
scripts/reproducible-build.sh
scripts/generate-sbom.sh
```

## Signing requirements

### Linux

- GPG detached signatures for every artifact.
- SHA-256 checksums.
- Optional Sigstore/cosign keyless signatures.

### macOS

Required external setup:

- Apple Developer account;
- Developer ID Application certificate;
- app-specific password;
- notarytool configured in CI secrets.

Release workflow must perform:

```bash
codesign --force --timestamp --options runtime --sign "Developer ID Application: ..." facadeproxy
xcrun notarytool submit <artifact> --wait
xcrun stapler staple <artifact>
spctl --assess --type execute --verbose <artifact>
```

### Windows

Required external setup:

- Authenticode certificate;
- timestamp server;
- secure key custody.

Release workflow must perform:

```powershell
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /f cert.pfx /p $PASSWORD facadeproxy.exe
signtool verify /pa /v facadeproxy.exe
```

## GitHub release

Release workflow creates a draft release. Before publishing:

- [ ] attach signed binaries;
- [ ] attach signatures/checksums;
- [ ] attach SBOM;
- [ ] attach provenance;
- [ ] attach notarization/signing verification logs;
- [ ] link security audit summary;
- [ ] confirm rollback artifact is available.

## Rollback

- Extension store: submit emergency update or unpublish version per store policy.
- Proxy binary: mark bad GitHub release as pre-release and re-pin previous version.
- Compatibility issue: extension must show non-blocking mismatch warning and disable persona activation if coherence cannot be guaranteed.
