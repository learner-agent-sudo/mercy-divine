// 更多聖像：每張聖像下面的「換圖」——祈禱中當場選一張、全部輪流、從相簿加圖；
// 以及「圖組」——準備好幾組聖像，開始前在首頁選，祈禱中也能換。
import { readFileSync } from 'node:fs';
import { BASE, launch, fixture, openSlotGroup } from './helpers.mjs';
const ok = (l, p) => { console.log(`${p ? 'PASS' : 'FAIL ***'}  ${l}`); if (!p) failures++; };
let failures = 0;

const { browser, page, errors, autoDialog } = await launch({ acceptDownloads: true });
const outbound = [];
page.on('request', (r) => { if (!['localhost', ''].includes(new URL(r.url()).hostname)) outbound.push(r.url()); });

const settings = () => page.evaluate(() => JSON.parse(localStorage.getItem('mercy.settings.v1')));
const stepName = () => page.textContent('#step-name');
const sheetUp = () => page.isVisible('#pic-sheet');
const shown = (sel) => page.locator(`${sel} .car img`).count();
const blobs = () => page.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open('mercy-pictures', 1); q.onsuccess = () => r(q.result); });
  return new Promise((r) => { const t = db.transaction('blobs').objectStore('blobs').getAllKeys(); t.onsuccess = () => r(t.result); });
});
// 第三張圖：當場畫一張，跟另外兩張都不一樣，刪組時才分得出是誰的檔案
const paint = async (color) => ({ name: `${color}.png`, mimeType: 'image/png', buffer: Buffer.from(await page.evaluate((c) => {
  const cv = document.createElement('canvas');
  cv.width = 300; cv.height = 400;
  const x = cv.getContext('2d');
  x.fillStyle = c; x.fillRect(0, 0, 300, 400);
  return cv.toDataURL('image/png').split(',')[1];
}, color), 'base64') });
// prompt / confirm 要自己回答：關掉自動接受，這一個對話框照指定的回
const answer = async (text, act) => {
  autoDialog(false);
  page.once('dialog', (d) => (text === null ? d.dismiss() : d.accept(text)).catch(() => {}));
  await act();
  await page.waitForTimeout(400);
  autoDialog(true);
};

await page.goto(BASE, { waitUntil: 'networkidle' });

// ── 每一處聖像都有「換圖」 ──
ok('the home picture has a 換圖 button', await page.isVisible('#view-home .pic-pick'));
ok('with only one group there is nothing to choose on the home screen', !(await page.isVisible('#group-pick')));

await page.click('#start-btn');
await page.waitForSelector('#view-prayer.active');
await page.click('#step-next');                       // 聖號經 → 天主經
await page.waitForTimeout(300);
ok('the prayer picture has one too', await page.isVisible('#guided .pic-pick'));

await page.click('#guided .pic-pick');
await page.waitForTimeout(250);
ok('tapping it opens the picture sheet', await sheetUp());
ok('and does not count as a bead', (await stepName()) === '天主經');
ok('the sheet is named after the prayer', (await page.textContent('#sheet-title')) === '天主經');
ok('one built-in picture: offered with a way to add more, no "all" choice',
   await page.locator('#sheet-grid .tile-pic').count() === 1
   && await page.locator('#sheet-grid .tile-add').count() === 1
   && await page.locator('#sheet-grid .tile-all').count() === 0);
ok('no group chips while there is only one group', !(await page.isVisible('#sheet-groups')));

// 返回鍵先關面板，不會離開祈禱
await page.goBack();
await page.waitForTimeout(250);
ok('the back button closes the sheet', !(await sheetUp()));
ok('and stays in the prayer, on the same step',
   await page.isVisible('#view-prayer.active') && (await stepName()) === '天主經');

// ── 從面板加圖 ──
await page.click('#guided .pic-pick');
await page.click('#sheet-grid .tile-add');
await page.setInputFiles('#pic-file', [fixture('pic-mercy.png'), fixture('pic-hail.png')]);
await page.waitForTimeout(900);
ok('pictures added from the sheet show up in it straight away',
   await page.locator('#sheet-grid .tile-pic').count() === 3);
ok('next to an "all in turn" choice, which is the current one',
   await page.locator('#sheet-grid .tile-all[aria-pressed="true"]').count() === 1);
const s1 = await settings();
ok('they are added to this prayer\'s own slot, after the built-in one',
   JSON.stringify(s1.pictures['chaplet:our-father'].slice(0, 1)) === '["builtin:images/our-father.jpg"]'
   && s1.pictures['chaplet:our-father'].length === 3);
ok('the prayer picture becomes a carousel of all three', (await shown('#guided')) === 3);
ok('still on the same step', (await stepName()) === '天主經');

// ── 固定顯示其中一張 ──
const chosen = s1.pictures['chaplet:our-father'][1];
await page.locator('#sheet-grid .tile-pic').nth(1).click();
await page.waitForTimeout(400);
ok('picking one closes the sheet', !(await sheetUp()));
ok('and shows just that one', (await shown('#guided')) === 1
   && (await page.getAttribute('#guided-image', 'src')).startsWith('blob:'));
ok('it is remembered for this prayer', (await settings()).pins.default['chaplet:our-father'] === chosen);
ok('picking did not count as a bead either', (await stepName()) === '天主經');

await page.click('#guided .pic-pick');
ok('the picked one is marked in the sheet',
   await page.locator('#sheet-grid .tile-pic').nth(1).getAttribute('aria-pressed') === 'true'
   && await page.locator('#sheet-grid .tile-all').getAttribute('aria-pressed') === 'false');
await page.keyboard.press('Escape');
await page.waitForTimeout(250);
ok('Escape closes the sheet', !(await sheetUp()));

// 下一次唸到這裡還是那一張
await page.click('#prayer-exit');
await page.waitForSelector('#view-home.active');
await page.reload({ waitUntil: 'networkidle' });
await page.click('#start-btn');
await page.click('#step-next');
await page.waitForTimeout(400);
ok('after a reload the next prayer shows the picked one', (await shown('#guided')) === 1
   && (await page.getAttribute('#guided-image', 'src')).startsWith('blob:'));

await page.click('#guided .pic-pick');
await page.click('#sheet-grid .tile-all');
await page.waitForTimeout(400);
ok('"all in turn" brings the carousel back', (await shown('#guided')) === 3);
ok('and forgets the pick', !(await settings()).pins.default['chaplet:our-father']);

// ── 沒有自己的圖的那一段 ──
await page.click('#step-prev');                       // 聖號經：沒有內建圖，借用封面
await page.waitForTimeout(250);
await page.click('#guided .pic-pick');
await page.waitForTimeout(200);
ok('a prayer borrowing the cover says so', (await page.textContent('#sheet-note')).includes('借用「封面'));
await page.click('#sheet-grid .tile-add');
await page.setInputFiles('#pic-file', fixture('pic-hail.png'));
await page.waitForTimeout(700);
const s2 = await settings();
ok('adding there makes a picture of its own, without the borrowed cover',
   s2.pictures['chaplet:sign'] && s2.pictures['chaplet:sign'].length === 1
   && !s2.pictures['chaplet:home']);
ok('and the note goes away', !(await page.isVisible('#sheet-note')));
await page.click('#sheet-close');
await page.waitForTimeout(250);
ok('the close button closes it', !(await sheetUp()));
await page.evaluate(() => { for (let i = 0; i < 62; i++) document.querySelector('#step-next').click(); });
await page.waitForTimeout(400);
ok('the closing sign of the cross uses it too — same prayer, same slot',
   (await stepName()) === '聖號經' && (await page.getAttribute('#guided-image', 'src')).startsWith('blob:'));
await page.click('#prayer-exit');
await page.waitForSelector('#view-home.active');

// 誦畢畫面也有
ok('the closing screen has a 換圖 button too', await (async () => {
  await page.click('#start-btn');
  await page.evaluate(() => { const b = document.querySelector('#step-next');
    for (let i = 0; i < 200 && !document.querySelector('#view-done.active'); i++) b.click(); });
  await page.waitForSelector('#view-done.active');
  return page.isVisible('#view-done .pic-pick');
})());
await page.click('#view-done .pic-pick');
ok('and its sheet is for the closing picture', (await page.textContent('#sheet-title')) === '誦畢');
await page.click('#sheet-close');
await page.waitForTimeout(250);
ok('closing it stays on the closing screen', await page.isVisible('#view-done.active'));
await page.click('#done-home');
await page.waitForSelector('#view-home.active');

// ── 圖組 ──
await page.click('[data-go="settings"]');
ok('settings start on the default group', (await page.inputValue('#group-edit')) === 'default');
ok('the default group cannot be renamed or deleted',
   await page.isDisabled('#group-rename') && await page.isDisabled('#group-del'));

await answer(null, () => page.click('#group-new'));
ok('cancelling the name prompt adds nothing', (await page.locator('#group-edit option').count()) === 1);
await answer('將臨期', () => page.click('#group-new'));
const s3 = await settings();
const advent = s3.groups && s3.groups[0] && s3.groups[0].id;
ok('a new group can be added and named', s3.groups.length === 1 && s3.groups[0].name === '將臨期');
ok('and becomes the group being set up', (await page.inputValue('#group-edit')) === advent && s3.group === advent);
ok('the hint says which group this is', (await page.textContent('#group-hint')).includes('將臨期'));

const state = (slot) => page.textContent(`.slot[data-slot="${slot}"] .slot-state`);
await openSlotGroup(page, 'chaplet:our-father');
ok('a slot the default group filled reads as borrowed', (await state('chaplet:our-father')) === '沿用預設組 · 3 張');
ok('a slot nobody set stays on the built-in', (await state('chaplet:creed')) === '預設');
ok('no slots are counted as set in a fresh group',
   !(await page.locator('.slot-group-count').allTextContents()).some((t) => t.includes('已設定')));

await openSlotGroup(page, 'chaplet:home');
await page.locator('.slot[data-slot="chaplet:home"] button', { hasText: '加圖' }).click();
await page.setInputFiles('#pic-file', await paint('#3f6c88'));
await page.waitForTimeout(700);
ok('a new group starts with just its own picture', (await state('chaplet:home')) === '自訂圖片'
   && await page.locator('.slot[data-slot="chaplet:home"] .slot-pic').count() === 1);
ok('the default group is left alone', !('chaplet:home' in (await settings()).pictures));

await page.click('#view-settings [data-go="home"]');
await page.waitForTimeout(250);
ok('with two groups the home screen offers a choice', await page.isVisible('#group-pick'));
ok('set to the group just made', (await page.inputValue('#group-select')) === advent);
ok('and the cover is that group\'s picture alone', (await shown('#view-home')) === 1
   && (await page.getAttribute('#home-image', 'src')).startsWith('blob:'));

await page.selectOption('#group-select', 'default');
await page.waitForTimeout(300);
ok('switching to the default group on the home screen brings its cover back',
   (await shown('#view-home')) === 1 && !(await page.getAttribute('#home-image', 'src')).startsWith('blob:'));
ok('the choice is remembered', (await settings()).group === 'default');

// 祈禱中換組
await page.click('#start-btn');
await page.waitForSelector('#view-prayer.active');
await page.click('#guided .pic-pick');                 // 聖號經
await page.waitForTimeout(200);
ok('during prayer the sheet lists both groups',
   await page.locator('#sheet-groups .chip').count() === 2
   && await page.locator('#sheet-groups .chip[aria-pressed="true"]').textContent() === '預設');
await page.locator('#sheet-groups .chip', { hasText: '將臨期' }).click();
await page.waitForTimeout(400);
ok('switching group in the sheet keeps the prayer where it was',
   await page.isVisible('#view-prayer.active') && (await stepName()) === '聖號經' && await sheetUp());
ok('the group is switched', (await settings()).group === advent);
ok('a prayer the new group has not set borrows the default group\'s picture, and says so',
   (await page.textContent('#sheet-note')).includes('沿用預設組'));
await page.click('#sheet-close');
await page.click('#prayer-exit');
await page.waitForSelector('#view-home.active');
ok('the home screen follows the group chosen during prayer', (await page.inputValue('#group-select')) === advent);

// 改名、刪除
await page.click('[data-go="settings"]');
await answer('家人的照片', () => page.click('#group-rename'));
ok('a group can be renamed', (await page.locator('#group-edit option:checked').textContent()) === '家人的照片');

const blobsBefore = (await blobs()).length;
await answer(null, () => page.click('#group-del'));
ok('declining the delete keeps the group', (await page.locator('#group-edit option').count()) === 2);

// 先備份一次（等一下驗還原）：固定一張，讓備份裡也有「固定顯示」
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('mercy.settings.v1'));
  s.pins = { ...(s.pins || {}), [s.group]: { 'chaplet:our-father': 'builtin:images/our-father.jpg' } };
  localStorage.setItem('mercy.settings.v1', JSON.stringify(s));
});
await page.reload({ waitUntil: 'networkidle' });
await page.click('[data-go="settings"]');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export-btn')]);
const backupPath = await dl.path();
const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
ok('the backup carries the groups', Array.isArray(backup.pictureGroups) && backup.pictureGroups[0].name === '家人的照片');
ok('and every group\'s pictures', Object.keys(backup.pictures).length === (await blobs()).length);
ok('and the picked pictures', backup.picturePins && backup.picturePins[advent]['chaplet:our-father'] === 'builtin:images/our-father.jpg');

await answer('', () => page.click('#group-del'));     // confirm：接受
const s4 = await settings();
ok('a group can be deleted', !(s4.groups || []).length && (await page.locator('#group-edit option').count()) === 1);
ok('which drops back to the default group', s4.group === 'default' && (await page.inputValue('#group-edit')) === 'default');
ok('and its picks', !(s4.pins || {})[advent]);
ok('the picture only that group used is cleared from the phone', (await blobs()).length === blobsBefore - 1);
await page.click('#view-settings [data-go="home"]');
ok('with one group left the home screen choice goes away', !(await page.isVisible('#group-pick')));

// ── 備份還原 ──
await page.evaluate(async () => {
  localStorage.clear();
  for (const db of await indexedDB.databases()) indexedDB.deleteDatabase(db.name);
});
await page.reload({ waitUntil: 'networkidle' });
await page.click('[data-go="settings"]');
await page.setInputFiles('#import-file', backupPath);
await page.waitForTimeout(1200);
const s5 = await settings();
ok('restoring brings the group back with its name', s5.groups && s5.groups[0].id === advent && s5.groups[0].name === '家人的照片');
ok('with its own pictures', JSON.stringify(s5.groups[0].pictures) === JSON.stringify(backup.pictureGroups[0].pictures));
ok('the default group\'s pictures too, built-in ones included',
   JSON.stringify(s5.pictures['chaplet:our-father']) === JSON.stringify(backup.pictureRoles['chaplet:our-father']));
ok('and the picks', s5.pins[advent]['chaplet:our-father'] === 'builtin:images/our-father.jpg');
ok('every picture file is back', (await blobs()).length === Object.keys(backup.pictures).length);

// ── 來路不明的備份 ──
const png = `data:image/png;base64,${readFileSync(fixture('pic-hail.png')).toString('base64')}`;
const hostile = {
  app: 'mercy-divine', version: 4, records: [],
  pictures: { good1: png, 'builtin:images/home.jpg': png, far: 'http://198.51.100.7/x.png' },
  pictureRoles: { 'chaplet:creed': ['builtin:http://198.51.100.7/y.png', 'builtin:images/nope.jpg', 'far', 'good1'] },
  pictureGroups: [
    { id: '../../evil', name: 'x', pictures: { 'chaplet:home': ['good1'] } },
    { id: 'default', name: '冒充預設', pictures: { 'chaplet:home': ['good1'] } },
    { id: 'ok-group', name: '很長'.repeat(30), pictures: { 'made-up': ['good1'], 'chaplet:done': ['far', 'good1'] } },
  ],
  picturePins: { 'ok-group': { 'chaplet:done': 'http://198.51.100.7/z.png', 'chaplet:home': 'good1' }, nobody: { 'chaplet:home': 'good1' } },
};
await page.setInputFiles('#import-file', { name: 'h.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(hostile)) });
await page.waitForTimeout(1200);
const s6 = await settings();
const okGroup = (s6.groups || []).find((g) => g.id === 'ok-group');
ok('no request leaves the phone', outbound.length === 0);
ok('built-in references must name a real built-in picture, and remote files are refused',
   JSON.stringify(s6.pictures['chaplet:creed']) === '["good1"]');
ok('a group with a malformed id is dropped', !(s6.groups || []).some((g) => g.id.includes('/')));
ok('nothing can pose as the default group', !(s6.groups || []).some((g) => g.id === 'default'));
ok('a long name is cut short', okGroup && okGroup.name.length === 20);
ok('unknown slots and refused files are dropped from a group',
   okGroup && JSON.stringify(okGroup.pictures) === '{"chaplet:done":["good1"]}');
ok('picks must point at a picture that was let in', s6.pins['ok-group'] && !s6.pins['ok-group']['chaplet:done']
   && s6.pins['ok-group']['chaplet:home'] === 'good1');
ok('picks for a group that does not exist are dropped', !s6.pins.nobody);
ok('a picture file named like a built-in is not stored', !(await blobs()).includes('builtin:images/home.jpg'));

console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'no console errors');
await browser.close();
process.exit(failures || errors.length ? 1 : 0);
