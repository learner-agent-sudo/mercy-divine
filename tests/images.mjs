// 聖像：依經文切換、缺檔遞補、從相簿選圖、去重、縮圖、還原。
import { BASE, fixture, launch, openSlotGroup } from './helpers.mjs';
const ok = (l, p) => { console.log(`${p ? 'PASS' : 'FAIL ***'}  ${l}`); if (!p) failures++; };
let failures = 0;

const { browser, page, errors } = await launch({ acceptDownloads: true });
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
await page.waitForSelector('#slots .slot', { state: 'attached' });   // 分組預設收起
const slotKeys = await page.locator('#slots .slot').evaluateAll((els) => els.map((e) => e.dataset.slot));
ok('every place an image can go is listed, grouped by prayer',
   slotKeys.includes('chaplet:home') && slotKeys.includes('chaplet:done')
   && slotKeys.includes('rosary:home') && slotKeys.includes('rosary:done')
   && slotKeys.includes('chaplet:hail-mary') && slotKeys.includes('rosary:hail-mary')
   && slotKeys.includes('rosary:joyful-1') && slotKeys.includes('rosary:glorious-5'));
ok('every one of the twenty mysteries gets its own slot',
   ['joyful', 'luminous', 'sorrowful', 'glorious'].every((set) =>
     [1, 2, 3, 4, 5].every((n) => slotKeys.includes(`rosary:${set}-${n}`))));
ok('the two prayers and the four mystery sets are separate groups',
   await page.locator('.slot-group').count() === 6);
ok('all start on the built-in image', (await page.locator('.slot-state').allTextContents()).every((t) => t === '預設'));
ok('the rosary borrows the chaplet picture where it has none of its own',
   await page.locator('.slot[data-slot="rosary:hail-mary"] .slot-thumb').evaluate(
     (img) => img.getAttribute('src') === document.querySelector('.slot[data-slot="chaplet:hail-mary"] .slot-thumb').getAttribute('src')));

const pick = async (slot, file) => {
  await openSlotGroup(page, slot);
  await page.locator(`.slot[data-slot="${slot}"] button`, { hasText: /選圖|更換/ }).click();
  await page.setInputFiles('#pic-file', fixture(file));
  await page.waitForTimeout(500);
};
await pick('chaplet:home', 'pic-mercy.png');
await pick('chaplet:hail-mary', 'pic-hail.png');
await pick('chaplet:done', 'pic-mercy.png'); // 同一張圖用在第二個位置

const stored = await page.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open('mercy-pictures', 1); q.onsuccess = () => r(q.result); });
  const all = await new Promise((r) => { const t = db.transaction('blobs').objectStore('blobs').getAll(); t.onsuccess = () => r(t.result); });
  return { blobs: all.length, sizes: all.map((b) => b.size),
           roles: JSON.parse(localStorage.getItem('mercy.settings.v1')).pictures };
});
ok('one picture used twice is stored once', stored.blobs === 2);
ok('封面 and 誦畢 share the same file', stored.roles['chaplet:home'] === stored.roles['chaplet:done']);
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
await openSlotGroup(page, 'chaplet:home');
const row = page.locator('.slot[data-slot="chaplet:home"]');
await row.locator('button', { hasText: '還原' }).click();
await page.waitForTimeout(400);
ok('還原 puts the built-in image back', await row.locator('.slot-state').textContent() === '預設');
await page.click('#view-settings [data-go="home"]');
ok('home shows the built-in image again', !(await src('#home-image')).blob);

const repeats = missed.filter((p, i) => missed.indexOf(p) !== i);
ok('a missing file is retried at most once per page load', repeats.length === 0);
console.log(`        ${new Set(missed).size} listed file(s) not yet uploaded, ${missed.length} request(s) this page`);

// ── 每套經文各有封面 ──（此時已在首頁）
const cover = () => page.evaluate(async () => {
  const i = document.querySelector('#home-image');
  for (let n = 0; n < 60 && !i.naturalWidth; n++) await new Promise((r) => setTimeout(r, 25));
  return i.src.startsWith('blob:') ? `blob:${i.naturalWidth}x${i.naturalHeight}` : i.src.split('/').pop();
});
const pickFor = async (slot, file) => {
  await page.click('[data-go="settings"]');
  await openSlotGroup(page, slot);
  await page.locator(`.slot[data-slot="${slot}"] button`, { hasText: /選圖|更換/ }).click();
  await page.setInputFiles('#pic-file', fixture(file));
  await page.waitForTimeout(500);
  await page.click('#view-settings [data-go="home"]');
};

const shared = await cover();
await page.locator('#set-picker button', { hasText: '玫瑰經' }).click();
await page.waitForTimeout(250);
ok('both prayers start on the same cover', await cover() === shared);

await page.locator('#set-picker button', { hasText: '慈悲串經' }).click();
await page.waitForTimeout(200);
await pickFor('chaplet:home', 'pic-mercy.png');
const chapletCover = await cover();
ok('a cover set for the chaplet shows on the chaplet', chapletCover !== shared);

await page.locator('#set-picker button', { hasText: '玫瑰經' }).click();
await page.waitForTimeout(300);
ok('and does not leak onto the rosary', await cover() === shared);

await pickFor('rosary:home', 'pic-hail.png');
const rosaryCover = await cover();
ok('the rosary takes its own cover', rosaryCover !== shared && rosaryCover !== chapletCover);

await page.locator('#set-picker button', { hasText: '慈悲串經' }).click();
await page.waitForTimeout(300);
ok('switching back shows the chaplet cover again', await cover() === chapletCover);
await page.locator('#set-picker button', { hasText: '玫瑰經' }).click();
await page.waitForTimeout(300);
ok('and switching forward shows the rosary cover', await cover() === rosaryCover);

// 誦畢畫面同樣分開
await page.click('[data-go="settings"]');
const slots = await page.locator('#slots .slot').evaluateAll((els) => els.map((e) => e.dataset.slot));
ok('each prayer also has its own closing picture',
   slots.includes('chaplet:done') && slots.includes('rosary:done'));
ok('there is no single shared cover slot left to confuse things',
   !slots.includes('home') && !slots.includes('done'));

// ── 明確「不用圖片」 ──（此時已在設定頁）
const state = (slot) => page.textContent(`.slot[data-slot="${slot}"] .slot-state`);
const buttons = (slot) => page.locator(`.slot[data-slot="${slot}"] button`).allTextContents();

ok('a fresh slot offers 選圖 and 不用', (await buttons('rosary:sign')).join() === '選圖,不用');
await openSlotGroup(page, 'rosary:sign');
await page.locator('.slot[data-slot="rosary:sign"] button', { hasText: '不用' }).click();
await page.waitForTimeout(300);
ok('choosing 不用 is its own state, not just a default', await state('rosary:sign') === '不用圖片');
ok('and it offers a way back', (await buttons('rosary:sign')).includes('還原'));
ok('its thumbnail shows nothing rather than a borrowed picture',
   await page.locator('.slot[data-slot="rosary:sign"] .slot-thumb-none').count() === 1);

// 祈禱時真的不顯示，也不會從別處遞補
await page.click('#view-settings [data-go="home"]');
await page.locator('#set-picker button', { hasText: '玫瑰經' }).click();
await page.waitForTimeout(250);
await page.click('#start-btn');
await page.waitForTimeout(300);
const plateHidden = () => page.evaluate(() => document.querySelector('#guided-image').closest('.plate').hidden);
ok('the prayer set to 不用 shows no picture at all', await plateHidden() === true);
await page.click('#step-next');
await page.waitForTimeout(250);
ok('the next prayer still has one', await plateHidden() === false);
await page.click('#prayer-exit');

// 只影響那一套經文
await page.locator('#set-picker button', { hasText: '慈悲串經' }).click();
await page.waitForTimeout(250);
await page.click('[data-go="settings"]');
ok('the other prayer is untouched', await state('chaplet:creed') !== '不用圖片');

// 封面也能關掉
await openSlotGroup(page, 'chaplet:home');
await page.locator('.slot[data-slot="chaplet:home"] button', { hasText: '不用' }).click();
await page.waitForTimeout(300);
await page.click('#view-settings [data-go="home"]');
ok('a cover set to 不用 leaves the home screen without one',
   await page.evaluate(() => document.querySelector('#home-image').closest('.plate').hidden) === true);

// 還原回到預設
await page.click('[data-go="settings"]');
await openSlotGroup(page, 'chaplet:home');
await page.locator('.slot[data-slot="chaplet:home"] button', { hasText: '還原' }).click();
await page.waitForTimeout(300);
ok('還原 puts the default back', await state('chaplet:home') === '預設');
await page.click('#view-settings [data-go="home"]');
ok('and the cover returns',
   await page.evaluate(() => document.querySelector('#home-image').closest('.plate').hidden) === false);

// 備份要記得「不用」這個選擇
await page.click('[data-go="settings"]');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export-btn')]);
const backupPath = await dl.path();
await page.evaluate(async () => {
  localStorage.clear();
  for (const db of await indexedDB.databases()) indexedDB.deleteDatabase(db.name);
});
await page.reload({ waitUntil: 'networkidle' });
await page.click('[data-go="settings"]');
await page.setInputFiles('#import-file', backupPath);
await page.waitForTimeout(900);
ok('a restored backup remembers 不用圖片', await state('rosary:sign') === '不用圖片');

// ── 每一端奧蹟各有各的聖像，一端之內整段都用它 ──（此時已在設定頁）
await openSlotGroup(page, 'rosary:sorrowful-2');
await page.locator('.slot[data-slot="rosary:sorrowful-2"] button', { hasText: '選圖' }).click();
// 這裡刻意用與玫瑰經封面不同的圖：相同內容的圖片只會存一份，
// 用同一張就分不出是奧蹟的圖還是退回封面。
await page.setInputFiles('#pic-file', fixture('pic-mercy.png'));
await page.waitForTimeout(600);
ok('a mystery can take its own picture',
   await page.textContent('.slot[data-slot="rosary:sorrowful-2"] .slot-state') === '自訂圖片');
ok('the same mystery in another set is untouched',
   await page.textContent('.slot[data-slot="rosary:joyful-2"] .slot-state') === '預設');

await page.click('#view-settings [data-go="home"]');
await page.locator('#set-picker button', { hasText: '玫瑰經' }).click();
await page.waitForTimeout(200);
await page.selectOption('#mystery-select', 'sorrowful');
await page.waitForTimeout(200);
await page.click('#start-btn');

const guided = () => page.evaluate(async () => {
  const i = document.querySelector('#guided-image');
  for (let n = 0; n < 60 && !i.naturalWidth && !i.closest('.plate').hidden; n++) await new Promise((r) => setTimeout(r, 25));
  return i.closest('.plate').hidden ? 'none' : i.src;
});

// 第一端沒有配圖，會退回玫瑰經的封面
for (let i = 0; i < 7; i++) await page.click('#step-next');
const firstMystery = await guided();
ok(`a mystery with no picture of its own falls back (${await page.textContent('#step-name')})`,
   firstMystery !== 'none');

// 走到第二端，這一端配了自己的圖
for (let i = 0; i < 14; i++) await page.click('#step-next');
const secondMystery = await guided();
ok(`the second sorrowful mystery shows its own picture (${await page.textContent('#step-name')})`,
   secondMystery !== firstMystery);
// 報過奧蹟之後，每一段經文各用自己的聖像
await page.click('#step-next');
ok(`the Our Father after it shows the Our Father picture (${await page.textContent('#step-name')})`,
   (await guided()).endsWith('our-father.jpg'));
await page.click('#step-next');
ok(`and the Hail Marys show the Hail Mary picture (${await page.textContent('#step-name')})`,
   (await guided()).endsWith('hail-mary.jpg'));
await page.click('#step-next');
ok('every one of the ten, not just the first',
   (await guided()).endsWith('hail-mary.jpg'));
for (let i = 0; i < 11; i++) await page.click('#step-next');
ok('the third mystery, unset, goes back to the fallback',
   await page.textContent('#prayer-stage') === '第三端' && await guided() === firstMystery);

console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'no console errors');
await browser.close();
process.exit(failures || errors.length ? 1 : 0);
