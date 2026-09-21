// 祈禱之花：一個月一朵，唸一次亮一片，由最外層往內開。
import { BASE, launch } from './helpers.mjs';
const ok = (l, p) => { console.log(`${p ? 'PASS' : 'FAIL ***'}  ${l}`); if (!p) failures++; };
let failures = 0;

const { browser, page, errors } = await launch();
await page.goto(BASE, { waitUntil: 'networkidle' });

await page.click('[data-go="history"]');
ok('an empty month says so plainly', (await page.textContent('#rose-read')).includes('還沒有紀錄'));
ok('the flower is still drawn when nothing is recorded', await page.locator('.petal.chaplet').count() > 27);

// 造出有疏有密的一個月
const seeded = await page.evaluate(() => {
  const now = new Date();
  const recs = [];
  const add = (day, n, note, set, mystery) => {
    for (let i = 0; i < n; i++) {
      recs.push({ id: `${set || 'chaplet'}-${day}-${i}`,
                  ts: new Date(now.getFullYear(), now.getMonth(), day, 7 + i, 30).toISOString(),
                  mode: 'guided', secs: 400, note: i === 0 ? note : '',
                  set: set || 'chaplet', mystery: mystery || null });
    }
  };
  add(1, 1, ''); add(2, 2, '為亡者'); add(3, 3, '為病人');
  add(2, 1, '', 'rosary', 'joyful'); add(4, 2, '為教會', 'rosary', 'sorrowful');
  localStorage.setItem('mercy.records.v1', JSON.stringify(recs));
  return { daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(), today: now.getDate() };
});
await page.reload({ waitUntil: 'networkidle' });
await page.click('[data-go="history"]');
await page.waitForTimeout(400);

ok('a full flower is a month of daily prayer',
   await page.locator('.petal.chaplet').count() === seeded.daysInMonth);
ok('every prayer this month lights a petal', await page.locator('.petal.chaplet.lit1').count() === 6);
ok('and a month under one flower never lights a petal twice',
   await page.locator('.petal.chaplet.lit2, .petal.chaplet.lit3').count() === 0);

// 由外往內、一片接一片地點亮，中間不留空格
const lit = () => page.evaluate(() => [...document.querySelectorAll('.petal.chaplet')]
  .filter((el) => !el.classList.contains('empty'))
  .map((el) => Number(el.dataset.nth))
  .sort((a, b) => a - b));
ok('the lit petals are the first six, in order', (await lit()).join() === '1,2,3,4,5,6');
ok('petals prayed today are marked as such', await page.evaluate((today) =>
   [...document.querySelectorAll('.petal.today')].every((el) => el.dataset.day === String(today)),
   seeded.today));

// ── 花分五層 ──
const layers = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('.petal')) {
    const set = el.classList.contains('rosary') ? 'rosary' : 'chaplet';
    const tone = [...el.classList].find((c) => c.startsWith('tone'));
    const key = `${set}-${tone}`;
    const row = out.find((r) => r.key === key) || (out.push({ key, n: 0, nths: [] }), out.at(-1));
    row.n++;
    row.nths.push(Number(el.dataset.nth));
  }
  return out;
});
ok('the flower has five layers', layers.length === 5);
ok('three of them belong to the chaplet, two to the rosary',
   layers.filter((r) => r.key.startsWith('chaplet')).length === 3
   && layers.filter((r) => r.key.startsWith('rosary')).length === 2);
ok('the chaplet layers hold about ten petals each',
   layers.filter((r) => r.key.startsWith('chaplet')).every((r) => r.n >= 10 && r.n <= 11));
ok('and no layer of a prayer is more than one petal bigger than its neighbours',
   ['chaplet', 'rosary'].every((set) => {
     const sizes = layers.filter((r) => r.key.startsWith(set)).map((r) => r.n);
     return Math.max(...sizes) - Math.min(...sizes) <= 1;
   }));
ok('each layer takes a run of the count, outermost first', layers.every((r) => {
  const sorted = [...r.nths].sort((a, b) => a - b);
  return sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
}));
ok('the outermost layer is the one that fills first', ['chaplet', 'rosary'].every((set) =>
   layers.find((r) => r.key === `${set}-tone1`).nths.includes(1)));
ok('the layers together number the whole flower once per prayer', ['chaplet', 'rosary'].every((set) => {
  const nths = layers.filter((r) => r.key.startsWith(set)).flatMap((r) => r.nths).sort((a, b) => a - b);
  return nths.length === seeded.daysInMonth && nths[0] === 1 && nths.at(-1) === seeded.daysInMonth;
}));

// 中心的總數
const centre = await page.textContent('.rose-count');
ok('the centre counts both prayers together', centre === '9');
ok('and names the number of days either was prayed', (await page.textContent('.rose-label')) === '4 天');
const summary = await page.textContent('#rose-read');
ok('the summary separates the two prayers',
   summary.includes('慈悲串經 6 次') && summary.includes('玫瑰經 3 次') && summary.includes('4 天'));

// ── 內層＝玫瑰經 ──
ok('the rosary has a flower of its own size', await page.locator('.petal.rosary').count() === seeded.daysInMonth);
ok('each rosary lights one of its petals', await page.locator('.petal.rosary.lit1').count() === 3);
ok('the two prayers are counted apart', await page.evaluate(() =>
   document.querySelector('.petal.rosary[data-nth="4"]').classList.contains('empty')));

await page.locator('.petal.rosary[data-nth="2"]').click();
await page.waitForTimeout(150);
const stamenRead = await page.textContent('#rose-read');
ok('tapping an inner petal names the rosary and its mysteries',
   stamenRead.includes('玫瑰經') && stamenRead.includes('痛苦五端') && stamenRead.includes('為教會'));
ok('and does not repeat identical entries',
   (stamenRead.match(/痛苦五端/g) || []).length === 1);

// 輕觸花瓣
await page.locator('.petal.chaplet[data-nth="4"]').click();
await page.waitForTimeout(150);
const read = await page.textContent('#rose-read');
ok('tapping a petal names the day it was prayed', read.includes('3 日') && read.includes('第 4 次'));
ok('and shows what it was offered for', read.includes('為病人'));

await page.locator('.petal.chaplet[data-nth="2"]').click();
await page.waitForTimeout(150);
ok('tapping marks that whole day, in both prayers, wherever the petals sit',
   await page.evaluate(() => {
     const picked = [...document.querySelectorAll('.petal.picked')];
     return picked.length === 3 && picked.every((el) => el.dataset.day === '2')
       && new Set(picked.map((el) => el.dataset.set)).size === 2;
   }));

await page.locator('.petal.chaplet[data-nth="1"]').click();
await page.waitForTimeout(150);
ok('a day with no intention still reads cleanly',
   (await page.textContent('#rose-read')).includes('第 1 次'));

await page.locator('.petal.chaplet[data-nth="20"]').click();
await page.waitForTimeout(150);
ok('a petal not yet reached says so', (await page.textContent('#rose-read')).includes('還沒唸到'));

// 換月份
const label = await page.textContent('#cal-label');
await page.click('#cal-prev');
await page.waitForTimeout(250);
ok('the previous month draws its own window', (await page.textContent('#cal-label')) !== label);
ok('and it has nothing lit in either prayer',
   await page.locator('.petal.lit1, .petal.lit2, .petal.lit3').count() === 0);
await page.click('#cal-next');
await page.waitForTimeout(250);
ok('coming back restores this month', (await page.textContent('#cal-label')) === label);
ok('and the lit petals return', await page.locator('.petal.chaplet.lit1, .petal.chaplet.lit2, .petal.chaplet.lit3').count() === 6);

// 月曆仍在，只是收起來
ok('the calendar is tucked away by default', !(await page.isVisible('#cal')));
await page.click('#cal-toggle');
await page.waitForTimeout(200);
ok('the toggle brings the calendar back', await page.isVisible('#cal'));
ok('with the same days marked', await page.locator('.cal-day.marked').count() === 4);
ok('and the window steps aside', !(await page.isVisible('#rose')));
await page.click('#cal-toggle');
await page.waitForTimeout(200);
ok('and back again', await page.isVisible('#rose') && !(await page.isVisible('#cal')));

// ── 唸得比一層多、比一朵多 ──
const reseed = async (n) => {
  await page.evaluate((count) => {
    const now = new Date();
    const recs = [];
    for (let i = 0; i < count; i++) {
      recs.push({ id: `c${i}`, ts: new Date(now.getFullYear(), now.getMonth(), 1, 0, i).toISOString(),
                  mode: 'guided', secs: 400, note: '', set: 'chaplet', mystery: null });
    }
    localStorage.setItem('mercy.records.v1', JSON.stringify(recs));
  }, n);
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('[data-go="history"]');
  await page.waitForTimeout(400);
};

const outer = layers.find((r) => r.key === 'chaplet-tone1').n;
await reseed(outer + 2);
ok('filling the outer layer spills into the next one in',
   await page.locator('.petal.chaplet.tone1.lit1').count() === outer
   && await page.locator('.petal.chaplet.tone2.lit1').count() === 2);
ok('and the layer further in is untouched',
   await page.locator('.petal.chaplet.tone3.lit1').count() === 0);

await reseed(seeded.daysInMonth + 2);
ok('praying past a whole flower deepens it rather than running out',
   await page.locator('.petal.chaplet.lit2').count() === 2
   && await page.locator('.petal.chaplet.lit1').count() === seeded.daysInMonth - 2);
ok('the deepened petals are the ones it came back round to', await page.evaluate(() =>
   [...document.querySelectorAll('.petal.chaplet.lit2')]
     .map((el) => Number(el.dataset.nth)).sort((a, b) => a - b).join() === '1,2'));

await reseed(seeded.daysInMonth * 3);
ok('three times round is as deep as a petal goes',
   await page.locator('.petal.chaplet.lit3').count() === seeded.daysInMonth);

console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'no console errors');
await browser.close();
process.exit(failures || errors.length ? 1 : 0);
