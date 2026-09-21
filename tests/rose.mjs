// 祈禱玫瑰窗：一個月一扇窗，一天一片花瓣，誦唸過的亮起來。
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

ok('one petal for every day of the month', await page.locator('.petal.chaplet').count() === seeded.daysInMonth);
ok('a day prayed once is lit at the first level', await page.locator('.petal.chaplet.lit1').count() === 1);
ok('twice is a deeper level', await page.locator('.petal.chaplet.lit2').count() === 1);
ok('three or more is the deepest', await page.locator('.petal.chaplet.lit3').count() === 1);
ok('today is marked in both rings', await page.locator('.petal.today').count() === 2);

// ── 花分五層 ──
const layers = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('.petal')) {
    const set = el.classList.contains('rosary') ? 'rosary' : 'chaplet';
    const tone = [...el.classList].find((c) => c.startsWith('tone'));
    const key = `${set}-${tone}`;
    const row = out.find((r) => r.key === key) || (out.push({ key, n: 0, days: [] }), out.at(-1));
    row.n++;
    row.days.push(Number(el.dataset.day));
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
ok('each layer takes a run of days, outermost first', layers.every((r) => {
  const sorted = [...r.days].sort((a, b) => a - b);
  return sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
}));
ok('the layers together cover the month once per prayer', ['chaplet', 'rosary'].every((set) => {
  const days = layers.filter((r) => r.key.startsWith(set)).flatMap((r) => r.days).sort((a, b) => a - b);
  return days.length === seeded.daysInMonth && days[0] === 1 && days.at(-1) === seeded.daysInMonth;
}));

const future = await page.locator('.petal.future').count();
ok('days still to come are drawn, but set apart from missed ones',
   future === (seeded.daysInMonth - seeded.today) * 2);
ok('a missed day that has passed is not treated as future',
   await page.locator('.petal.chaplet.empty').count() === seeded.today - 3);

// 中心的總數
const centre = await page.textContent('.rose-count');
ok('the centre counts both prayers together', centre === '9');
ok('and names the number of days either was prayed', (await page.textContent('.rose-label')) === '4 天');
const summary = await page.textContent('#rose-read');
ok('the summary separates the two prayers',
   summary.includes('慈悲串經 6 次') && summary.includes('玫瑰經 3 次') && summary.includes('4 天'));

// ── 內圈花蕊＝玫瑰經 ──
ok('an inner petal for every day as well', await page.locator('.petal.rosary').count() === seeded.daysInMonth);
ok('rosary days light the inner ring', await page.locator('.petal.rosary.lit1, .petal.rosary.lit2').count() === 2);
ok('the two prayers are counted apart', await page.locator('.petal.chaplet.lit3').count() === 1
   && await page.locator('.petal.rosary.lit3').count() === 0);
ok('a day with both lights the outer and inner ring', await page.evaluate(() =>
   document.querySelector('.petal.chaplet[data-day="2"]').classList.contains('lit2')
   && document.querySelector('.petal.rosary[data-day="2"]').classList.contains('lit1')));
ok('a rosary-only day leaves its outer petal unlit', await page.evaluate(() =>
   document.querySelector('.petal.chaplet[data-day="4"]').classList.contains('empty')
   && document.querySelector('.petal.rosary[data-day="4"]').classList.contains('lit2')));

await page.locator('.petal.rosary[data-day="4"]').click();
await page.waitForTimeout(150);
const stamenRead = await page.textContent('#rose-read');
ok('tapping an inner petal names the rosary and its mysteries',
   stamenRead.includes('玫瑰經') && stamenRead.includes('痛苦五端') && stamenRead.includes('為教會'));
ok('and does not repeat identical entries',
   (stamenRead.match(/痛苦五端/g) || []).length === 1);

// 輕觸花瓣
await page.locator('.petal.chaplet[data-day="3"]').click();
await page.waitForTimeout(150);
const read = await page.textContent('#rose-read');
ok('tapping a petal names the day and the count', read.includes('3 日') && read.includes('3 次'));
ok('and shows what it was offered for', read.includes('為病人'));
ok('tapping marks that day in both layers, wherever they sit',
   await page.evaluate(() => {
     const picked = [...document.querySelectorAll('.petal.picked')];
     return picked.length === 2 && picked.every((el) => el.dataset.day === '3')
       && new Set(picked.map((el) => el.dataset.set)).size === 2;
   }));

await page.locator('.petal.chaplet[data-day="1"]').click();
await page.waitForTimeout(150);
ok('a day with no intention still reads cleanly',
   (await page.textContent('#rose-read')).includes('1 次'));

// 換月份
const label = await page.textContent('#cal-label');
await page.click('#cal-prev');
await page.waitForTimeout(250);
ok('the previous month draws its own window', (await page.textContent('#cal-label')) !== label);
ok('and it has nothing lit in either ring',
   await page.locator('.petal.lit1, .petal.lit2, .petal.lit3').count() === 0);
ok('a month wholly in the past has no future petals', await page.locator('.petal.future').count() === 0);
await page.click('#cal-next');
await page.waitForTimeout(250);
ok('coming back restores this month', (await page.textContent('#cal-label')) === label);
ok('and the lit petals return', await page.locator('.petal.chaplet.lit1, .petal.chaplet.lit2, .petal.chaplet.lit3').count() === 3);

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

console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'no console errors');
await browser.close();
process.exit(failures || errors.length ? 1 : 0);
