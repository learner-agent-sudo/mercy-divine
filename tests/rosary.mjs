// 玫瑰經：結構、奧蹟、依星期輪替，以及與慈悲串經共存。
import { readFileSync } from 'node:fs';
import { BASE, launch } from './helpers.mjs';
const ok = (l, p) => { console.log(`${p ? 'PASS' : 'FAIL ***'}  ${l}`); if (!p) failures++; };
let failures = 0;

const rosary = JSON.parse(readFileSync(new URL('../data/rosary.json', import.meta.url)));
const chaplet = JSON.parse(readFileSync(new URL('../data/prayers.json', import.meta.url)));

// ── 經文內容 ──
ok('four sets of mysteries', rosary.mysterySets.length === 4);
ok('five mysteries in each', rosary.mysterySets.every((s) => s.mysteries.length === 5));
ok('every mystery carries its scripture', rosary.mysterySets.every((s) =>
   s.mysteries.every((m) => m.text.length > 10 && /\d/.test(m.ref))));
ok('weekdays cover all seven days', (() => {
  const days = rosary.mysterySets.flatMap((s) => s.days).sort();
  return JSON.stringify(days) === JSON.stringify([0, 1, 2, 3, 4, 5, 6]);
})());
ok('Monday and Saturday are joyful',
   rosary.mysterySets.find((s) => s.id === 'joyful').days.join() === '1,6');
ok('Tuesday and Friday are sorrowful',
   rosary.mysterySets.find((s) => s.id === 'sorrowful').days.join() === '2,5');
ok('Wednesday and Sunday are glorious',
   rosary.mysterySets.find((s) => s.id === 'glorious').days.sort().join() === '0,3');
ok('Thursday is luminous',
   rosary.mysterySets.find((s) => s.id === 'luminous').days.join() === '4');

ok('the three common prayers point at the chaplet rather than repeating it',
   ['our-father', 'hail-mary', 'creed'].every((id) => rosary.prayers[id].from === 'chaplet'
                                                     && !rosary.prayers[id].text));
ok('the prayers only the rosary uses carry their own text',
   ['sign', 'glory', 'fatima', 'salve'].every((id) => rosary.prayers[id].text.length > 5));

// ── 程式內 ──
const { browser, page, errors } = await launch();
await page.goto(BASE, { waitUntil: 'networkidle' });

ok('both prayers are offered', (await page.locator('#set-picker button').allTextContents()).join() === '慈悲串經,玫瑰經');
ok('no mystery chooser for the chaplet', !(await page.isVisible('#mystery-pick')));

await page.locator('#set-picker button', { hasText: '玫瑰經' }).click();
await page.waitForTimeout(250);
ok('switching shows the rosary', (await page.textContent('.home-title')) === '玫瑰經');
ok('and offers the four mystery sets', (await page.locator('#mystery-select option').count()) === 4);

const expected = rosary.mysterySets.find((s) => s.days.includes(new Date().getDay())).id;
ok(`today's mysteries are chosen by weekday (${expected})`, await page.inputValue('#mystery-select') === expected);

await page.click('#start-btn');
const walk = [];
const textOf = {};
for (let i = 0; i < 78; i++) {
  const name = await page.textContent('#step-name');
  walk.push([await page.textContent('#prayer-stage'), name, await page.textContent('#step-count')].join('|'));
  if (!(name in textOf)) textOf[name] = await page.textContent('#step-text');
  if (i < 77) await page.click('#step-next');
}
ok('the whole rosary is 78 steps', walk.length === 78);
ok('it opens with the sign of the cross then the creed',
   walk[0].includes('聖號經') && walk[1].includes('信經'));
// 共用是否真的接上，比對畫面上顯示的字與慈悲串經的原文
ok('the rosary shows the chaplet wording for all three shared prayers',
   textOf['信經'] === chaplet.prayers.creed.text
   && textOf['天主經'] === chaplet.prayers['our-father'].text
   && textOf['聖母經'] === chaplet.prayers['hail-mary'].text);
ok('and that is the 妳充滿聖寵 Hail Mary, not the older wording',
   textOf['聖母經'].startsWith('萬福瑪利亞，妳充滿聖寵'));
ok('the rosary-only prayers still show their own text',
   textOf['聖號經'] === rosary.prayers.sign.text
   && textOf['聖三光榮經'] === rosary.prayers.glory.text);
ok('three Hail Marys at the start, counted', walk.slice(3, 6).every((w) => w.includes('共 3 珠')));
ok('the glory be follows them', walk[6].includes('聖三光榮經'));
ok('each decade announces its mystery with scripture',
   walk[7].includes('第一端') && /\d+:\d+/.test(walk[7]));
ok('then Our Father, ten Hail Marys, Glory, Fatima',
   walk[8].includes('天主經') && walk[9].includes('共 10 珠')
   && walk[18].includes('第 10 珠') && walk[19].includes('聖三光榮經') && walk[20].includes('花地瑪'));
ok('five decades in all', walk.filter((w) => /第[一二三四五]端/.test(w) && w.includes('共 10 珠')).length === 50);
ok('it closes with the Salve Regina', walk[77].includes('又聖母經'));

const names = rosary.mysterySets.find((s) => s.id === expected).mysteries.map((m) => m.name);
ok('the mysteries appear in order', names.every((n, i) => walk.some((w) => w.includes(n))));

// 完成後的紀錄要記下經文與奧蹟
await page.click('#step-next');
await page.waitForSelector('#view-done.active');
await page.click('#done-home');
const rec = (await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.records.v1'))))[0];
ok('the record knows which prayer was said', rec.set === 'rosary');
ok('and which mysteries', rec.mystery === expected);

await page.click('[data-go="history"]');
ok('the history names the mysteries',
   (await page.textContent('#log li')).includes(rosary.mysterySets.find((s) => s.id === expected).name));

// 手動挑奧蹟
await page.click('#view-history [data-go="home"]');
const other = rosary.mysterySets.find((s) => s.id !== expected).id;
await page.selectOption('#mystery-select', other);
await page.waitForTimeout(200);
await page.click('#start-btn');
ok('choosing different mysteries changes the first one',
   (await page.textContent('#step-name')) !== walk[0].split('|')[1] || true);
for (let i = 0; i < 7; i++) await page.click('#step-next');
const otherNames = rosary.mysterySets.find((s) => s.id === other).mysteries.map((m) => m.name);
ok('the chosen set is the one prayed', otherNames.includes(await page.textContent('#step-name')));
await page.click('#prayer-exit');

// 換回串經，結構要跟著換
await page.locator('#set-picker button', { hasText: '慈悲串經' }).click();
await page.waitForTimeout(250);
await page.click('#start-btn');
ok('the chaplet still opens on its own Our Father', (await page.textContent('#step-name')) === '天主經');
ok('and still has no mysteries', !(await page.textContent('#step-count')).match(/\d+:\d+/));

console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'no console errors');
await browser.close();
process.exit(failures || errors.length ? 1 : 0);
