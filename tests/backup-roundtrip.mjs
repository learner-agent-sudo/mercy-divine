// 備份還原：匯出後清空手機資料，再匯入，紀錄與聖像都應完整回來。
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { CHROME, BASE, fixture, launch, openSlotGroup } from './helpers.mjs';

const { browser, page, errors } = await launch({ acceptDownloads: true });
let failures = 0;
const ok = (label, pass) => { console.log(`${pass ? 'PASS' : 'FAIL ***'}  ${label}`); if (!pass) failures++; };

await page.goto(BASE, { waitUntil: 'networkidle' });

// 三次祈禱，各留意向
for (const note of ['為家人', '為亡者', '為病人']) {
  await page.click('#start-btn');
  await page.evaluate(() => { const b = document.querySelector('#step-next');
    for (let i = 0; i < 200 && !document.querySelector('#view-done.active'); i++) b.click(); });
  await page.fill('#done-note', note);
  await page.click('#done-home');
}

// 兩個位置指定自訂聖像；封面放兩張（輪播），兩張圖都只存一份
await page.click('[data-go="settings"]');
for (const [slot, files] of [['chaplet:home', ['pic-mercy.png', 'pic-hail.png']], ['chaplet:hail-mary', ['pic-hail.png']]]) {
  await openSlotGroup(page, slot);
  await page.locator(`.slot[data-slot="${slot}"] button`, { hasText: '加圖' }).click();
  await page.setInputFiles('#pic-file', files.map(fixture));
  await page.waitForTimeout(700);
}

const before = await page.evaluate(() => ({
  records: JSON.parse(localStorage.getItem('mercy.records.v1')),
  pictures: JSON.parse(localStorage.getItem('mercy.settings.v1')).pictures,
}));
console.log(`before: ${before.records.length} records, ${Object.keys(before.pictures).length} picture slots`);

const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-btn')]);
const path = await download.path();
const backup = JSON.parse(readFileSync(path, 'utf8'));
ok('backup names the app and a version', backup.app === 'mercy-divine' && backup.version >= 1);
ok('backup carries every record', backup.records.length === before.records.length);
ok('backup carries the notes', backup.records.filter(r => r.note).length === 3);
ok('backup embeds the pictures', Object.keys(backup.pictures || {}).length === 2);
ok('backup maps pictures to slots', JSON.stringify(backup.pictureRoles) === JSON.stringify(before.pictures));
console.log(`        file is ${(readFileSync(path).length / 1024).toFixed(0)} KB`);

// 模擬清除瀏覽器資料
await page.evaluate(async () => {
  localStorage.clear();
  for (const db of await indexedDB.databases()) indexedDB.deleteDatabase(db.name);
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#view-home.active');
const wiped = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.records.v1') || '[]').length);
ok('wipe really emptied it', wiped === 0);

await page.click('[data-go="settings"]');
await page.setInputFiles('#import-file', path);
await page.waitForTimeout(1200);

const after = await page.evaluate(() => ({
  records: JSON.parse(localStorage.getItem('mercy.records.v1')),
  pictures: JSON.parse(localStorage.getItem('mercy.settings.v1')).pictures,
}));
ok('records restored', after.records.length === before.records.length);
ok('notes restored', JSON.stringify(after.records.map(r => r.note).sort()) ===
                     JSON.stringify(before.records.map(r => r.note).sort()));
ok('picture slots restored', JSON.stringify(after.pictures) === JSON.stringify(before.pictures));
ok('a slot with several pictures keeps all of them, in order',
   Array.isArray(after.pictures['chaplet:home']) && after.pictures['chaplet:home'].length === 3
   && after.pictures['chaplet:home'][0] === 'builtin:images/home.jpg');

await page.click('#view-settings [data-go="home"]');
const home = await page.evaluate(async () => {
  const imgs = () => [...document.querySelectorAll('#view-home .car img')].filter(i => i.src.startsWith('blob:'));
  for (let n = 0; n < 80 && !(imgs().length && imgs().every(i => i.naturalWidth)); n++) await new Promise(r => setTimeout(r, 25));
  return { blob: imgs().length === 2, w: Math.min(...imgs().map(i => i.naturalWidth)) };
});
ok('restored picture actually renders', home.blob && home.w > 0);

// 重複匯入不應產生重複紀錄
await page.click('[data-go="settings"]');
await page.setInputFiles('#import-file', path);
await page.waitForTimeout(900);
const twice = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.records.v1')).length);
ok('importing twice does not duplicate', twice === before.records.length);

console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'no console errors');
await browser.close();
process.exit(failures || errors.length ? 1 : 0);
