import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);

function readJson(path: string) {
  return JSON.parse(readFileSync(new URL(path, root), 'utf8'));
}

function pngDimensions(path: string) {
  const image = readFileSync(new URL(path, root));
  assert.equal(image.toString('ascii', 1, 4), 'PNG');
  return {
    width: image.readUInt32BE(16),
    height: image.readUInt32BE(20),
  };
}

test('PWA manifest is installable and all declared icons are genuinely square', () => {
  const manifest = readJson('public/manifest.json');

  assert.equal(manifest.name, 'NAL General Merchant');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable'));

  for (const icon of manifest.icons as Array<{ src: string; sizes: string }>) {
    const iconPath = `public${icon.src.split('?')[0]}`;
    const [declaredWidth, declaredHeight] = icon.sizes.split('x').map(Number);
    const dimensions = pngDimensions(iconPath);

    assert.deepEqual(dimensions, {
      width: declaredWidth,
      height: declaredHeight,
    });
  }
});

test('the shared service worker provides an offline fallback without caching APIs', () => {
  const serviceWorker = readFileSync(new URL('public/sw.js', root), 'utf8');
  const messagingServiceWorker = readFileSync(
    new URL('public/firebase-messaging-sw.js', root),
    'utf8'
  );

  assert.match(serviceWorker, /addEventListener\("install"/);
  assert.match(serviceWorker, /addEventListener\("fetch"/);
  assert.match(serviceWorker, /request\.mode === "navigate"/);
  assert.match(serviceWorker, /pathname\.startsWith\("\/api\/"\)/);
  assert.doesNotMatch(serviceWorker, /importScripts/);
  assert.match(messagingServiceWorker, /firebase\.messaging\(\)/);
});
