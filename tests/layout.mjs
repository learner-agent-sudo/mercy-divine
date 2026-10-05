// 祈禱畫面的版面：全螢幕、珠子在經文上方、聖像釘在頂端不隨經文捲走，
// 以及一個位置可以放零張、一張或好幾張聖像（好幾張就輪播）。
import { readFileSync } from 'node:fs';
import { BASE, launch, openSlotGroup, fixture } from './helpers.mjs';
const ok = (l, p) => { console.log(`${p ? 'PASS' : 'FAIL ***'}  ${l}`); if (!p) failures++; };
let failures = 0;

const { browser, page, errors } = await launch();
const top = (sel) => page.evaluate((s) => document.querySelector(s).getBoundingClientRect().top, sel);

// ── 舊設定：一個位置存一個字串，更新後要自動變成一串 ──
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  localStorage.setItem('mercy.settings.v1', JSON.stringify({ pictures: { 'chaplet:creed': 'none', 'chaplet:home': 'abc123' } }));
});
await page.reload({ waitUntil: 'networkidle' });
const tidy = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.settings.v1')).pictures);
ok('an old single-picture setting becomes a list', JSON.stringify(tidy['chaplet:home']) === '["abc123"]');
ok('and "no picture" stays "no picture"', tidy['chaplet:creed'] === 'none');
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

// ── 全螢幕 ──
await page.click('#start-btn');
await page.waitForSelector('#view-prayer.active');
await page.waitForTimeout(300);
ok('starting a prayer goes full screen', await page.evaluate(() => !!document.fullscreenElement));

// ── 珠子在經文上面 ──
for (let i = 0; i < 5; i++) await page.click('#step-next');   // 走到小珠
await page.waitForTimeout(200);
ok('this step has beads', await page.locator('#beads .bead').count() > 5);
ok('the beads sit above the prayer text', (await top('#beads')) < (await top('#step-text')));
ok('and below the picture', (await top('#guided .plate')) < (await top('#beads')));

// ── 聖像釘在上面 ──
await page.click('#prayer-exit');                            // 中途離開會問，測試一律接受
await page.waitForSelector('#view-home.active');
ok('leaving the prayer leaves full screen', await page.evaluate(() => !document.fullscreenElement));

await page.click('[data-go="settings"]');
await page.locator('#set-font').fill('170');
await page.click('#view-settings [data-go="home"]');
await page.click('#start-btn');
for (let i = 0; i < 3; i++) await page.click('#step-next');   // 信經，最長的一段
await page.waitForTimeout(300);
ok('the long creed has to scroll', await page.evaluate(() => {
  const s = document.querySelector('#prayer-scroll');
  return s.scrollHeight > s.clientHeight + 100;
}));
const plateBefore = await top('#guided .plate');
const nameBefore = await top('#step-name');
const textBefore = await top('#step-text');
await page.evaluate(() => { document.querySelector('#prayer-scroll').scrollTop = 240; });
await page.waitForTimeout(200);
ok('scrolling the text leaves the picture where it was', Math.abs((await top('#guided .plate')) - plateBefore) < 1);
ok('and the prayer name with it', Math.abs((await top('#step-name')) - nameBefore) < 1);
ok('while the text itself moves', (await top('#step-text')) < textBefore - 200);
ok('the text passes under the picture, not over it', await page.evaluate(() => {
  const pin = document.querySelector('#guided .pinned').getBoundingClientRect();
  const hit = document.elementFromPoint(pin.left + pin.width / 2, pin.top + 30);
  return !!hit && !!hit.closest('.pinned');
}));
ok('the next step starts from the top again', await (async () => {
  await page.click('#step-next');
  await page.waitForTimeout(150);
  return page.evaluate(() => document.querySelector('#prayer-scroll').scrollTop === 0);
})());
await page.click('#prayer-exit');
await page.waitForSelector('#view-home.active');
await page.click('[data-go="settings"]');
await page.locator('#set-font').fill('100');

// 全螢幕可以在設定裡關掉
await page.uncheck('#set-full');
await page.click('#view-settings [data-go="home"]');
await page.click('#start-btn');
await page.waitForTimeout(300);
ok('with the setting off, the prayer stays windowed', await page.evaluate(() => !document.fullscreenElement));
await page.click('#prayer-exit');
await page.waitForSelector('#view-home.active');

// ── 一個位置放好幾張：輪播 ──
await page.click('[data-go="settings"]');
await page.check('#set-full');
await openSlotGroup(page, 'chaplet:our-father');
await page.locator('.slot[data-slot="chaplet:our-father"] button', { hasText: '加圖' }).click();
await page.setInputFiles('#pic-file', [fixture('pic-mercy.png'), fixture('pic-hail.png')]);
await page.waitForTimeout(800);
ok('several pictures can be added at once, after the one already there',
   (await page.textContent('.slot[data-slot="chaplet:our-father"] .slot-state')).includes('自訂 3 張'));
ok('each is listed so it can be taken out on its own',
   await page.locator('.slot[data-slot="chaplet:our-father"] .slot-pic').count() === 3);
ok('the built-in picture is kept, first in line',
   (await page.locator('.slot[data-slot="chaplet:our-father"] .slot-pic img').first().getAttribute('src'))
     .endsWith('our-father.jpg'));
await page.locator('.slot[data-slot="chaplet:our-father"] button', { hasText: '加圖' }).click();
await page.setInputFiles('#pic-file', fixture('pic-mercy.png'));
await page.waitForTimeout(500);
ok('adding a picture already there does not duplicate it',
   await page.locator('.slot[data-slot="chaplet:our-father"] .slot-pic').count() === 3);

await page.click('#view-settings [data-go="home"]');
await page.click('#start-btn');
await page.click('#step-next');                               // 聖號經之後就是天主經
await page.waitForTimeout(500);
ok('the step shows every picture of its slot', await page.locator('#guided .car img').count() === 3);
ok('with a dot for each', await page.locator('#guided .car-dots button').count() === 3);
const shown = () => page.evaluate(() => {
  const car = document.querySelector('#guided .car');
  return Math.round(car.scrollLeft / car.clientWidth);
});
ok('it starts on the first picture', (await shown()) === 0);
await page.locator('#guided .car-dots button').nth(1).click();
await page.waitForTimeout(700);
ok('tapping a dot brings up that picture', (await shown()) === 1);
ok('and tapping a dot is not a bead', (await page.textContent('#step-name')) === '天主經');
ok('the dot for the shown picture is marked',
   await page.locator('#guided .car-dots button').nth(1).getAttribute('aria-current') === 'true');

// 自己換下一張（間隔六秒）
await page.locator('#guided .car-dots button').nth(0).click();
await page.waitForTimeout(6900);
ok('left alone, the pictures take turns', (await shown()) === 1);

// 橫著滑是換圖，不是數珠
const car = await page.locator('#guided .car').boundingBox();
await page.mouse.move(car.x + car.width * 0.8, car.y + car.height / 2);
await page.mouse.down();
await page.mouse.move(car.x + car.width * 0.2, car.y + car.height / 2, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(300);
ok('a sideways swipe on the pictures does not advance the prayer', (await page.textContent('#step-name')) === '天主經');

await page.click('#step-next');
await page.waitForTimeout(300);
ok('a step with one picture shows just that one',
   await page.locator('#guided .car img').count() === 1 && await page.locator('#guided .car-dots').count() === 0);
await page.click('#prayer-exit');
await page.waitForSelector('#view-home.active');

// ── 拿掉一張、再拿掉最後一張 ──
await page.click('[data-go="settings"]');
await openSlotGroup(page, 'chaplet:our-father');
const ofState = () => page.textContent('.slot[data-slot="chaplet:our-father"] .slot-state');
await page.locator('.slot[data-slot="chaplet:our-father"] .slot-pic-x').first().click();
await page.waitForTimeout(400);
ok('one picture can be taken out — the built-in one too',
   await page.locator('.slot[data-slot="chaplet:our-father"] .slot-pic').count() === 2
   && await page.locator('.slot[data-slot="chaplet:our-father"] .slot-pic img[src^="blob:"]').count() === 2);
await page.locator('.slot[data-slot="chaplet:our-father"] .slot-pic-x').first().click();
await page.waitForTimeout(400);
ok('leaving one', (await ofState()) === '自訂圖片');
await page.locator('.slot[data-slot="chaplet:our-father"] .slot-pic-x').first().click();
await page.waitForTimeout(400);
ok('taking out the last goes back to the default, not to no picture', (await ofState()) === '預設');

// 加了圖又拿掉，只剩內建那張時，就等於沒改過
await page.locator('.slot[data-slot="chaplet:our-father"] button', { hasText: '加圖' }).click();
await page.setInputFiles('#pic-file', fixture('pic-hail.png'));
await page.waitForTimeout(500);
await page.locator('.slot[data-slot="chaplet:our-father"] .slot-pic-x').nth(1).click();
await page.waitForTimeout(400);
ok('taking the added one back out leaves the slot as it was', (await ofState()) === '預設'
   && await page.evaluate(() => !('chaplet:our-father' in JSON.parse(localStorage.getItem('mercy.settings.v1')).pictures)));

// ── 不用圖片：整塊收起來 ──
await page.locator('.slot[data-slot="chaplet:our-father"] button', { hasText: '不用' }).click();
await page.waitForTimeout(300);
await page.click('#view-settings [data-go="home"]');
await page.click('#start-btn');
await page.click('#step-next');                               // 天主經
await page.waitForTimeout(300);
ok('a slot set to no picture hides the picture area',
   await page.evaluate(() => document.querySelector('#guided .plate').hidden));
ok('and the beads and text move up into the space', (await top('#step-name')) < 200);

// ── 舊版的備份檔：一個位置一個字串 ──
await page.click('#prayer-exit');
await page.waitForSelector('#view-home.active');
await page.click('[data-go="settings"]');
const png = `data:image/png;base64,${readFileSync(fixture('pic-hail.png')).toString('base64')}`;
const oldBackup = { app: 'mercy-divine', version: 2, records: [],
                    pictures: { oldid1234: png }, pictureRoles: { 'chaplet:holy-god': 'oldid1234' } };
await page.setInputFiles('#import-file', { name: 'old.json', mimeType: 'application/json',
                                           buffer: Buffer.from(JSON.stringify(oldBackup)) });
await page.waitForTimeout(800);
const imported = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.settings.v1')).pictures['chaplet:holy-god']);
ok('an old backup with one picture per slot still imports', JSON.stringify(imported) === '["oldid1234"]');

console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'no console errors');
await browser.close();
process.exit(failures || errors.length ? 1 : 0);
