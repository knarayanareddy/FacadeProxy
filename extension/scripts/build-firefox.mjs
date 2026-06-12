import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const manifestPath = resolve('dist/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

// Firefox MV3 support for declarative MAIN-world content scripts lags Chromium.
// Use only the isolated content script and rely on its script-tag fallback to
// inject assets/injected.js into the page's MAIN world.
manifest.browser_specific_settings = {
  gecko: {
    id: 'facadeproxy@example.invalid',
    strict_min_version: '120.0'
  }
};
manifest.content_scripts = [
  {
    matches: ['<all_urls>'],
    js: ['assets/content.js'],
    run_at: 'document_start',
    all_frames: true
  }
];

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log('Wrote Firefox-compatible MV3 manifest to dist/manifest.json');
