// 備份還原：匯出後清空手機資料，再匯入，紀錄與聖像都應完整回來。
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHROME, BASE, fixture, launch, openSlotGroup, setFiles } from './helpers.mjs';

const { browser, page, errors } = await launch({ acceptDownloads: true });
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
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
  await setFiles(page, '#pic-file', files.map(fixture));
}

// 讀一段經：真福八端（瑪 5:1-12）標成已讀，備份也要帶著它
await page.click('#view-settings [data-go="home"]');
await page.click('#bible-open');
await page.click('.bible-book[data-book="mat"]');
await page.click('.ch-btn[data-c="5"]');
await page.locator('.bible-sec:has(.bible-sec-title:has-text("真福八端")) .bible-done').click();
await page.goBack(); await page.goBack(); await page.goBack();
await page.waitForSelector('#view-home.active');

// 修和聖事：記下今天辦了告解（對話框預設按確定）
const TODAY = (() => { const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; })();
await page.click('#confession-rite');
await page.click('#conf-today');
await page.click('#confession-back');
await page.waitForSelector('#view-home.active');
await page.click('[data-go="settings"]');

// 九日敬禮：一次念完的紀錄、進行中的第一天、為誰祈禱
const NOVENA = {
  runs: { souls: { start: TODAY, days: { 1: TODAY } } },
  done: [{ id: 'souls', start: daysAgo(10), end: daysAgo(2), for: '為亡者' }],
  intent: { souls: '亡父 若瑟' },
};
await page.evaluate((v) => localStorage.setItem('mercy.novena.v1', JSON.stringify(v)), NOVENA);

const before = await page.evaluate(() => ({
  records: JSON.parse(localStorage.getItem('mercy.records.v1')),
  pictures: JSON.parse(localStorage.getItem('mercy.settings.v1')).pictures,
  bible: JSON.parse(localStorage.getItem('mercy.bible.v1')),
  confession: JSON.parse(localStorage.getItem('mercy.confession.v1')),
  novena: JSON.parse(localStorage.getItem('mercy.novena.v1')),
}));
ok('the confession day is in storage before the backup', JSON.stringify(before.confession.dates) === JSON.stringify([TODAY]));
ok('the reading is in storage before the backup', before.bible.read.mat.length === 12 && before.bible.log.length === 1);
console.log(`before: ${before.records.length} records, ${Object.keys(before.pictures).length} picture slots`);

const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-btn')]);
const path = await download.path();
const backup = JSON.parse(readFileSync(path, 'utf8'));
ok('backup names the app and a version', backup.app === 'mercy-divine' && backup.version === 7);
ok('backup carries the confession dates', JSON.stringify(backup.confession) === JSON.stringify({ dates: [TODAY] }));
ok('backup carries the 九日敬禮 progress, finished runs and intention', JSON.stringify(backup.novena) === JSON.stringify(NOVENA));
ok('backup carries the Bible reading', backup.bible && backup.bible.read.mat.length === 12
   && backup.bible.log.length === 1 && backup.bible.log[0].title === '真福八端' && backup.bible.last.c === 5);
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
await setFiles(page, '#import-file', path);

const after = await page.evaluate(() => ({
  records: JSON.parse(localStorage.getItem('mercy.records.v1')),
  pictures: JSON.parse(localStorage.getItem('mercy.settings.v1')).pictures,
  bible: JSON.parse(localStorage.getItem('mercy.bible.v1')),
  confession: JSON.parse(localStorage.getItem('mercy.confession.v1')),
  novena: JSON.parse(localStorage.getItem('mercy.novena.v1')),
}));
ok('the Bible reading is restored: verses, log and place', JSON.stringify(after.bible) === JSON.stringify(before.bible));
ok('the confession dates are restored', JSON.stringify(after.confession) === JSON.stringify(before.confession));
ok('the 九日敬禮 progress is restored', JSON.stringify(after.novena) === JSON.stringify(before.novena));
ok('records restored', after.records.length === before.records.length);
ok('notes restored', JSON.stringify(after.records.map(r => r.note).sort()) ===
                     JSON.stringify(before.records.map(r => r.note).sort()));
ok('picture slots restored', JSON.stringify(after.pictures) === JSON.stringify(before.pictures));
ok('a slot with several pictures keeps all of them, in order',
   Array.isArray(after.pictures['chaplet:home']) && after.pictures['chaplet:home'].length === 3
   && after.pictures['chaplet:home'][0] === 'builtin:images/home.jpg');

await page.click('#view-settings [data-go="home"]');
ok('and the home card shows it at once', /已讀 12／4,780/.test(await page.textContent('#bible-home-line')));
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
const bibleTwice = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.bible.v1')));
ok('nor does it duplicate the Bible reading', JSON.stringify(bibleTwice) === JSON.stringify(before.bible));
const confTwice = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.confession.v1')));
ok('nor does it duplicate a confession day', JSON.stringify(confTwice) === JSON.stringify(before.confession));
const novTwice = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.novena.v1')));
ok('nor does it duplicate a finished novena', JSON.stringify(novTwice) === JSON.stringify(before.novena));

// 讀經進度合併：已經有別的進度時取聯集，不覆蓋
await page.evaluate(() => {
  const b = JSON.parse(localStorage.getItem('mercy.bible.v1'));
  b.read.mat = ['1:1', '1:2'];
  b.read.jhn = ['3:16'];
  b.log = [{ at: '2020-01-01T00:00:00.000Z', book: 'jhn', from: '3:16', to: '3:16', title: '另一部手機讀的' }];
  localStorage.setItem('mercy.bible.v1', JSON.stringify(b));
  localStorage.setItem('mercy.confession.v1', JSON.stringify({ dates: ['2020-01-01'] }));
  localStorage.setItem('mercy.novena.v1', JSON.stringify({ runs: {}, done: [{ id: 'souls', start: '2020-01-01', end: '2020-01-09', for: '另一部手機' }], intent: { souls: '本機的意向' } }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.click('[data-go="settings"]');
await page.setInputFiles('#import-file', path);
await page.waitForTimeout(900);
const merged = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.bible.v1')));
ok('importing merges Bible verses with what is already there',
   merged.read.mat.length === 14 && merged.read.mat.includes('1:1') && merged.read.mat.includes('5:12') && merged.read.jhn.join() === '3:16');
ok('and the logs, oldest first', merged.log.length === 2 && merged.log[0].title === '另一部手機讀的' && merged.log[1].title === '真福八端');
ok('while keeping the place already set', merged.last.c === 5);
const confMerged = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.confession.v1')));
ok('confession days merge too, oldest first', JSON.stringify(confMerged.dates) === JSON.stringify(['2020-01-01', TODAY]));
const novMerged = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.novena.v1')));
ok('novena: finished entries merge, the run comes across, the local intention is kept', JSON.stringify(novMerged) === JSON.stringify({
  runs: NOVENA.runs,
  done: [{ id: 'souls', start: '2020-01-01', end: '2020-01-09', for: '另一部手機' }, NOVENA.done[0]],
  intent: { souls: '本機的意向' },
}));

// 告解日期：不是日期、不存在的日子、未來的日子、重複的，都不收；只收真的新日子
const badDir = mkdtempSync(join(tmpdir(), 'mercy-conf-'));
const badPath = join(badDir, 'bad-dates.json');
writeFileSync(badPath, JSON.stringify({ app: 'mercy-divine', version: 6, records: [], confession: {
  dates: ['2026-02-30', '2999-01-01', '10/01/2026', '2026-1-5', 'yesterday', 7, null, '2020-05-17', '2020-05-17'] } }));
await page.setInputFiles('#import-file', badPath);
await page.waitForTimeout(900);
const badMerged = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.confession.v1')));
ok('bad and future dates are rejected, a new real one is added once',
   JSON.stringify(badMerged.dates) === JSON.stringify(['2020-01-01', '2020-05-17', TODAY]));
ok('and the toast counts only what was added', (await page.textContent('#toast')) === '已匯入 告解 1 筆');

// 只有讀經、沒有祈禱紀錄時也要能匯出
await page.evaluate(async () => {
  localStorage.removeItem('mercy.records.v1');
  localStorage.removeItem('mercy.settings.v1');
  localStorage.removeItem('mercy.confession.v1');
  localStorage.removeItem('mercy.novena.v1');
  for (const db of await indexedDB.databases()) indexedDB.deleteDatabase(db.name);
});
await page.reload({ waitUntil: 'networkidle' });
await page.click('[data-go="settings"]');
const [onlyBible] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.click('#export-btn')]);
ok('with only Bible reading to show, export still works', !!onlyBible);
if (onlyBible) {
  const file = JSON.parse(readFileSync(await onlyBible.path(), 'utf8'));
  ok('and the file carries just that', file.records.length === 0 && file.bible.read.mat.length === 14);
}
await page.evaluate(() => localStorage.removeItem('mercy.bible.v1'));
await page.reload({ waitUntil: 'networkidle' });
await page.click('[data-go="settings"]');
await page.click('#export-btn');
ok('with nothing at all, it says so', (await page.textContent('#toast')) === '尚無紀錄可匯出');

// 九日敬禮的壞條目：未來的日子、壞掉的代號、第 10 天、起訖倒過來、意向不是文字，都不收
await page.evaluate(() => localStorage.removeItem('mercy.novena.v1'));
const novBadDir = mkdtempSync(join(tmpdir(), 'mercy-nov-'));
const novBadPath = join(novBadDir, 'bad-novena.json');
writeFileSync(novBadPath, JSON.stringify({ app: 'mercy-divine', version: 7, records: [], novena: {
  done: [
    { id: 'souls', start: '2999-01-01', end: '2999-01-02', for: '' },
    { id: 'bad id!', start: daysAgo(5), end: daysAgo(4), for: '' },
    { id: 'souls', start: daysAgo(3), end: daysAgo(4), for: '倒過來' },
    { id: 'souls', start: daysAgo(6), end: daysAgo(5), for: 'ok' },
  ],
  runs: { souls: { start: TODAY, days: { 10: TODAY } }, '../evil': { start: TODAY, days: { 1: TODAY } } },
  intent: { souls: 42 },
} }));
await page.setInputFiles('#import-file', novBadPath);
await page.waitForSelector('#toast:has-text("九日敬禮")');
const novBad = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.novena.v1')));
ok('bad novena entries are rejected; only the valid finished entry comes in',
   JSON.stringify(novBad) === JSON.stringify({ runs: {}, done: [{ id: 'souls', start: daysAgo(6), end: daysAgo(5), for: 'ok' }], intent: {} }));
ok('and the toast counts only what was added', (await page.textContent('#toast')) === '已匯入 九日敬禮 1 筆');

console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'no console errors');
await browser.close();
process.exit(failures || errors.length ? 1 : 0);
