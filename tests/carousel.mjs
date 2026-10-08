// 一段經文放好幾張聖像時，下一段從下一張接著輪，不是每段都從第一張重來。
import { BASE, launch, openSlotGroup } from './helpers.mjs';
const ok = (l, p) => { console.log(`${p ? 'PASS' : 'FAIL ***'}  ${l}`); if (!p) failures++; };
let failures = 0;

const { browser, page, errors } = await launch();
await page.goto(BASE, { waitUntil: 'networkidle' });

// 用畫布做幾張顏色不同的圖，才不會被當成同一張而去重
const paint = async (color) => ({ name: `${color.slice(1)}.png`, mimeType: 'image/png', buffer: Buffer.from(await page.evaluate((c) => {
  const cv = document.createElement('canvas');
  cv.width = 300; cv.height = 400;
  const x = cv.getContext('2d');
  x.fillStyle = c; x.fillRect(0, 0, 300, 400);
  return cv.toDataURL('image/png').split(',')[1];
}, color), 'base64') });

const add = async (slot, colors) => {
  await openSlotGroup(page, slot);
  await page.locator(`.slot[data-slot="${slot}"] button`, { hasText: '加圖' }).click();
  await page.setInputFiles('#pic-file', await Promise.all(colors.map(paint)));
  await page.waitForTimeout(900);
};

await page.click('[data-go="settings"]');
await add('chaplet:passion', ['#7a3b3b', '#3b7a4a', '#3b4a7a', '#7a6a3b']);
ok('the 小珠 slot holds five pictures',
   (await page.textContent('.slot[data-slot="chaplet:passion"] .slot-state')).includes('5 張'));
await add('chaplet:sign', ['#552255', '#225555']);
ok('the 聖號經 slot holds two',
   (await page.textContent('.slot[data-slot="chaplet:sign"] .slot-state')).includes('2 張'));
await page.click('#view-settings [data-go="home"]');

const shown = () => page.evaluate(() => {
  const car = document.querySelector('#guided .car');
  return Math.round(car.scrollLeft / car.clientWidth);
});
const marked = () => page.locator('#guided .car-dots button').evaluateAll(
  (bs) => bs.findIndex((b) => b.getAttribute('aria-current') === 'true'));
const next = async () => { await page.click('#step-next'); await page.waitForTimeout(250); };

await page.click('#start-btn');
await page.waitForTimeout(400);
ok('the first time, the pictures start on the first one', (await shown()) === 0);
for (let i = 0; i < 5; i++) await next();                     // 天主經、聖母經、信經、大珠，到第一顆小珠
ok('on the first 小珠', (await page.textContent('#step-name')) === '小珠'
   && (await page.textContent('#step-count')).startsWith('第 1 珠'));
ok('which starts on its first picture', (await shown()) === 0 && (await marked()) === 0);

const seq = [await shown()];
for (let i = 0; i < 5; i++) { await next(); seq.push(await shown()); }
ok(`each new bead moves on to the next picture (${seq.join(' ')})`, seq.join(' ') === '0 1 2 3 4 0');
ok('the dots follow', (await marked()) === 0);

// 自己翻到第四張再唸下一顆，從第五張接著
await page.locator('#guided .car-dots button').nth(3).click();
await page.waitForTimeout(700);
await next();
ok('after picking a picture by hand, the next bead carries on from there', (await shown()) === 4);

// 停在一顆珠上，圖照樣每六秒換一張；下一顆再接下去
await page.waitForTimeout(6600);
ok('left alone on one bead, the pictures still take turns', (await shown()) === 0);
await next();
ok('and the next bead picks up after that', (await shown()) === 1);

// 換到單張的經文、再回來，不會打亂
await page.click('#step-prev');
await page.waitForTimeout(250);
ok('going back a bead also shows a fresh picture', (await shown()) === 2);

// 重新開始一次：第一步在畫面切過來之前就畫好了，也要翻到下一張
await page.click('#prayer-exit');
await page.waitForSelector('#view-home.active');
await page.click('#start-btn');
await page.waitForTimeout(600);
ok('praying again, the opening picture carries on from last time', (await shown()) === 1 && (await marked()) === 1);
for (let i = 0; i < 5; i++) await next();
ok('and so does the first 小珠', (await shown()) === 3);

ok('no errors', errors.length === 0);
if (errors.length) console.log(errors.join('\n'));
await browser.close();
process.exit(failures ? 1 : 0);
