// 九日敬禮的聖像：設定裡的四個位置、加圖、換圖（輪播、固定、返回鍵）、不用、還原、備份與匯入。
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASE, fixture, launch, openSlotGroup, setFiles } from './helpers.mjs';
const ok = (l, p) => { console.log(`${p ? 'PASS' : 'FAIL ***'}  ${l}`); if (!p) failures++; };
let failures = 0;

const IDS = ['souls', 'spirit', 'immaculate', 'auxilium'];
const NAMES = {
  souls: '煉靈九日敬禮', spirit: '天主聖神九日敬禮',
  immaculate: '聖母無玷始胎九日敬禮', auxilium: '聖母進教之佑九日敬禮',
};

// 兩個獨立的瀏覽器：第一個做主要流程，第二個模擬換一台手機的全新環境（匯入備份用）
const first = await launch({ acceptDownloads: true });
const fresh0 = await launch({ acceptDownloads: true });
const { browser, page, errors } = first;
const outbound = [];
// blob: 是本機的圖（與 http 同源的 blob 網址沒有 hostname），只看真正的 http(s) 網路請求
const watch = (p) => p.on('request', (r) => {
  const u = new URL(r.url());
  if (/^https?:$/.test(u.protocol) && u.hostname !== 'localhost') outbound.push(r.url());
});
watch(page);
await page.goto(BASE, { waitUntil: 'networkidle' });

// ── 小工具 ──
const readSettings = (pg) => pg.evaluate(() => JSON.parse(localStorage.getItem('mercy.settings.v1') || '{}'));
const pictures = async (pg) => (await readSettings(pg)).pictures || {};

// 回到首頁：設定頁用它自己的「回首頁」，其他畫面就一層一層返回
const toHome = async (pg) => {
  for (let i = 0; i < 10 && !(await pg.locator('#view-home.active').count()); i++) {
    if (await pg.locator('#view-settings.active [data-go="home"]').count()) {
      await pg.click('#view-settings.active [data-go="home"]');
    } else {
      await pg.goBack();
    }
    await pg.waitForTimeout(150);
  }
  await pg.waitForSelector('#view-home.active');
};
const openSettings = async (pg) => {
  await toHome(pg);
  await pg.click('[data-go="settings"]');
  await pg.waitForSelector('#slots .slot', { state: 'attached' });
};
const openNovenaList = async (pg) => {
  await toHome(pg);
  await pg.click('#novena-open');
  await pg.waitForSelector('.nov-card[data-id]');
};
const openNovena = async (pg, id) => {
  await openNovenaList(pg);
  await pg.click(`.nov-card[data-id="${id}"]`);
  await pg.waitForSelector('h2.nov-title');
};
const slotState = (pg, slot) => pg.textContent(`.slot[data-slot="${slot}"] .slot-state`);
const slotBtn = (pg, slot, text) => pg.locator(`.slot[data-slot="${slot}"] button`, { hasText: text });
const pick = async (pg, slot, file) => {
  await openSettings(pg);
  await openSlotGroup(pg, slot);
  await slotBtn(pg, slot, '加圖').click();
  await setFiles(pg, '#pic-file', fixture(file));
};
// 圖的來源：blob 代號以 "blob" 表示，其餘取檔名；沒有圖回 null
const srcName = (src) => (src.startsWith('blob:') ? 'blob' : src.split('/').pop());
const cardThumb = (pg, id) => pg.evaluate((i) => {
  const img = document.querySelector(`.nov-card[data-id="${i}"] img.nov-card-pic`);
  return img ? (img.src.startsWith('blob:') ? 'blob' : img.src.split('/').pop()) : null;
}, id);
// 九日敬禮頁頂端的大圖：沒有（整個 plate 隱藏或不存在）回 'none'，否則回每一張的來源
const heroImgs = (pg) => pg.evaluate(async () => {
  const plate = document.querySelector('.nov-plate');
  if (!plate || plate.hidden) return 'none';
  const imgs = [...plate.querySelectorAll('.car img')];
  for (let n = 0; n < 60 && imgs.some((i) => !i.naturalWidth); n++) await new Promise((r) => setTimeout(r, 25));
  return imgs.map((i) => (i.src.startsWith('blob:') ? 'blob' : i.src.split('/').pop()));
});
// 進到某一天的畫面取圖，再返回九日敬禮頁
const dayPic = async (pg, n) => {
  await pg.click(`.nov-day[data-n="${n}"]`);
  await pg.waitForSelector('.nov-day-head');
  const v = await pg.evaluate(() => {
    const img = document.querySelector('.nov-day-pic');
    return img ? (img.src.startsWith('blob:') ? 'blob' : img.src.split('/').pop()) : null;
  });
  await pg.click('#novena-back');
  await pg.waitForSelector('h2.nov-title');
  return v;
};
const sheetOpen = (pg) => pg.evaluate(() => !document.querySelector('#pic-sheet').hidden);
const openSheet = async (pg) => {
  await pg.click('.nov-plate .pic-pick');
  await pg.waitForFunction(() => !document.querySelector('#pic-sheet').hidden);
};
const waitState = (pg, slot, text) => pg.waitForFunction(
  ([s, t]) => document.querySelector(`.slot[data-slot="${s}"] .slot-state`)?.textContent.trim() === t,
  [slot, text]);

// ── 1. 設定列出四個九日敬禮位置 ──
await openSettings(page);
const group = await page.evaluate(() => {
  const name = [...document.querySelectorAll('.slot-group-name')].find((n) => n.textContent.trim() === '九日敬禮');
  if (!name) return null;
  // 分組是 <details>，<summary class="slot-group"> 是它的標題列，位置都在 details 裡面
  const det = name.closest('details');
  return {
    collapsed: det ? !det.open : null,
    slots: [...det.querySelectorAll('.slot')].map((s) => ({
      slot: s.dataset.slot,
      name: s.querySelector('.slot-name')?.textContent.trim(),
      state: s.querySelector('.slot-state')?.textContent.trim(),
      thumb: s.querySelector('img.slot-thumb')?.getAttribute('src') || '',
    })),
  };
});
ok('the 九日敬禮 group is listed and collapsed by default', !!group && group.collapsed === true);
ok('it holds the four novenas, in order, with their names', !!group && group.slots.length === 4
  && IDS.every((id, i) => group.slots[i].slot === `novena:${id}` && group.slots[i].name === NAMES[id]));
ok('each shows its svg thumbnail', !!group && IDS.every((id, i) => group.slots[i].thumb.endsWith(`images/novena-${id}.svg`)));
ok('all start on 預設', !!group && group.slots.every((s) => s.state === '預設'));

// ── 2. 加圖：souls 的清單變成 [內建, 新圖] ──
await pick(page, 'novena:souls', 'pic-mercy.png');
const p2 = await pictures(page);
ok('adding appends: built-in first, then the chosen picture',
   Array.isArray(p2['novena:souls']) && p2['novena:souls'].length === 2
   && p2['novena:souls'][0] === 'builtin:novena:souls' && !p2['novena:souls'][1].startsWith('builtin:'));
const blobId = p2['novena:souls'][1];
ok('state reads 自訂 2 張 · 輪流顯示', await slotState(page, 'novena:souls') === '自訂 2 張 · 輪流顯示');
ok('the other novenas are untouched', (await slotState(page, 'novena:spirit')) === '預設'
  && (await slotState(page, 'novena:auxilium')) === '預設');

// ── 3. 清單縮圖與九日敬禮頁、各天 ──
await openNovenaList(page);
ok('list card still shows the svg (first picture is built-in)', (await cardThumb(page, 'souls')) === 'novena-souls.svg');
await page.click('.nov-card[data-id="souls"]');
await page.waitForSelector('h2.nov-title');
const hero3 = await heroImgs(page);
ok('souls screen carousel has 2 images, the second is the chosen one',
   Array.isArray(hero3) && hero3.length === 2 && hero3[0] === 'novena-souls.svg' && hero3[1] === 'blob');
ok('two carousel dots', await page.locator('.car-dots button').count() === 2);
ok('換圖 button is offered', await page.locator('.nov-plate .pic-pick', { hasText: '換圖' }).count() === 1);
ok('day 1 shows the svg', (await dayPic(page, 1)) === 'novena-souls.svg');
ok('day 2 shows the chosen picture', (await dayPic(page, 2)) === 'blob');

// ── 4. 換圖面板：標題、磚塊、返回鍵只關面板、點一張就固定 ──
await openSheet(page);
ok('sheet is titled with the novena name', (await page.textContent('#sheet-title')) === NAMES.souls);
ok('sheet shows 全部輪流, two pictures and 加圖',
   await page.locator('#sheet-grid .tile-all').count() === 1
   && await page.locator('#sheet-grid .tile-pic').count() === 2
   && await page.locator('#sheet-grid .tile-add').count() === 1);
await page.goBack();
await page.waitForFunction(() => document.querySelector('#pic-sheet').hidden);
ok('phone back closes only the sheet and stays on the novena screen',
   (await sheetOpen(page)) === false && (await page.textContent('h2.nov-title')) === NAMES.souls);

await openSheet(page);
await page.locator('#sheet-grid .tile-pic').nth(1).click();
await page.waitForFunction(() => document.querySelector('#pic-sheet').hidden);
const pins4 = (await readSettings(page)).pins || {};
ok('clicking the second picture pins it and closes the sheet',
   (await sheetOpen(page)) === false && pins4.default?.['novena:souls'] === blobId);
const hero4 = await heroImgs(page);
ok('the hero now shows only the pinned picture', Array.isArray(hero4) && hero4.length === 1 && hero4[0] === 'blob');
await page.click('#novena-back');
await page.waitForSelector('.nov-card[data-id]');
ok('list card shows the pinned picture', (await cardThumb(page, 'souls')) === 'blob');
await page.click('.nov-card[data-id="souls"]');
await page.waitForSelector('h2.nov-title');
ok('day 1 shows the pinned picture', (await dayPic(page, 1)) === 'blob');

// ── 5. 在 spirit 的換圖面板加圖：追加、畫面與面板即時更新 ──
await openNovena(page, 'spirit');
await openSheet(page);
await page.locator('#sheet-grid .tile-add').click();
await setFiles(page, '#pic-file', fixture('pic-hail.png'));
const p5 = await pictures(page);
ok('adding from the sheet appends to spirit',
   Array.isArray(p5['novena:spirit']) && p5['novena:spirit'].length === 2 && p5['novena:spirit'][0] === 'builtin:novena:spirit');
ok('the sheet is still open after adding', await sheetOpen(page) === true);
ok('the sheet now shows two pictures', await page.locator('#sheet-grid .tile-pic').count() === 2);
const hero5 = await heroImgs(page);
ok('the hero shows both pictures while the sheet is open', Array.isArray(hero5) && hero5.length === 2);
await page.goBack();
await page.waitForFunction(() => document.querySelector('#pic-sheet').hidden);

// ── 6. 不用 → 清單、九日敬禮頁、各天都不顯示；還原後回到 svg ──
await openSettings(page);
await openSlotGroup(page, 'novena:immaculate');
await slotBtn(page, 'novena:immaculate', '不用').click();
await waitState(page, 'novena:immaculate', '不用圖片');
ok('immaculate state reads 不用圖片', (await slotState(page, 'novena:immaculate')) === '不用圖片');
await openNovenaList(page);
ok('list card shows no picture at all', (await cardThumb(page, 'immaculate')) === null);
await page.click('.nov-card[data-id="immaculate"]');
await page.waitForSelector('h2.nov-title');
ok('novena screen hides the picture plate', (await heroImgs(page)) === 'none');
ok('day 1 has no picture', (await dayPic(page, 1)) === null);

await openSettings(page);
await openSlotGroup(page, 'novena:immaculate');
await slotBtn(page, 'novena:immaculate', '還原').click();
await waitState(page, 'novena:immaculate', '預設');
await openNovenaList(page);
ok('還原 brings the svg back on the list card', (await cardThumb(page, 'immaculate')) === 'novena-immaculate.svg');

// ── 7. auxilium 不受影響；首頁不出現九日敬禮的圖 ──
await openNovenaList(page);   // 列表卡片要在列表畫面上檢查
ok('auxilium list card keeps its svg', (await cardThumb(page, 'auxilium')) === 'novena-auxilium.svg');
await page.click('.nov-card[data-id="auxilium"]');
await page.waitForSelector('h2.nov-title');
const hero7 = await heroImgs(page);
ok('auxilium hero keeps its svg', Array.isArray(hero7) && hero7.length === 1 && hero7[0] === 'novena-auxilium.svg');
ok('auxilium day 1 keeps its svg', (await dayPic(page, 1)) === 'novena-auxilium.svg');
await toHome(page);
const homeSrc = await page.getAttribute('#home-image', 'src');
ok('home picture is a prayer picture, never a novena one', !!homeSrc && !homeSrc.includes('novena-'));

// ── 8. 備份：匯出內容正確；全新環境匯入後還原；壞的條目被丟掉 ──
await openSettings(page);
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export-btn')]);
const backupPath = await dl.path();
const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
const roles = backup.pictureRoles?.['novena:souls'] || [];
ok('export carries souls as two entries', roles.length === 2 && roles[0] === 'builtin:novena:souls' && roles[1] === blobId);
ok('export carries the chosen picture bytes', typeof backup.pictures?.[blobId] === 'string'
   && backup.pictures[blobId].startsWith('data:'));
ok('export carries the pin', backup.picturePins?.default?.['novena:souls'] === blobId);

const f = fresh0.page;
watch(f);
await f.goto(BASE, { waitUntil: 'networkidle' });
await openSettings(f);
await setFiles(f, '#import-file', backupPath);
const pf = await pictures(f);
ok('fresh browser: souls list restored in order',
   Array.isArray(pf['novena:souls']) && pf['novena:souls'].length === 2
   && pf['novena:souls'][0] === 'builtin:novena:souls' && pf['novena:souls'][1] === blobId);
const storedUnderId = await f.evaluate(async (id) => {
  const db = await new Promise((r) => { const q = indexedDB.open('mercy-pictures', 1); q.onsuccess = () => r(q.result); });
  const row = await new Promise((r) => { const t = db.transaction('blobs').objectStore('blobs').get(id); t.onsuccess = () => r(t.result); });
  db.close();
  return !!row;
}, blobId);
ok('fresh browser: the chosen picture is stored under the same id', storedUnderId === true);
await openNovena(f, 'souls');
const hf = await heroImgs(f);
ok('fresh browser: souls screen shows the single pinned picture', Array.isArray(hf) && hf.length === 1 && hf[0] === 'blob');

// 壞條目：未知的位置、不存在的內建圖都不收；好的一筆（spirit）要照常還原，證明匯入確實有跑
const craftDir = mkdtempSync(join(tmpdir(), 'mercy-novena-pics-'));
const craftPath = join(craftDir, 'crafted-novena-pictures.json');
writeFileSync(craftPath, JSON.stringify({
  app: 'mercy-divine', version: backup.version, records: [],
  pictureRoles: {
    'novena:nope': ['builtin:novena:souls'],
    'novena:auxilium': ['builtin:novena:fake'],
    'novena:spirit': ['builtin:novena:spirit'],
  },
}));
await openSettings(f);
await setFiles(f, '#import-file', craftPath);
const pc = await pictures(f);
ok('crafted import: unknown slot novena:nope is dropped', !('novena:nope' in pc));
ok('crafted import: unknown built-in novena:auxilium entry is dropped', !('novena:auxilium' in pc));
ok('crafted import: the valid spirit entry is still restored', Array.isArray(pc['novena:spirit'])
   && pc['novena:spirit'][0] === 'builtin:novena:spirit');
ok('crafted import: souls is left as it was', Array.isArray(pc['novena:souls']) && pc['novena:souls'].length === 2);

// ── 9. 沒有主控台錯誤，資料沒有離開裝置 ──
const allErrors = [...errors, ...fresh0.errors];
ok(`no console errors${allErrors.length ? ': ' + allErrors.join('; ') : ''}`, allErrors.length === 0);
ok('nothing left the device', outbound.length === 0);
if (outbound.length) console.log('        outbound:', outbound.slice(0, 5).join(', '));

await browser.close();
await fresh0.browser.close();
process.exit(failures || allErrors.length || outbound.length ? 1 : 0);
