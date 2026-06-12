# FacadeProxy Rust proxy

Localhost persona-aware HTTP proxy for FacadeProxy.

## Build

```bash
cargo build --release
```

## Run

```bash
export FACADEPROXY_AUTH_TOKEN="replace-with-random-secret"
cargo run -- \
  --personas ../personas/defaults/personas.toml \
  --auth-token "$FACADEPROXY_AUTH_TOKEN" \
  --debug
```

## Endpoints

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /health` | no | proxy health, version, active persona ID, auth-required flag |
| `GET /metrics` | no | local counters |
| `GET /persona/current` | no | read-only active fake persona for synchronous page bootstrap |
| `POST /persona` | token when configured | set active persona |
| `DELETE /persona` | token when configured | clear active persona |
| `POST /personas` | token when configured | mirror extension personas to TOML |

## Security properties

- Refuses non-loopback bind addresses.
- Does not terminate TLS.
- Does not inspect request/response bodies.
- CONNECT returns success only after upstream TCP connect succeeds.
- Mutation APIs require `X-FacadeProxy-Token` when configured.
- Debug logs rotate at 10 MB x 5 and use `0600` file permissions on Unix.

## Logging

```bash
facadeproxy --debug --log-file ~/.facadeproxy/debug.log
```

If `--debug` is set without `--log-file`, the default path is `~/.facadeproxy/debug.log` on Linux/macOS and `%APPDATA%\\FacadeProxy\\debug.log` on Windows.
