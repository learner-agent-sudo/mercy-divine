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
ok('the five books and the Bible code cached', ['matthew', 'mark', 'luke', 'john', 'acts'].every((b) => cached.some((p) => p.endsWith(`/bible/${b}.md`)))
   && cached.some((p) => p.endsWith('/bible.js')) && cached.some((p) => p.endsWith('/bible-parse.js')));
ok('the event table and the source notice cached', cached.some((p) => p.endsWith('/data/gospel-events.json')) && cached.some((p) => p.endsWith('/bible/README.md')));
ok('the people table cached', cached.some((p) => p.endsWith('/data/people.json')));
ok('the confession code and text cached', cached.some((p) => p.endsWith('/confession.js')) && cached.some((p) => p.endsWith('/data/confession.json')));
ok('the novena code and text cached', cached.some((p) => p.endsWith('/novena.js')) && cached.some((p) => p.endsWith('/data/novenas.json')));
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

// 讀經也要能離線：打開大廳、讀一章、看事件對照、標記已讀
await page.click('#bible-open');
await page.waitForSelector('.bible-book', { timeout: 10000 });
ok('the Bible hub opens offline', (await page.locator('.bible-book').count()) === 5);
await page.click('.bible-book[data-book="luk"]');
await page.click('.ch-btn[data-c="1"]');
await page.waitForSelector('.bible-sec');
ok('a chapter reads offline', (await page.locator('.bible-text .v').count()) > 50);
await page.locator('.bible-done').first().click();
ok('and reading is recorded offline', await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.bible.v1')).read.luk.length > 0));
await page.goBack(); await page.goBack();
await page.click('.bible-tab[data-tab="events"]');
await page.waitForSelector('.tl-item', { state: 'attached', timeout: 10000 });
ok('the event timeline works offline', (await page.locator('.tl-item').count()) > 100);
await page.click('.bible-tab[data-tab="people"]');
await page.waitForSelector('.pp-item', { timeout: 10000 });
await page.click('.pp-item[data-person="peter"]');
await page.waitForSelector('.say .v', { state: 'attached', timeout: 10000 });
ok('the 人物 screen works offline too', (await page.locator('.say').count()) > 0 && (await page.locator('.say .v').count()) > 0);
await page.goBack();
await page.waitForSelector('.bible-tab');
await page.click('.bible-foot a');
await page.waitForFunction(() => /思高/.test(document.querySelector('.bible-foot .bible-notice').textContent), null, { timeout: 5000 });
ok('so does the source notice', true);
await page.goBack();
await page.waitForSelector('#view-home.active');

// 修和聖事也要能離線：看步驟、看告明時（含痛悔經），記下今天
await page.click('#confession-steps');
await page.waitForSelector('details.conf-step');
ok('the confession steps open offline', (await page.locator('details.conf-step').count()) === 6);
await page.click('.conf-tab[data-tab="rite"]');
await page.waitForSelector('li.conf-line');
ok('the rite works offline, with the 痛悔經', (await page.locator('li.conf-line').count()) === 10
   && (await page.textContent('li.conf-line:nth-child(5) .conf-quote')).includes('全心痛悔'));
await page.click('#conf-today');
await page.waitForFunction(() => JSON.parse(localStorage.getItem('mercy.confession.v1')).dates.length === 1);
const confOffline = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.confession.v1')).dates);
ok('a confession day is recorded offline', confOffline.length === 1);
await page.click('#confession-back');
await page.waitForSelector('#view-home.active');

// 九日敬禮也要能離線：打開目錄、看一天的經文、念完第一天
await page.click('#novena-open');
await page.waitForSelector('.nov-card');
ok('the novena list opens offline', (await page.locator('.nov-card').count()) === 1);
await page.click('.nov-card');
await page.click('#nov-go');
await page.waitForSelector('.nov-answer p');
ok('a day opens offline, with both prayers', (await page.locator('.nov-answer p').count()) > 0 && (await page.locator('details.nov-pr').count()) === 2);
await page.click('#nov-mark');
await page.waitForSelector('#nov-undo');
const novOffline = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.novena.v1')).runs.souls.days);
ok('a novena day is recorded offline', novOffline['1'] !== undefined);
for (let i = 0; i < 3; i++) await page.click('#novena-back');
await page.waitForSelector('#view-home.active');

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
const confBack = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.confession.v1')).dates);
ok('the confession day survives reconnecting too', JSON.stringify(confBack) === JSON.stringify(confOffline));
const novBack = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.novena.v1')).runs.souls.days);
ok('the novena day survives reconnecting too', JSON.stringify(novBack) === JSON.stringify(novOffline));

await pray();
ok('praying online still records', await count() === online + 4);
ok('records never leave the device', outbound.length === 0);

console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'no console errors');
await browser.close();
process.exit(failures || errors.length ? 1 : 0);
