# Operations guide

## Local paths

| Item | Linux/macOS | Windows |
|---|---|---|
| Config | `~/.facadeproxy/config.toml` | `%APPDATA%\\FacadeProxy\\config.toml` |
| Personas | `~/.facadeproxy/personas.toml` | `%APPDATA%\\FacadeProxy\\personas.toml` |
| Debug log | `~/.facadeproxy/debug.log` | `%APPDATA%\\FacadeProxy\\debug.log` |

## Start proxy

```bash
export FACADEPROXY_AUTH_TOKEN="replace-with-random-secret"
facadeproxy --personas ~/.facadeproxy/personas.toml --auth-token "$FACADEPROXY_AUTH_TOKEN" --debug
```

## Health checks

```bash
curl http://127.0.0.1:7878/health
curl http://127.0.0.1:7878/metrics
curl http://127.0.0.1:7878/persona/current
```

## Debug logging

When `--debug` is set, logs are written to `~/.facadeproxy/debug.log` by default. You can override with:

```bash
facadeproxy --debug --log-file /path/to/debug.log
```

Log behavior:

- JSON structured logs;
- max file size 10 MB;
- max 5 rotated files;
- `0600` permissions on Unix;
- no request bodies, response bodies, or query strings.

## Common runbooks

### Proxy unreachable

1. Confirm process is running.
2. Confirm listening port: `curl http://127.0.0.1:7878/health`.
3. Check port conflict.
4. Check config bind address is loopback.
5. Restart proxy.
6. Review debug log.

### Extension shows DEGRADED

1. Open popup and check last error.
2. Confirm token matches proxy `--auth-token`.
3. Confirm `/health.persona` matches selected persona.
4. Re-apply persona.
5. If still degraded, inspect DNR/proxy permission errors in extension service worker console.

### Proxy restarted

The extension should detect `/health.persona = unset` and re-POST active persona. If re-sync fails, it rolls back active page JS state. Check token mismatch first.

### Store package validation

1. Run `scripts/package-store.sh`.
2. Load `packaging/store/chromium` unpacked in Chrome.
3. Apply persona with proxy running.
4. Run E2E.
5. Upload ZIP only after all checks pass.
