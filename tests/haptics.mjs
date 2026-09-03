// 震動報數：閉眼誦念時全靠這些節奏分辨數到哪裡，每一種都必須不同。
import { BASE, launch } from './helpers.mjs';
const ok = (l, p) => { console.log(`${p ? 'PASS' : 'FAIL ***'}  ${l}`); if (!p) failures++; };
let failures = 0;

const { browser, page, errors } = await launch();
// 桌面瀏覽器沒有震動，攔下來記錄實際送出的節奏
await page.addInitScript(() => {
  window.__buzz = [];
  navigator.vibrate = (p) => { window.__buzz.push(Array.isArray(p) ? p : [p]); return true; };
});
await page.goto(BASE, { waitUntil: 'networkidle' });

const last = () => page.evaluate(() => window.__buzz[window.__buzz.length - 1]);
const clear = () => page.evaluate(() => { window.__buzz = []; });
const where = async () => `${await page.textContent('#prayer-stage')}|${await page.textContent('#step-name')}|${await page.textContent('#step-count')}`;

await page.click('#start-btn');
ok('haptics are on by default', await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.settings.v1') || '{}').haptic !== false));

// 走完整串經，記錄每一步的節奏
const seen = [];
for (let i = 0; i < 64; i++) {
  const at = await where();
  await clear();
  await page.click('#step-next');
  await page.waitForTimeout(30);
  seen.push({ at, buzz: JSON.stringify(await last()) });
}

// 每一次觸碰的震動，說的是「接下來這一步」，所以要看觸碰時人在哪一珠。
// 手機不能調震動輕重，只能調長度與下數，而人分辨「幾下」遠比分辨「多長」容易，
// 因此這裡驗證的是下數與最短長度，而非確切毫秒。
const pulses = (json) => Math.ceil(JSON.parse(json).length / 2);
const segments = (json) => JSON.parse(json).filter((_, i) => i % 2 === 0);

const tappedOn = (n) => seen.find((s) => s.at.includes('第一端') && s.at.includes(`第 ${n} 珠`));
const ordinary = tappedOn(1).buzz;

ok('an ordinary bead is a single pulse', pulses(ordinary) === 1);
ok('beads one to eight all feel the same',
   [1, 2, 3, 4, 5, 6, 7, 8].every((n) => tappedOn(n).buzz === ordinary));
ok('leaving the ninth gives two pulses, not one', pulses(tappedOn(9).buzz) === 2);

const decadeEnd = tappedOn(10).buzz;
ok('finishing the tenth gives three pulses', pulses(decadeEnd) === 3);
const ends = seen.filter((s) => /第 10 珠/.test(s.at));
ok('all five decades end identically', ends.length === 5 && ends.every((s) => s.buzz === decadeEnd));

const closing = seen.filter((s) => s.at.includes('結束') && /共 3 遍/.test(s.at));
ok('both three-times prayers are counted', closing.length === 6);
ok('each repetition feels like a bead', closing.slice(0, 5).every((s) => s.buzz === ordinary));

const finish = seen[seen.length - 1].buzz;
ok('the very end gives four pulses, the most of any signal', pulses(finish) === 4);

const opening = seen.find((s) => s.at.includes('開始|天主經')).buzz;
const all = [opening, ordinary, tappedOn(9).buzz, decadeEnd, finish];
ok('five distinguishable signals in total', new Set(all).size === 5);
ok('their pulse counts rise with significance',
   JSON.stringify(all.map(pulses)) === JSON.stringify([1, 1, 2, 3, 4]));

// 太短的震動手機根本不會動——這正是先前感覺不到的原因
const shortest = Math.min(...all.flatMap(segments));
ok(`every pulse is long enough to be felt (shortest ${shortest}ms)`, shortest >= 35);
console.log('        ' + [...new Set(all)].join('  '));

// 結束禱詞也要看得到珠數
await page.click('#done-home');
await page.click('#start-btn');
for (let i = 0; i < 58; i++) await page.click('#step-next');
const at58 = await where();
ok(`closing prayer shows its own beads (${at58.split('|')[1]})`, await page.locator('#beads .bead').count() === 3);
ok('and marks which repetition you are on', await page.locator('#beads .bead.now').count() === 1);
ok('and counts them in words', /第 \d 遍，共 3 遍/.test(await page.textContent('#step-count')));

// 一端唸畢的畫面提示
await page.click('#prayer-exit');
await page.click('#start-btn');
for (let i = 0; i < 13; i++) await page.click('#step-next');   // 第一端第十珠
await page.click('#step-next');                                 // 唸畢，進入第二端
await page.waitForTimeout(120);
ok('a decade ending also shows on screen', await page.isVisible('#flash'));
ok('and names the decade that just finished', (await page.textContent('#flash')).includes('第一端'));

// 強度只放大震動段，停頓不動，節奏才不會走樣
await page.click('#prayer-exit');
await page.click('[data-go="settings"]');
const measure = async (level) => {
  await page.selectOption('#set-haptic-strength', level);
  await page.waitForTimeout(120);
  return page.evaluate(() => window.__buzz[window.__buzz.length - 1]);
};
const soft = await measure('soft');
const normal = await measure('normal');
const strong = await measure('strong');
ok('強 vibrates longer than 中, and 中 longer than 輕', strong[0] > normal[0] && normal[0] > soft[0]);
console.log(`        輕 ${soft[0]}ms · 中 ${normal[0]}ms · 強 ${strong[0]}ms`);

await page.evaluate(() => { window.__buzz = []; });
await page.click('#test-haptic');
await page.waitForTimeout(150);
const demo = await page.evaluate(() => window.__buzz[window.__buzz.length - 1]);
ok('the test button plays a demonstration', Array.isArray(demo) && demo.length > 6);

console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'no console errors');
await browser.close();
process.exit(failures || errors.length ? 1 : 0);
