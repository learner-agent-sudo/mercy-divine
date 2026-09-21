// 補記：用念珠或經本唸的祈禱，也要能記進同一份紀錄。
import { BASE, launch } from './helpers.mjs';
const ok = (l, p) => { console.log(`${p ? 'PASS' : 'FAIL ***'}  ${l}`); if (!p) failures++; };
let failures = 0;

const { browser, page, errors } = await launch();
await page.goto(BASE, { waitUntil: 'networkidle' });

const recs = () => page.evaluate(() => JSON.parse(localStorage.getItem('mercy.records.v1') || '[]'));
const stats = async () => (await page.textContent('#home-stats')).replace(/\s+/g, ' ').trim();

await page.click('#manual-btn');
await page.waitForSelector('#view-manual.active');
ok('date defaults to today', await page.inputValue('#manual-date') ===
   new Date().toISOString().slice(0, 10).replace(/-/g, '-'));
ok('a future date cannot be picked', await page.getAttribute('#manual-date', 'max') !== null);

// 補記昨天的一次
const yest = new Date(Date.now() - 86400000);
const ymd = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, '0')}-${String(yest.getDate()).padStart(2, '0')}`;
await page.fill('#manual-date', ymd);
await page.fill('#manual-time', '07:30');
await page.fill('#manual-note', '在聖堂用念珠');
await page.click('#manual-save');
await page.waitForTimeout(400);

const after = await recs();
ok('the prayer is recorded', after.length === 1);
ok('it is marked as logged rather than prayed in-app', after[0].mode === 'offline');
ok('it keeps the intention', after[0].note === '在聖堂用念珠');
ok('it is dated when it actually happened', new Date(after[0].ts).getDate() === yest.getDate());
ok('it carries no fabricated duration', after[0].secs === 0);
ok('it appears in the recent list', await page.locator('#manual-log li').count() === 1);
ok('and is labelled 補記', (await page.textContent('#manual-log li')).includes('補記'));

// 未來的時間應被擋下
await page.fill('#manual-date', new Date().toISOString().slice(0, 10));
await page.fill('#manual-time', '23:59');
const futureBlocked = new Date().getHours() < 23;
if (futureBlocked) {
  await page.click('#manual-save');
  await page.waitForTimeout(300);
  ok('a time that has not happened yet is refused', await page.isVisible('#manual-error') && (await recs()).length === 1);
} else {
  ok('a time that has not happened yet is refused (skipped near midnight)', true);
}

// 與程式內誦唸的合併計算
await page.click('#view-manual [data-go="home"]');
ok('the logged prayer counts towards the totals', (await stats()).includes('1累計次數'));

await page.click('#start-btn');
await page.evaluate(() => { const b = document.querySelector('#step-next');
  for (let i = 0; i < 200 && !document.querySelector('#view-done.active'); i++) b.click(); });
await page.click('#done-home');
ok('both kinds add up', (await stats()).includes('2累計次數'));

await page.click('[data-go="history"]');
ok('history lists both', await page.locator('#log li').count() === 2);
ok('and distinguishes them', (await page.textContent('#log')).includes('補記'));
ok('the flower lights a petal for each', await page.locator('.petal.chaplet.lit1').count() === 2);

// 備份要保住 offline 這個來源
await page.click('#view-history [data-go="home"]');
await page.click('[data-go="settings"]');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export-btn')]);
const path = await dl.path();
await page.evaluate(async () => {
  localStorage.clear();
  for (const db of await indexedDB.databases()) indexedDB.deleteDatabase(db.name);
});
await page.reload({ waitUntil: 'networkidle' });
await page.click('[data-go="settings"]');
await page.setInputFiles('#import-file', path);
await page.waitForTimeout(900);
const restored = await recs();
ok('a restored backup keeps the logged prayer marked as 補記',
   restored.length === 2 && restored.filter((r) => r.mode === 'offline').length === 1);

console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'no console errors');
await browser.close();
process.exit(failures || errors.length ? 1 : 0);
