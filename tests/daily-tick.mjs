// 每日福音的「讀完了」：每天各自一個勾（days），週列（一週七天、勾與目前那天）、首頁的今日福音與圖、設定裡的首頁卡片。
import { BASE, launch } from './helpers.mjs';

let failures = 0;
const ok = (l, p) => { console.log(`${p ? 'PASS' : 'FAIL ***'}  ${l}`); if (!p) failures++; };

const { browser, page, errors } = await launch();

// 回到乾淨的首頁（先清掉歷史紀錄裡留著的那一層）
async function home() {
  await page.evaluate(() => history.replaceState(null, ''));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#view-home.active');
  await page.waitForFunction(() => /節/.test(document.querySelector('#bible-home-line').textContent));
}
// 從零開始：清空儲存，再回首頁
async function fresh() {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await home();
}
async function seed(obj) {
  await page.evaluate((v) => localStorage.setItem('mercy.bible.v1', JSON.stringify(v)), obj);
  await home();
}
const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('mercy.bible.v1') || 'null'));
const openToday = async () => {
  await page.waitForSelector('#bible-today:not([hidden])');
  await page.click('#bible-today');
  await page.waitForSelector('.bible-day-ref');
};
const backHome = async () => {
  await page.click('#bible-back');
  await page.waitForSelector('#view-home.active');
};
const tickBtn = () => page.locator('.bible-day-done');
const isTicked = async () => (await page.getAttribute('.bible-day-done', 'aria-pressed')) === 'true';
const tickBtnText = () => page.textContent('.bible-day-done');
const sameSet = (a, b) => JSON.stringify([...new Set(a)].sort()) === JSON.stringify([...new Set(b)].sort());

// 日期字串加減幾天（YYYY-MM-DD）
const addDays = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

// 今天的福音：頁面算出的日期、名稱與出處
await fresh();
const today = await page.evaluate(() => {
  const d = lectionaryDay(new Date());
  return { date: d.date, name: d.name, label: d.gospel.label, book: d.gospel.book, refs: d.gospel.refs };
});
// 今天的節：從頁面實際顯示的經文讀出來
const todayVerseKeys = async () => {
  await fresh();
  await openToday();
  const keys = await page.$$eval('.bible-day-text .v[data-key]', (els) => els.map((e) => e.dataset.key));
  await backHome();
  return [...new Set(keys)];
};
const allKeys = await todayVerseKeys();
const firstKey = allKeys[0];
console.log(`       today: ${today.date} ${today.name} | ${today.label} | ${allKeys.length} 節`);
ok('今天的經文至少兩節（測試需要）', allKeys.length >= 2);

/* ───────────── A. 每日一勾（days）───────────── */

// A1. 之前全部讀過，今天仍然是「讀完了」
await fresh();
await seed({ read: { [today.book]: allKeys }, log: [] });
await openToday();
ok('A1 先前整段都讀過：今天的按鈕仍是「讀完了」', (await tickBtnText()) === '讀完了' && !(await isTicked()));
await backHome();
ok('A1 首頁 #bible-today-ref 不以 ✓ 結尾', !(await page.textContent('#bible-today-ref')).endsWith(' ✓'));
await page.click('#bible-open');
await page.waitForSelector('#bible-today-card');
ok('A1 大廳今日卡片狀態是「讀 ›」', (await page.textContent('#bible-today-card .btc-state')) === '讀 ›');

// A2. 只讀過第一節：勾下去只記其餘的節；取消時只拿掉那一下新加的
await fresh();
await seed({ read: { [today.book]: [firstKey] }, log: [] });
await openToday();
await tickBtn().click();
await page.waitForFunction(() => document.querySelector('.bible-day-done')?.textContent === '✓ 這天的福音讀過了');
ok('A2 勾下去：按鈕是「✓ 這天的福音讀過了」', (await tickBtnText()) === '✓ 這天的福音讀過了');
const s2 = await store();
const dayKeys = s2?.days?.[today.date];
ok('A2 days[今天] 是其餘的節（不含先前讀過的第一節）',
  Array.isArray(dayKeys) && !dayKeys.includes(firstKey) && sameSet(dayKeys, allKeys.slice(1)));
ok('A2 今天所有的節都在 read[book] 裡', allKeys.every((k) => (s2?.read?.[today.book] || []).includes(k)));
await tickBtn().click();
await page.waitForFunction(() => document.querySelector('.bible-day-done')?.textContent === '讀完了');
const s2b = await store();
ok('A2 取消：days 沒有今天的鍵了', !s2b?.days || !(today.date in s2b.days));
ok('A2 取消：read[book] 回到只剩第一節', sameSet(s2b?.read?.[today.book] || [], [firstKey]));

// A3. 勾了今天，再看後一天與前一天
await fresh();
await openToday();
await tickBtn().click();
await page.waitForFunction(() => document.querySelector('.bible-day-done')?.textContent === '✓ 這天的福音讀過了');
const pager = page.locator('.bible-pager button');
const dateToday = await page.textContent('.bible-day-date');
await pager.nth(2).click();
await page.waitForFunction((d) => document.querySelector('.bible-day-date')?.textContent !== d, dateToday);
ok('A3 後一天：按鈕是「讀完了」（沒有被今天影響）',
  (await tickBtnText()) === '讀完了' && !(await isTicked()));
await page.locator('.bible-pager button').nth(0).click();
await page.waitForFunction((d) => document.querySelector('.bible-day-date')?.textContent === d, dateToday);
ok('A3 回到今天：按鈕仍是 ✓ 已讀', (await tickBtnText()) === '✓ 這天的福音讀過了' && (await isTicked()));
await backHome();

// A4. 重新整理後仍然記得
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#view-home.active');
await page.waitForFunction(() => /節/.test(document.querySelector('#bible-home-line').textContent));
await page.waitForSelector('#bible-today:not([hidden])');
ok('A4 重新整理後：首頁 #bible-today-ref 以 ✓ 結尾', (await page.textContent('#bible-today-ref')).endsWith(' ✓'));
await page.click('#bible-open');
await page.waitForSelector('#bible-today-card');
ok('A4 重新整理後：大廳今日卡片「✓ 今天讀過了」', (await page.textContent('#bible-today-card .btc-state')) === '✓ 今天讀過了');
await page.click('#bible-back');
await page.waitForSelector('#view-home.active');
await openToday();
ok('A4 重新整理後：今天的按鈕仍是 ✓ 已讀', (await tickBtnText()) === '✓ 這天的福音讀過了');
await backHome();

// A5. 備份：匯出、清掉、匯入後，今天還是已讀
await page.waitForSelector('#view-home.active');
const exported = await page.evaluate(() => window.bibleExport());
ok('A5 bibleExport() 的 days 有今天', !!exported && !!exported.days && today.date in exported.days);
await page.evaluate(() => localStorage.clear());
await home();
const imp = await page.evaluate((x) => window.bibleImport(x), exported);
ok('A5 匯入後 days 計數為 1', imp && imp.days === 1);
await openToday();
ok('A5 匯入後重開今天：按鈕是 ✓ 已讀', (await tickBtnText()) === '✓ 這天的福音讀過了');
await backHome();

// A6. 匯入的垃圾鍵被忽略
await fresh();
const junk = await page.evaluate(() => window.bibleImport({ days: { 'not-a-date': [], '2026-13-99x': [], '2020-01-05': 'x' } }));
ok('A6 匯入垃圾鍵：只算合法的 YYYY-MM-DD（days === 1）', junk && junk.days === 1);
const s6 = await store();
ok('A6 儲存的 days 只剩 2020-01-05', JSON.stringify(Object.keys(s6?.days || {})) === JSON.stringify(['2020-01-05']));

/* ───────────── B. 週列 ───────────── */

await fresh();
await openToday();
const weekCells = page.locator('nav.bible-week .bible-week-day');
ok('B 週列有 7 格', (await weekCells.count()) === 7);
const weekDays = await page.$$eval('nav.bible-week .bible-week-day', (els) => els.map((e) => e.dataset.d));
const [fy, fm, fd] = weekDays[0].split('-').map(Number);
ok('B 第一格是星期日', new Date(fy, fm - 1, fd).getDay() === 0);
ok('B 七格是連續的七天', weekDays.every((d, i) => d === addDays(weekDays[0], i)));
const cur = () => page.$eval('nav.bible-week [aria-current="date"]', (e) => e.dataset.d);
ok('B 目前那天（aria-current）是今天', (await cur()) === today.date);
ok('B 今天那格有 is-today', await page.$eval(`nav.bible-week .bible-week-day[data-d="${today.date}"]`, (e) => e.classList.contains('is-today')));
ok('B 週列的前一週、下一週按鈕有正確的 aria-label',
  (await page.getAttribute('nav.bible-week .bible-week-nav:first-child', 'aria-label')) === '上一週'
  && (await page.getAttribute('nav.bible-week .bible-week-nav:last-child', 'aria-label')) === '下一週');

const todayCell = `nav.bible-week .bible-week-day[data-d="${today.date}"]`;
await tickBtn().click();
await page.waitForFunction((sel) => document.querySelector(sel)?.classList.contains('is-read'), todayCell);
ok('B 勾了今天：今天那格有 is-read', await page.$eval(todayCell, (e) => e.classList.contains('is-read')));
await tickBtn().click();
await page.waitForFunction((sel) => !document.querySelector(sel)?.classList.contains('is-read'), todayCell);
ok('B 取消：今天那格的 is-read 拿掉', !(await page.$eval(todayCell, (e) => e.classList.contains('is-read'))));

// 點另一格：換到那一天
const other = weekDays.find((d) => d !== today.date);
const dateBeforeCell = await page.textContent('.bible-day-date');
await page.click(`nav.bible-week .bible-week-day[data-d="${other}"]`);
await page.waitForFunction((d) => document.querySelector('.bible-day-date')?.textContent !== d, dateBeforeCell);
ok('B 點另一格：目前那天換成那一格', (await cur()) === other
  && (await page.textContent('.bible-day-date')).includes(`${Number(other.split('-')[2])}`));

// 下一週 +7、上一週 −7
await page.click('nav.bible-week .bible-week-nav:last-child');
await page.waitForFunction((d) => document.querySelector('nav.bible-week [aria-current="date"]')?.dataset.d === d, addDays(other, 7));
ok('B 下一週：目前那天 +7 天', (await cur()) === addDays(other, 7));
await page.click('nav.bible-week .bible-week-nav:first-child');
await page.waitForFunction((d) => document.querySelector('nav.bible-week [aria-current="date"]')?.dataset.d === d, other);
ok('B 上一週：目前那天 −7 天（回到原來那天）', (await cur()) === other);
await page.click('nav.bible-week .bible-week-nav:first-child');
await page.waitForFunction((d) => document.querySelector('nav.bible-week [aria-current="date"]')?.dataset.d === d, addDays(other, -7));
ok('B 上一週：又再 −7 天', (await cur()) === addDays(other, -7));
await backHome();

/* ───────────── C. 首頁 ───────────── */

await fresh();
const litShown = await page.isVisible('#home-lit');
ok('C 首頁的 #home-lit 顯示出來', litShown);
const litName = await page.textContent('#home-lit-name');
const expectName = await page.evaluate(() => lectionaryDay(new Date()).name);
ok(`C #home-lit-name 是今天的福音名稱（${litName}）`, litName === expectName);
ok('C #home-lit-dot 有 data-color', !!(await page.getAttribute('#home-lit-dot', 'data-color')));

const sections = [
  ['#bible-home', 'section-bible.svg'],
  ['#novena-home', 'section-novena.svg'],
  ['#confession-home', 'section-confession.svg'],
];
for (const [sel, file] of sections) {
  const fig = page.locator(`${sel} .plate-sec`);
  ok(`C ${sel} 的 figure.plate-sec 看得見`, (await fig.count()) === 1 && await fig.isVisible());
  const src = await page.getAttribute(`${sel} .plate-sec img`, 'src');
  ok(`C ${sel} 的圖有預設 src（${file}）`, !!src && src.endsWith(file));
  ok(`C ${sel} 有「換圖」按鈕`, (await page.textContent(`${sel} .pic-pick`)) === '換圖');
}

// 點圖：打開各自的部分
await page.click('#novena-home .plate-sec .car');
await page.waitForSelector('#view-novena.active');
ok('C 點九日敬禮的圖：打開九日敬禮', (await page.locator('#view-novena.active').count()) === 1);
await page.goBack();
await page.waitForSelector('#view-home.active');

await page.click('#confession-home .plate-sec .car');
await page.waitForSelector('#view-confession.active');
ok('C 點修和聖事的圖：打開修和聖事', (await page.locator('#view-confession.active').count()) === 1);
await page.goBack();
await page.waitForSelector('#view-home.active');

await page.click('#bible-home .plate-sec .car');
await page.waitForSelector('#view-bible.active');
ok('C 點讀經的圖：打開讀經', (await page.locator('#view-bible.active').count()) === 1);
await page.goBack();
await page.waitForSelector('#view-home.active');

// 換圖：打開圖的選單
await page.click('#bible-home .pic-pick');
await page.waitForFunction(() => !document.getElementById('pic-sheet').hidden);
ok('C 按「換圖」：圖的選單打開（#pic-sheet 看得見）', await page.isVisible('#pic-sheet'));
await page.click('#sheet-close');
await page.waitForFunction(() => document.getElementById('pic-sheet').hidden);
ok('C 關閉選單後回到首頁', await page.isVisible('#view-home.active'));

// 修和聖事的步驟頁：說明的圖
await page.click('#confession-steps');
await page.waitForSelector('#view-confession.active');
await page.waitForSelector('.conf-intro');
const introSrc = await page.getAttribute('.conf-intro figure.plate-sec img', 'src');
ok('C 修和聖事「步驟」：.conf-intro 裡的圖是 section-confession.svg',
  !!introSrc && introSrc.endsWith('section-confession.svg'));
await page.goBack();
await page.waitForSelector('#view-home.active');

// 設定：首頁的卡片
await page.click('[data-go="settings"]');
await page.waitForSelector('#view-settings.active');
const slots = await page.evaluate(() => {
  const box = [...document.querySelectorAll('details.slot-group-box')]
    .find((d) => d.querySelector('.slot-group-name')?.textContent === '首頁的卡片');
  return box ? [...box.querySelectorAll('.slot')].map((s) => s.dataset.slot) : null;
});
ok('C 設定有「首頁的卡片」群組', slots !== null);
ok('C 「首頁的卡片」有三格：讀經、九日敬禮、修和聖事',
  JSON.stringify(slots) === JSON.stringify(['section:bible', 'section:novena', 'section:confession']));
await page.goBack();
await page.waitForSelector('#view-home.active');

ok('no page errors', errors.length === 0);
if (errors.length) console.log(`       ${errors.join('; ')}`);

await browser.close();
process.exit(failures ? 1 : 0);
