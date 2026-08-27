// 離線：安裝後完全斷網仍可誦念與記錄；恢復連線不影響任何紀錄。
import { BASE, launch } from './helpers.mjs';
const ok = (l, p) => { console.log(`${p ? 'PASS' : 'FAIL ***'}  ${l}`); if (!p) failures++; };
let failures = 0;

const { browser, context, page, errors } = await launch();
const outbound = [];
page.on('request', (r) => { if (new URL(r.url()).hostname !== 'localhost') outbound.push(r.url()); });

const pray = async () => {
  await page.click('#start-btn');
  await page.evaluate(() => { const b = document.querySelector('#step-next');
    for (let i = 0; i < 200 && !document.querySelector('#view-done.active'); i++) b.click(); });
  await page.waitForSelector('#view-done.active');
  await page.click('#done-home');
};
const count = () => page.evaluate(() => (JSON.parse(localStorage.getItem('mercy.records.v1')) || []).length);

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
ok('service worker takes control', true);

const cached = await page.evaluate(async () => {
  const c = await caches.open((await caches.keys())[0]);
  return (await c.keys()).map((r) => new URL(r.url).pathname);
});
ok('app shell cached', cached.some((p) => p.endsWith('/index.html')) && cached.some((p) => p.endsWith('/app.js')));
ok('prayer text cached', cached.some((p) => p.endsWith('/data/prayers.json')));
ok('images cached', cached.some((p) => p.includes('/images/')));
console.log(`        ${cached.length} files cached`);

await pray();
const online = await count();

await context.setOffline(true);
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#view-home.active', { timeout: 10000 });
ok('cold reload works with no network', await page.textContent('.home-title') === '救主慈悲串經');
ok('image still loads from cache', await page.evaluate(async () => {
  const i = document.querySelector('#home-image');
  for (let n = 0; n < 60 && !i.naturalWidth; n++) await new Promise((r) => setTimeout(r, 25));
  return i.naturalWidth > 0;
}));

await pray(); await pray(); await pray();
ok('prayers recorded while offline', await count() === online + 3);
const offlineStamps = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.records.v1')).map((r) => r.ts));

// 全新分頁、仍然無網路
const fresh = await context.newPage();
await fresh.goto(BASE, { waitUntil: 'load' });
await fresh.waitForSelector('#view-home.active', { timeout: 10000 });
ok('a brand-new tab cold-starts offline', await fresh.textContent('.home-title') === '救主慈悲串經');
await fresh.close();

await context.setOffline(false);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#view-home.active');
const back = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.records.v1')).map((r) => r.ts));
ok('every offline record survives reconnecting', offlineStamps.every((t) => back.includes(t)));
ok('nothing lost or duplicated', back.length === offlineStamps.length);

await pray();
ok('praying online still records', await count() === online + 4);
ok('records never leave the device', outbound.length === 0);

console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'no console errors');
await browser.close();
process.exit(failures || errors.length ? 1 : 0);
