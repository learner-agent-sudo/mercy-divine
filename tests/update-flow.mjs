// 更新流程：改版後已安裝的手機應出現「已有新版本」，重新載入後拿到新內容，舊快取清掉。
import { cpSync, readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch } from './helpers.mjs';

const ok = (label, pass) => { console.log(`${pass ? 'PASS' : 'FAIL ***'}  ${label}`); if (!pass) failures++; };
let failures = 0;

const site = mkdtempSync(join(tmpdir(), 'mercy-site-'));
const root = new URL('..', import.meta.url).pathname;
for (const f of ['index.html', 'app.js', 'styles.css', 'sw.js', 'manifest.webmanifest', 'data', 'images', 'icons']) {
  cpSync(join(root, f), join(site, f), { recursive: true });
}
const PORT = 8791;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: site, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));

const { browser, page, errors } = await launch();
try {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
  ok('first visit installs the worker', true);

  const firstCache = await page.evaluate(() => caches.keys().then((k) => k[0]));
  console.log('        cache:', firstCache);
  ok('no update banner on a fresh install', await page.getAttribute('#update-bar', 'hidden') !== null);

  // 發布新版本：改經文標題並提高 sw.js 版本號
  const prayers = JSON.parse(readFileSync(join(site, 'data/prayers.json'), 'utf8'));
  prayers.title = '救主慈悲串經（新版）';
  writeFileSync(join(site, 'data/prayers.json'), JSON.stringify(prayers, null, 2));
  const sw = readFileSync(join(site, 'sw.js'), 'utf8');
  writeFileSync(join(site, 'sw.js'), sw.replace(/const VERSION = '(v\d+)'/, "const VERSION = 'v99'"));

  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  await page.waitForSelector('#update-bar:not([hidden])', { timeout: 15000 });
  ok('banner appears once a new version is waiting', true);

  ok('old content still served until accepted', await page.textContent('.home-title') === '救主慈悲串經');

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}),
    page.click('#update-apply'),
  ]);
  await page.waitForSelector('#view-home.active', { timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('.home-title').textContent.includes('新版'), null, { timeout: 15000 });
  ok('new content served after reloading', (await page.textContent('.home-title')).includes('新版'));

  const caches2 = await page.evaluate(() => caches.keys());
  ok('old cache cleaned up', caches2.length === 1 && caches2[0] !== firstCache);
  console.log('        cache:', caches2[0]);

  ok('banner cleared after update', await page.getAttribute('#update-bar', 'hidden') !== null);
} finally {
  console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'no console errors');
  await browser.close();
  server.kill();
  rmSync(site, { recursive: true, force: true });
}
process.exit(failures || errors.length ? 1 : 0);
