// 祈禱玫瑰窗：一個月一扇窗，一天一片花瓣，誦唸過的亮起來。
import { BASE, launch } from './helpers.mjs';
const ok = (l, p) => { console.log(`${p ? 'PASS' : 'FAIL ***'}  ${l}`); if (!p) failures++; };
let failures = 0;

const { browser, page, errors } = await launch();
await page.goto(BASE, { waitUntil: 'networkidle' });

await page.click('[data-go="history"]');
ok('an empty month says so plainly', (await page.textContent('#rose-read')).includes('還沒有紀錄'));
ok('the window is still drawn when nothing is recorded', await page.locator('.petal').count() > 27);

// 造出有疏有密的一個月
const seeded = await page.evaluate(() => {
  const now = new Date();
  const recs = [];
  const add = (day, n, note) => {
    for (let i = 0; i < n; i++) {
      recs.push({ id: `${day}-${i}`, ts: new Date(now.getFullYear(), now.getMonth(), day, 7 + i, 30).toISOString(),
                  mode: 'guided', secs: 400, note: i === 0 ? note : '' });
    }
  };
  add(1, 1, ''); add(2, 2, '為亡者'); add(3, 3, '為病人');
  localStorage.setItem('mercy.records.v1', JSON.stringify(recs));
  return { daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(), today: now.getDate() };
});
await page.reload({ waitUntil: 'networkidle' });
await page.click('[data-go="history"]');
await page.waitForTimeout(400);

ok('one petal for every day of the month', await page.locator('.petal').count() === seeded.daysInMonth);
ok('a day prayed once is lit at the first level', await page.locator('.petal.lit1').count() === 1);
ok('twice is a deeper level', await page.locator('.petal.lit2').count() === 1);
ok('three or more is the deepest', await page.locator('.petal.lit3').count() === 1);
ok('today is marked', await page.locator('.petal.today').count() === 1);

const future = await page.locator('.petal.future').count();
ok('days still to come are drawn, but set apart from missed ones',
   future === seeded.daysInMonth - seeded.today);
ok('a missed day that has passed is not treated as future',
   await page.locator('.petal.empty').count() === seeded.today - 3);

// 中心的總數
const centre = await page.textContent('.rose-count');
ok('the centre counts every prayer, not just the days', centre === '6');
ok('and names the number of days', (await page.textContent('.rose-label')) === '3 天');
ok('the summary line agrees', (await page.textContent('#rose-read')).includes('6 次') &&
   (await page.textContent('#rose-read')).includes('3 天'));

// 輕觸花瓣
await page.locator('.petal[data-day="3"]').click();
await page.waitForTimeout(150);
const read = await page.textContent('#rose-read');
ok('tapping a petal names the day and the count', read.includes('3 日') && read.includes('3 次'));
ok('and shows what it was offered for', read.includes('為病人'));

await page.locator('.petal[data-day="1"]').click();
await page.waitForTimeout(150);
ok('a day with no intention still reads cleanly',
   (await page.textContent('#rose-read')).includes('1 次'));

// 換月份
const label = await page.textContent('#cal-label');
await page.click('#cal-prev');
await page.waitForTimeout(250);
ok('the previous month draws its own window', (await page.textContent('#cal-label')) !== label);
ok('and it has no lit petals', await page.locator('.petal.lit1, .petal.lit2, .petal.lit3').count() === 0);
ok('a month wholly in the past has no future petals', await page.locator('.petal.future').count() === 0);
await page.click('#cal-next');
await page.waitForTimeout(250);
ok('coming back restores this month', (await page.textContent('#cal-label')) === label);
ok('and the lit petals return', await page.locator('.petal.lit1, .petal.lit2, .petal.lit3').count() === 3);

// 月曆仍在，只是收起來
ok('the calendar is tucked away by default', !(await page.isVisible('#cal')));
await page.click('#cal-toggle');
await page.waitForTimeout(200);
ok('the toggle brings the calendar back', await page.isVisible('#cal'));
ok('with the same days marked', await page.locator('.cal-day.marked').count() === 3);
ok('and the window steps aside', !(await page.isVisible('#rose')));
await page.click('#cal-toggle');
await page.waitForTimeout(200);
ok('and back again', await page.isVisible('#rose') && !(await page.isVisible('#cal')));

console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'no console errors');
await browser.close();
process.exit(failures || errors.length ? 1 : 0);
