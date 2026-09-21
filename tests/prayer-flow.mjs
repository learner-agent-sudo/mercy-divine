// 誦念流程：兩種模式、逐珠計數、完成後留下紀錄、行事曆與統計。
import { BASE, launch } from './helpers.mjs';
const ok = (l, p) => { console.log(`${p ? 'PASS' : 'FAIL ***'}  ${l}`); if (!p) failures++; };
let failures = 0;

const { browser, page, errors, autoDialog } = await launch();
await page.goto(BASE, { waitUntil: 'networkidle' });

ok('starts with nothing prayed today', (await page.textContent('#today-state')).includes('尚未'));

await page.click('#start-btn');
ok('opens on 天主經', await page.textContent('#step-name') === '天主經');

for (let i = 0; i < 3; i++) await page.click('#step-next');
ok('reaches the first 大珠', await page.textContent('#step-name') === '大珠');
ok('shows 1 large + 10 small beads', await page.locator('#beads .bead').count() === 11);
ok('names the decade', (await page.textContent('#step-count')).includes('共 5 端'));

for (let i = 0; i < 7; i++) await page.click('#step-next');
ok('counts to the 7th bead', (await page.textContent('#step-count')).includes('第 7 珠'));
ok('marks the current bead', await page.locator('#beads .bead.now').count() === 1);

const box = await page.locator('#step-text').boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
ok('tapping the text advances', (await page.textContent('#step-count')).includes('第 8 珠'));
await page.click('#step-prev');
ok('上一步 goes back', (await page.textContent('#step-count')).includes('第 7 珠'));

await page.click('#mode-toggle');
await page.waitForSelector('#full:not([hidden])');
ok('full text has 15 sections', await page.locator('.full-sec').count() === 15);
ok('full text marks 5 decades + a close', await page.locator('.full-divider').count() === 6);
ok('button becomes 我已誦畢', await page.textContent('#step-next') === '我已誦畢');

await page.click('#step-next');
await page.waitForSelector('#view-done.active');
await page.fill('#done-note', '為家人祈禱');
await page.click('#done-home');

ok('home reflects the prayer', (await page.textContent('#today-state')).includes('已誦念 1 次'));
const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.records.v1')));
ok('one record stored', rec.length === 1);
ok('record keeps the intention', rec[0].note === '為家人祈禱');
ok('record keeps a duration', rec[0].secs >= 1);

await page.click('[data-go="history"]');
ok('the rose lights one petal', await page.locator('.petal.outer.lit1').count() === 1);
ok('log lists the session', await page.locator('#log li').count() === 1);
ok('streak counts 1', (await page.textContent('#history-stats')).includes('1'));

// 中途離開必須先確認，避免誤觸而失去進度
await page.click('#view-history [data-go="home"]');
await page.click('#start-btn');
await page.click('#step-next');
let asked = null;
autoDialog(false);
page.once('dialog', (d) => { asked = d.message(); d.dismiss(); });
await page.click('#prayer-exit');
await page.waitForTimeout(300);
autoDialog(true);
ok('leaving mid-prayer asks first', asked !== null && asked.includes('尚未誦畢'));
ok('declining keeps you praying', await page.isVisible('#view-prayer.active'));
await page.click('#prayer-exit');   // 這次由 helper 自動接受
await page.waitForSelector('#view-home.active');
ok('accepting returns home without a record',
   (await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.records.v1')).length)) === 1);

// 每一步都要有經文
await page.click('#start-btn');
let empty = 0;
for (let i = 0; i < 64; i++) {
  if (!(await page.textContent('#step-text')).trim()) empty++;
  if (i < 63) await page.click('#step-next');
}
ok('all 64 steps carry text', empty === 0);

console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'no console errors');
await browser.close();
process.exit(failures || errors.length ? 1 : 0);
