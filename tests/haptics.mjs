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
const tappedOn = (n) => seen.find((s) => s.at.includes('第一端') && s.at.includes(`第 ${n} 珠`));
const ordinary = tappedOn(1).buzz;

ok('an ordinary bead gives one short pulse', ordinary === '[25]');
ok('beads one to eight all feel the same',
   [1, 2, 3, 4, 5, 6, 7, 8].every((n) => tappedOn(n).buzz === ordinary));
ok('leaving the ninth warns that the tenth is next',
   tappedOn(9).buzz !== ordinary && JSON.parse(tappedOn(9).buzz)[0] > 25);
ok('that warning is a single pulse, not a pattern', JSON.parse(tappedOn(9).buzz).length === 1);

// 唸完第十珠 = 一端圓滿
const decadeEnd = tappedOn(10).buzz;
ok('finishing the tenth buzzes a multi-pulse pattern', JSON.parse(decadeEnd).length === 5);
ok('a decade ending is unmistakable against both bead signals',
   decadeEnd !== ordinary && decadeEnd !== tappedOn(9).buzz);

const ends = seen.filter((s) => /第 10 珠/.test(s.at));
ok('all five decades end identically', ends.length === 5 && ends.every((s) => s.buzz === decadeEnd));

// 三遍的兩段結束禱詞
const closing = seen.filter((s) => s.at.includes('結束') && /共 3 遍/.test(s.at));
ok('both three-times prayers are counted', closing.length === 6);
ok('each repetition buzzes like a bead',
   closing.slice(0, 5).every((s) => s.buzz === ordinary));

const finish = seen[seen.length - 1].buzz;
ok('the very end is the longest signal of all',
   JSON.parse(finish).length === 5 && JSON.parse(finish)[4] > 100 && finish !== decadeEnd);

// 開頭經文與珠子要能分辨
const opening = seen.find((s) => s.at.includes('開始|天主經')).buzz;
ok('the opening prayers differ from beads', opening !== ordinary);

const distinct = new Set([opening, ordinary, tappedOn(9).buzz, decadeEnd, finish]);
ok('five distinguishable signals in total', distinct.size === 5);
console.log('        ' + [...distinct].join('  '));

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

console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'no console errors');
await browser.close();
process.exit(failures || errors.length ? 1 : 0);
