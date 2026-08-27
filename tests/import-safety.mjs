// 匯入的備份檔可能來自他處，不應因此對外連線或寫入異常資料。
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASE, launch } from './helpers.mjs';
const ok = (l, p) => { console.log(`${p ? 'PASS' : 'FAIL ***'}  ${l}`); if (!p) failures++; };
let failures = 0;

const dir = mkdtempSync(join(tmpdir(), 'mercy-import-'));
const write = (name, obj) => { const p = join(dir, name); writeFileSync(p, JSON.stringify(obj)); return p; };

const { browser, page, errors } = await launch();
const outbound = [];
page.on('request', (r) => { if (new URL(r.url()).hostname !== 'localhost') outbound.push(r.url()); });

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.click('[data-go="settings"]');

// 圖片欄位放的是遠端網址，不是內嵌圖片
const hostile = write('hostile.json', {
  app: 'mercy-divine', version: 2,
  records: [{ id: 'a', ts: new Date().toISOString(), mode: 'guided', secs: 60, note: 'ok' }],
  pictures: { evil: 'http://198.51.100.7/pixel.png' },
  pictureRoles: { home: 'evil' },
});
await page.setInputFiles('#import-file', hostile);
await page.waitForTimeout(1000);
ok('no request made to the remote host', outbound.length === 0);
ok('the bogus picture is not adopted', await page.evaluate(
  () => !JSON.parse(localStorage.getItem('mercy.settings.v1')).pictures.home));
ok('the valid record still imports', await page.evaluate(
  () => JSON.parse(localStorage.getItem('mercy.records.v1')).length === 1));

// 型別與長度異常
const messy = write('messy.json', {
  app: 'mercy-divine', version: 2,
  records: [
    { id: 'b', ts: 'not-a-date', mode: 'guided', secs: 1, note: 'bad date' },
    { id: 'c', ts: new Date().toISOString(), mode: '<script>', secs: -99999, note: 'x'.repeat(5000) },
  ],
  pictures: {}, pictureRoles: { 'made-up-slot': 'zzz' },
});
await page.setInputFiles('#import-file', messy);
await page.waitForTimeout(900);
const state = await page.evaluate(() => ({
  records: JSON.parse(localStorage.getItem('mercy.records.v1')),
  pictures: JSON.parse(localStorage.getItem('mercy.settings.v1')).pictures,
}));
ok('a record with an unparseable date is skipped', !state.records.some((r) => r.id === 'b'));
const c = state.records.find((r) => r.id === 'c');
ok('an unknown mode falls back to guided', c && c.mode === 'guided');
ok('a negative duration is clamped', c && c.secs >= 0);
ok('an overlong note is truncated', c && c.note.length === 80);
ok('an unknown picture slot is dropped', !('made-up-slot' in state.pictures));

// 完全不是備份檔
await page.setInputFiles('#import-file', write('junk.json', { hello: 'world' }));
await page.waitForTimeout(700);
ok('a file that is not a backup is refused', await page.evaluate(
  () => JSON.parse(localStorage.getItem('mercy.records.v1')).length === 2));

// 行事曆與紀錄仍可正常繪製
await page.click('#view-settings [data-go="home"]');
await page.click('[data-go="history"]');
ok('history still renders', await page.locator('#log li').count() >= 1);
ok('no Invalid Date leaks into the log', !(await page.textContent('#log')).includes('NaN'));

console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'no console errors');
await browser.close();
process.exit(failures || errors.length ? 1 : 0);
