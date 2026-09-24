// 祈禱花束：一個月一束，唸一次開一朵。慈悲串經是白花，玫瑰經是紅玫瑰。
import { BASE, launch } from './helpers.mjs';
const ok = (l, p) => { console.log(`${p ? 'PASS' : 'FAIL ***'}  ${l}`); if (!p) failures++; };
let failures = 0;

const { browser, page, errors } = await launch();
await page.goto(BASE, { waitUntil: 'networkidle' });

// 只數花束本身的花，不數輕觸後浮上來的那幾朵複本
const FLOWERS = '#rose .bouquet > g:not(.bq-lifted) .flower';

await page.click('[data-go="history"]');
ok('an empty month says so plainly', (await page.textContent('#rose-read')).includes('還沒有紀錄'));
ok('an empty month still draws the wrapping, waiting for flowers',
   await page.locator('#rose .bq-front').count() === 1 && await page.locator(FLOWERS).count() === 0);

// 造出有疏有密的一個月
await page.evaluate(() => {
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
});
await page.reload({ waitUntil: 'networkidle' });
await page.click('[data-go="history"]');
await page.waitForTimeout(400);

// ── 一次一朵 ──
ok('every prayer this month is a flower', await page.locator(FLOWERS).count() === 9);
ok('the chaplet flowers are the white ones', await page.locator(`${FLOWERS}.chaplet`).count() === 6);
ok('the rosary flowers are the roses', await page.locator(`${FLOWERS}.rosary`).count() === 3);

const drawn = await page.evaluate((sel) => [...document.querySelectorAll(sel)].map((el) => ({
  set: el.dataset.set, nth: Number(el.dataset.nth), day: Number(el.dataset.day),
  petals: el.querySelectorAll('path').length,
})), FLOWERS);
ok('the two flowers are drawn differently, not just recoloured',
   new Set(drawn.filter((f) => f.set === 'rosary').map((f) => f.petals)).size === 1
   && drawn.find((f) => f.set === 'rosary').petals > drawn.find((f) => f.set === 'chaplet').petals);
ok('each prayer is numbered within its own prayer',
   drawn.filter((f) => f.set === 'chaplet').map((f) => f.nth).sort((a, b) => a - b).join() === '1,2,3,4,5,6'
   && drawn.filter((f) => f.set === 'rosary').map((f) => f.nth).sort((a, b) => a - b).join() === '1,2,3');
ok('and knows which day it was prayed on',
   drawn.filter((f) => f.set === 'chaplet' && f.day === 3).length === 3);

// 第一次在正中，之後往外長
const spread = await page.evaluate((sel) => {
  const box = (el) => { const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const all = [...document.querySelectorAll(sel)];
  const first = all.find((el) => el.dataset.set === 'chaplet' && el.dataset.nth === '1');
  const c = { x: 0, y: 0 };
  for (const el of all) { const p = box(el); c.x += p.x / all.length; c.y += p.y / all.length; }
  const d = (el) => { const p = box(el); return Math.hypot(p.x - c.x, p.y - c.y); };
  return { first: d(first), median: all.map(d).sort((a, b) => a - b)[Math.floor(all.length / 2)] };
}, FLOWERS);
ok('the month\'s first prayer sits at the heart of the bouquet', spread.first < spread.median);

// ── 花束下面那一行 ──
const legend = await page.textContent('#bq-legend');
ok('the legend counts each prayer', legend.includes('慈悲串經 6') && legend.includes('玫瑰經 3'));
ok('and the days either was prayed', legend.includes('4 天'));
ok('each count carries a picture of its flower',
   await page.locator('#bq-legend .bq-key[data-set="chaplet"] svg').count() === 1
   && await page.locator('#bq-legend .bq-key[data-set="rosary"] svg').count() === 1);
ok('the line below invites a tap', (await page.textContent('#rose-read')).includes('輕觸一朵花'));

// ── 輕觸 ──
const tapFlower = async (sel) => {
  const b = await page.locator(sel).first().boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(200);
};
await tapFlower(`${FLOWERS}.rosary[data-nth="2"]`);
const stamenRead = await page.textContent('#rose-read');
ok('tapping a rose names the rosary, the day and its mysteries',
   stamenRead.includes('玫瑰經') && stamenRead.includes('4 日') && stamenRead.includes('痛苦五端')
   && stamenRead.includes('為教會'));
ok('and says how many were prayed that day', stamenRead.includes('當天共 2 朵'));

await tapFlower(`${FLOWERS}.chaplet[data-nth="4"]`);
const read = await page.textContent('#rose-read');
ok('tapping a white flower names the chaplet and which one it was',
   read.includes('3 日') && read.includes('慈悲串經第 4 次'));
ok('and what it was offered for', read.includes('為病人'));
ok('that day\'s flowers are lifted above a veil', await page.evaluate(() => {
  const lifted = [...document.querySelectorAll('#rose .bq-lifted .flower')];
  return !!document.querySelector('#rose .bq-veil') && lifted.length === 3
    && lifted.every((el) => el.dataset.day === '3');
}));

await tapFlower(`${FLOWERS}.chaplet[data-nth="2"]`);
ok('a day with both prayers lifts both kinds of flower', await page.evaluate(() => {
  const lifted = [...document.querySelectorAll('#rose .bq-lifted .flower')];
  return lifted.length === 3 && new Set(lifted.map((el) => el.dataset.set)).size === 2
    && lifted.every((el) => el.dataset.day === '2');
}));
ok('picking another day replaces the last one, not stacks on it',
   await page.locator('#rose .bq-veil').count() === 1 && await page.locator('#rose .bq-lifted').count() === 1);

await tapFlower(`${FLOWERS}.chaplet[data-nth="1"]`);
ok('a day with no intention still reads cleanly', await page.evaluate(() => {
  const t = document.querySelector('#rose-read').textContent;
  return t.includes('第 1 次') && !t.includes('—');
}));

// 點到花束外面：放下
const svgBox = await page.locator('#rose .bouquet').boundingBox();
await page.mouse.click(svgBox.x + 6, svgBox.y + 6);
await page.waitForTimeout(200);
ok('tapping away from the flowers lets the day go', await page.evaluate(() =>
   !document.querySelector('#rose .bq-veil') && !document.querySelector('#rose .bq-lifted')));
ok('and the invitation returns', (await page.textContent('#rose-read')).includes('輕觸一朵花'));

// ── 花越多，每朵越小，但整束都在畫面裡 ──
const sizeOf = () => page.evaluate((sel) => {
  const all = [...document.querySelectorAll(sel)];
  const svg = document.querySelector('#rose .bouquet').getBoundingClientRect();
  const w = all.map((el) => el.getBoundingClientRect().width);
  const inside = all.every((el) => {
    const b = el.getBoundingClientRect();
    return b.left >= svg.left - 2 && b.right <= svg.right + 2 && b.top >= svg.top - 2;
  });
  return { avg: w.reduce((a, b) => a + b, 0) / w.length, inside, n: all.length };
}, FLOWERS);
const few = await sizeOf();
await page.evaluate(() => {
  const now = new Date();
  const recs = [];
  for (let i = 0; i < 62; i++) {
    recs.push({ id: `m${i}`, ts: new Date(now.getFullYear(), now.getMonth(), 1 + (i % 28), 6 + Math.floor(i / 28), i).toISOString(),
                mode: 'guided', secs: 400, note: '', set: i % 3 ? 'chaplet' : 'rosary', mystery: null });
  }
  localStorage.setItem('mercy.records.v1', JSON.stringify(recs));
});
await page.reload({ waitUntil: 'networkidle' });
await page.click('[data-go="history"]');
await page.waitForTimeout(400);
const many = await sizeOf();
ok('a full month draws every flower', many.n === 62);
ok('with more flowers, each is drawn smaller', many.avg < few.avg);
ok('and the whole bouquet still fits the frame', many.inside);

// ── 換月份 ──
const label = await page.textContent('#cal-label');
await page.click('#cal-prev');
await page.waitForTimeout(250);
ok('the previous month draws its own bouquet', (await page.textContent('#cal-label')) !== label);
ok('and it has no flowers', await page.locator(FLOWERS).count() === 0);
ok('its legend reads zero', (await page.textContent('#bq-legend')).includes('0 天'));
await page.click('#cal-next');
await page.waitForTimeout(250);
ok('coming back restores this month', (await page.textContent('#cal-label')) === label);
ok('and its flowers return', await page.locator(FLOWERS).count() === 62);

// 月曆仍在，只是收起來
ok('the calendar is tucked away by default', !(await page.isVisible('#cal')));
await page.click('#cal-toggle');
await page.waitForTimeout(200);
ok('the toggle brings the calendar back', await page.isVisible('#cal'));
ok('and the bouquet steps aside', !(await page.isVisible('#rose')));
ok('the toggle now offers the bouquet back', (await page.textContent('#cal-toggle')).includes('花束'));
await page.click('#cal-toggle');
await page.waitForTimeout(200);
ok('and back again', await page.isVisible('#rose') && !(await page.isVisible('#cal')));

console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'no console errors');
await browser.close();
process.exit(failures || errors.length ? 1 : 0);
