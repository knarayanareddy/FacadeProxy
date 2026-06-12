# Contributing to FacadeProxy

## Development rules

- Preserve core invariants in `docs/ARCHITECTURE.md`.
- Never introduce remote telemetry.
- Never apply page JavaScript persona without network-layer readiness.
- Never log request/response bodies.
- Never request new extension permissions without documenting why.

## Local checks

```bash
npm --prefix extension ci
npm --prefix extension run lint
npm --prefix extension run typecheck
npm --prefix extension run test:unit
npm --prefix extension run build
cargo fmt --manifest-path proxy/Cargo.toml --check
cargo clippy --manifest-path proxy/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path proxy/Cargo.toml --all-targets
```

## Pull request checklist

- [ ] Tests added/updated.
- [ ] Security/privacy impact described.
- [ ] Extension permission changes justified.
- [ ] Persona coherence behavior unchanged or improved.
- [ ] Docs updated.
- [ ] No remote telemetry added.

## Security-sensitive changes

Changes to the following require extra review:

- `proxy/src/proxy.rs`
- `extension/src/background/background.ts`
- `extension/src/injected/injected.ts`
- `extension/public/manifest.json`
- CI/release workflows
