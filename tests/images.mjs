// 聖像：依經文切換、缺檔遞補、從相簿選圖、去重、縮圖、還原。
import { BASE, fixture, launch } from './helpers.mjs';
const ok = (l, p) => { console.log(`${p ? 'PASS' : 'FAIL ***'}  ${l}`); if (!p) failures++; };
let failures = 0;

const { browser, page, errors } = await launch();
// 清單中可能列出尚未上傳的檔案，這些請求應該每個檔案只發生一次
let missed = [];
page.on('load', () => { missed = []; });   // 每次載入頁面重新計算
page.on('response', (r) => { if (r.status() === 404) missed.push(new URL(r.url()).pathname); });
await page.goto(BASE, { waitUntil: 'networkidle' });

const src = async (sel) => page.evaluate(async (s) => {
  const i = document.querySelector(s);
  for (let n = 0; n < 60 && !i.naturalWidth; n++) await new Promise((r) => setTimeout(r, 25));
  return { name: i.src.split('/').pop(), blob: i.src.startsWith('blob:'), w: i.naturalWidth, h: i.naturalHeight };
}, sel);

// 每段經文各自的聖像
await page.click('#start-btn');
const byPrayer = {};
for (let i = 0; i < 64; i++) {
  const key = `${await page.textContent('#prayer-stage')}|${await page.textContent('#step-name')}`;
  if (!byPrayer[key]) byPrayer[key] = (await src('#guided-image')).name;
  if (i < 63) await page.click('#step-next');
}
ok('天主經 and 聖母經 use different images', byPrayer['開始|天主經'] !== byPrayer['開始|聖母經']);
ok('小珠 differs from 大珠', byPrayer['第一端|小珠'] !== byPrayer['第一端|大珠']);
ok('every prayer has an image', Object.values(byPrayer).every(Boolean));

// 圖片完整顯示，不裁切
const shape = await src('#guided-image');
ok('image is not cropped', Math.abs(shape.w / shape.h - shape.w / shape.h) < 0.01 && shape.w > 0);

await page.click('#step-next');            // 最後一步：完成
await page.waitForSelector('#view-done.active');
await page.click('#done-home');
await page.click('[data-go="settings"]');
await page.waitForSelector('#slots .slot');
const slotKeys = await page.locator('#slots .slot').evaluateAll((els) => els.map((e) => e.dataset.slot));
ok('every place an image can go is listed, grouped by prayer',
   slotKeys.includes('home') && slotKeys.includes('done')
   && slotKeys.includes('chaplet:hail-mary') && slotKeys.includes('rosary:hail-mary')
   && slotKeys.includes('rosary:decade-1') && slotKeys.includes('rosary:decade-5'));
ok('the two prayers each get their own slots',
   await page.locator('.slot-group').count() === 3);
ok('all start on the built-in image', (await page.locator('.slot-state').allTextContents()).every((t) => t === '預設'));
ok('the rosary borrows the chaplet picture where it has none of its own',
   await page.locator('.slot[data-slot="rosary:hail-mary"] .slot-thumb').evaluate(
     (img) => img.getAttribute('src') === document.querySelector('.slot[data-slot="chaplet:hail-mary"] .slot-thumb').getAttribute('src')));

const pick = async (slot, file) => {
  await page.locator(`.slot[data-slot="${slot}"] button`, { hasText: /選圖|更換/ }).click();
  await page.setInputFiles('#pic-file', fixture(file));
  await page.waitForTimeout(500);
};
await pick('home', 'pic-mercy.png');
await pick('chaplet:hail-mary', 'pic-hail.png');
await pick('done', 'pic-mercy.png'); // 同一張圖用在第二個位置

const stored = await page.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open('mercy-pictures', 1); q.onsuccess = () => r(q.result); });
  const all = await new Promise((r) => { const t = db.transaction('blobs').objectStore('blobs').getAll(); t.onsuccess = () => r(t.result); });
  return { blobs: all.length, sizes: all.map((b) => b.size),
           roles: JSON.parse(localStorage.getItem('mercy.settings.v1')).pictures };
});
ok('one picture used twice is stored once', stored.blobs === 2);
ok('首頁 and 誦畢 share the same file', stored.roles.home === stored.roles.done);
ok('large photos are scaled down', stored.sizes.every((s) => s < 400 * 1024));
console.log('        stored sizes:', stored.sizes.map((s) => (s / 1024).toFixed(0) + 'KB').join(', '));

await page.click('#view-settings [data-go="home"]');
const home = await src('#home-image');
ok('chosen picture renders on the home screen', home.blob && home.w > 0);
ok('chosen picture was resized to 1600px', Math.max(home.w, home.h) === 1600);

await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#view-home.active');
ok('chosen picture survives a reload', (await src('#home-image')).blob);

await page.click('[data-go="settings"]');
const row = page.locator('.slot[data-slot="home"]');
await row.locator('button', { hasText: '還原' }).click();
await page.waitForTimeout(400);
ok('還原 puts the built-in image back', await row.locator('.slot-state').textContent() === '預設');
await page.click('#view-settings [data-go="home"]');
ok('home shows the built-in image again', !(await src('#home-image')).blob);

const repeats = missed.filter((p, i) => missed.indexOf(p) !== i);
ok('a missing file is retried at most once per page load', repeats.length === 0);
console.log(`        ${new Set(missed).size} listed file(s) not yet uploaded, ${missed.length} request(s) this page`);

console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'no console errors');
await browser.close();
process.exit(failures || errors.length ? 1 : 0);
