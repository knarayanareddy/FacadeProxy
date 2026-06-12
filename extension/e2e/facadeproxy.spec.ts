import { chromium, expect, test } from '@playwright/test';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const extensionPath = resolve(here, '../dist');
const proxyBin = process.env.FACADEPROXY_PROXY_BIN ?? resolve(here, '../../dist/proxy/facadeproxy');

test('applies coherent persona before early page fingerprint script and mutates headers', async () => {
  const server = await startHeaderCaptureServer();
  const proxy = startProxy();
  try {
    await waitForProxyHealth();
    const userDataDir = await mkdtemp(join(tmpdir(), 'facadeproxy-chrome-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
    });
    try {
      const worker = await waitForServiceWorker(context);
      const activation = await worker.evaluate(async () => {
        return chrome.runtime.sendMessage({ type: 'FACADEPROXY_SET_PERSONA', personaId: 'nl_chrome_linux' });
      });
      expect(activation.ok, JSON.stringify(activation)).toBe(true);

      const page = await context.newPage();
      await page.goto(server.url, { waitUntil: 'domcontentloaded' });
      const fp = await page.evaluate(() => (window as unknown as { __earlyFingerprint: Record<string, unknown> }).__earlyFingerprint);
      expect(fp.language).toBe('nl-NL');
      expect(fp.platform).toBe('Linux x86_64');
      expect(fp.webdriver).toBe(false);
      expect(fp.screen).toEqual([1920, 1080]);
      expect(fp.timeZone).toBe('Europe/Amsterdam');

      expect(server.lastHeaders['user-agent']).toContain('X11; Linux x86_64');
      expect(server.lastHeaders['accept-language']).toContain('nl-NL');
    } finally {
      await context.close();
    }
  } finally {
    proxy.kill();
    await server.close();
  }
});

function startProxy(): ChildProcessWithoutNullStreams {
  const child = spawn(proxyBin, ['--personas', resolve(here, '../../personas/defaults/personas.toml'), '--port', '7878'], {
    stdio: 'pipe'
  });
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  return child;
}

async function waitForProxyHealth(): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch('http://127.0.0.1:7878/health');
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('proxy health did not become ready');
}

async function waitForServiceWorker(context: Awaited<ReturnType<typeof chromium.launchPersistentContext>>) {
  const existing = context.serviceWorkers()[0];
  if (existing) return existing;
  return context.waitForEvent('serviceworker');
}

async function startHeaderCaptureServer(): Promise<{
  url: string;
  lastHeaders: Record<string, string | undefined>;
  close: () => Promise<void>;
}> {
  const lastHeaders: Record<string, string | undefined> = {};
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    Object.assign(lastHeaders, req.headers);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html>
<html><head>
<script>
window.__earlyFingerprint = {
  ua: navigator.userAgent,
  language: navigator.language,
  languages: navigator.languages,
  platform: navigator.platform,
  webdriver: navigator.webdriver,
  screen: [screen.width, screen.height],
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  offset: new Date().getTimezoneOffset()
};
</script>
</head><body>ok</body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('unexpected server address');
  return {
    url: `http://127.0.0.1:${address.port}/`,
    lastHeaders,
    close: () => new Promise((resolve) => server.close(() => resolve()))
  };
}
