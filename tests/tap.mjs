// 觸碰判定：唸經時手指常會停留或稍微滑動，這些都要算成一珠；
// 真正的捲動與拖曳則不能算。
import { BASE, launch } from './helpers.mjs';
const ok = (l, p) => { console.log(`${p ? 'PASS' : 'FAIL ***'}  ${l}`); if (!p) failures++; };
let failures = 0;

const { browser, page, errors } = await launch({ hasTouch: true });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.click('#start-btn');

// 進度條是百分比，四捨五入後不等於步數；直接讀「第 N 珠」才精確。
const beadNo = async () => {
  const m = (await page.textContent('#step-count')).match(/第\s*(\d+)\s*珠/);
  return m ? Number(m[1]) : NaN;
};

// 走到第一端小珠，數字最清楚
for (let i = 0; i < 4; i++) await page.click('#step-next');
const target = await page.locator('#step-text').boundingBox();
const cx = target.x + target.width / 2, cy = target.y + target.height / 2;

const at = async (fn) => {
  const before = await beadNo();
  await fn();
  await page.waitForTimeout(250);
  return (await beadNo()) - before;
};

// 手指按住 1.2 秒才放開——舊版用 500ms 上限，這種會漏數
ok('a slow press still counts', 1 === await at(async () => {
  await page.mouse.move(cx, cy); await page.mouse.down();
  await page.waitForTimeout(1200); await page.mouse.up();
}));

// 手指微微滑動
ok('a tap with a little wobble counts', 1 === await at(async () => {
  await page.mouse.move(cx, cy); await page.mouse.down();
  await page.mouse.move(cx + 8, cy + 6); await page.mouse.up();
}));

// 明顯拖曳不算
ok('a drag does not count', 0 === await at(async () => {
  await page.mouse.move(cx, cy); await page.mouse.down();
  await page.mouse.move(cx + 90, cy, { steps: 8 }); await page.mouse.up();
}));

// 一次觸碰只能前進一步
ok('one tap advances exactly one bead', 1 === await at(async () => {
  await page.touchscreen.tap(cx, cy);
}));

// 經文以外的空白處也要能觸碰
const scroll = await page.locator('#prayer-scroll').boundingBox();
ok('tapping the blank area also counts', 1 === await at(async () => {
  await page.touchscreen.tap(scroll.x + 12, scroll.y + scroll.height - 24);
}));

// 捲動長經文時不能誤數
await page.click('#prayer-exit');
await page.click('[data-go="settings"]');
await page.locator('#set-font').fill('180');
await page.click('#view-settings [data-go="home"]');
await page.click('#start-btn');
await page.click('#step-next'); await page.click('#step-next');   // 信經，最長的一段
const scrollable = await page.evaluate(() => {
  const s = document.querySelector('#prayer-scroll');
  return s.scrollHeight > s.clientHeight + 20;
});
ok('the long 信經 actually scrolls at large type', scrollable);

// 底下還有沒讀到的經文時，要看得出來，才不會以為讀完了就輕觸過去
await page.waitForTimeout(200);
ok('a cut-off prayer says so at the foot of the screen',
   await page.evaluate(() => document.querySelector('#view-prayer').classList.contains('more')));
await page.evaluate(() => { const s = document.querySelector('#prayer-scroll'); s.scrollTop = s.scrollHeight; });
await page.waitForTimeout(250);
ok('and stops saying so once it is read to the end',
   !(await page.evaluate(() => document.querySelector('#view-prayer').classList.contains('more'))));
await page.evaluate(() => { document.querySelector('#prayer-scroll').scrollTop = 0; });
await page.waitForTimeout(250);

// 信經沒有珠數可讀，改看是否仍停在同一段經文
const b = await page.locator('#prayer-scroll').boundingBox();

// 情況一：手指明顯滑動
let wherePre = await page.textContent('#step-name');
await page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.7);
await page.mouse.down();
await page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.25, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(250);
ok('a swipe over the long text does not advance', (await page.textContent('#step-name')) === wherePre);

// 情況二：手指幾乎沒動，但畫面在慣性捲動——只靠位移判斷會誤數
wherePre = await page.textContent('#step-name');
await page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.6);
await page.mouse.down();
await page.evaluate(() => { document.querySelector('#prayer-scroll').scrollTop += 120; });
await page.waitForTimeout(60);
await page.mouse.move(b.x + b.width / 2 + 2, b.y + b.height * 0.6 + 2);
await page.mouse.up();
await page.waitForTimeout(250);
ok('a still finger during momentum scroll does not advance',
   (await page.textContent('#step-name')) === wherePre);
ok('the container really was scrolled',
   await page.evaluate(() => document.querySelector('#prayer-scroll').scrollTop > 0));

// 引導模式不應該選得到字（長按會反白或叫出選單，那一觸就沒了）
ok('prayer text cannot be selected in guided mode', await page.evaluate(
  () => getComputedStyle(document.querySelector('#guided')).userSelect === 'none'));
ok('double-tap zoom is disabled on the reading area', await page.evaluate(
  () => getComputedStyle(document.querySelector('#prayer-scroll')).touchAction === 'manipulation'));

console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'no console errors');
await browser.close();
process.exit(failures || errors.length ? 1 : 0);
