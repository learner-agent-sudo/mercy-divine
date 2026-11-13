// 九日敬禮：首頁的卡片、列表、九天的目錄、某一天的內容與經文、念完與取消、為誰祈禱、
// 完成的紀錄、返回鍵、重新載入、前後一天、壞掉的儲存。
import { BASE, launch } from './helpers.mjs';

const ok = (l, p) => { console.log(`${p ? 'PASS' : 'FAIL ***'}  ${l}`); if (!p) failures++; };
let failures = 0;

// 不啟用離線快取：資料與程式都直接從伺服器來（離線與快取另有 offline 測試）
const { browser, page, errors, autoDialog } = await launch({ serviceWorkers: 'block', acceptDownloads: true });
const outbound = [];
page.on('request', (r) => { if (new URL(r.url()).hostname !== 'localhost') outbound.push(r.url()); });

// 資料檔本身：下面的斷言拿它當標準答案
const real = await (await fetch(`${BASE}data/novenas.json`)).json();
const prayers = await (await fetch(`${BASE}data/prayers.json`)).json();
const nov = real.novenas[0];
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return dayKey(d); };
const TODAY = dayKey(new Date());
const thisYear = new Date().getFullYear();
const fullOf = (k) => { const [y, m, d] = k.split('-').map(Number); return `${y}年${m}月${d}日`; };
const shortOf = (k) => (k.slice(0, 4) === String(thisYear) ? fullOf(k).replace(/^\d{4}年/, '') : fullOf(k));
const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

const store = () => page.evaluate(() => { const r = localStorage.getItem('mercy.novena.v1'); return r ? JSON.parse(r) : null; });
const seed = (v) => page.evaluate((x) => localStorage.setItem('mercy.novena.v1', typeof x === 'string' ? x : JSON.stringify(x)), v);
const homeLine = () => page.textContent('#novena-home-line');
const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const text = (sel) => page.textContent(sel);
const count = (sel) => page.locator(sel).count();
const onView = (sel) => page.isVisible(sel);

async function home() {
  await page.evaluate(() => history.replaceState(null, ''));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#view-home.active');
}
async function reset() {
  await page.evaluate(() => localStorage.clear());
  await home();
}
// 返回鍵一層一層退，直到看見指定的畫面
async function backTo(sel) {
  for (let i = 0; i < 6 && !(await onView(sel)); i++) {
    await page.goBack();
    await page.waitForTimeout(150);
  }
  await page.waitForSelector(sel);
}
// 從首頁走到列表、再到這個九日敬禮的目錄
async function toNovena() {
  await page.click('#novena-open');
  await page.waitForSelector('.nov-card');
  await page.click('.nov-card');
  await page.waitForSelector('.nov-day');
}

// ───────────── 首頁的卡片 ─────────────
await page.goto(BASE, { waitUntil: 'networkidle' });
await reset();
ok('home has the 九日敬禮 card', (await text('#novena-home .bible-home-title')) === '九日敬禮');
ok('with the first-visit line', (await homeLine()) === '連續九天的祈禱');
ok('the continue button is hidden, and the header row opens the list and never changes class', !(await onView('#novena-continue'))
   && (await page.getAttribute('#novena-open', 'aria-label')) === '打開九日敬禮' && (await page.getAttribute('#novena-open', 'class')) === 'hub-head');
ok('the card fits the narrow screen', await noHScroll());

// ───────────── 列表與目錄 ─────────────
await page.click('#novena-open');
await page.waitForSelector('.nov-card');
ok('打開 shows exactly one card', (await count('.nov-card')) === 1);
ok('the card has the name, the sub line and 還沒念過', (await text('.nov-card-name')) === nov.name
   && (await text('.nov-card-sub')) === nov.sub && (await text('.nov-card-status')) === '還沒念過');
await page.click('.nov-card');
await page.waitForSelector('.nov-day');
ok('the novena screen has nine rows', (await count('.nov-day')) === 9);
ok('the nine themes come from the file, in order',
   JSON.stringify(await page.locator('.nov-day-theme').allTextContents()) === JSON.stringify(nov.days.map((d) => d.theme)));
ok('the start button says 開始：念第一天', (await text('#nov-go')) === '開始：念第一天');
ok('no progress line before starting', (await count('.nov-progress')) === 0);
ok('the novena screen fits the narrow screen', await noHScroll());

// ───────────── 某一天的內容 ─────────────
await page.click('.nov-day[data-n="1"]');
await page.waitForSelector('.nov-answer p');
const d1 = nov.days[0];
ok('the day heading and theme', (await text('.nov-day-title')) === '第一天' && (await text('.nov-theme')) === d1.theme);
ok('the question is shown', (await text('.nov-q')) === nov.question);
ok('every answer paragraph is verbatim', JSON.stringify(await page.locator('.nov-answer p').allTextContents()) === JSON.stringify(d1.answer));
ok('every appeal paragraph is verbatim', JSON.stringify(await page.locator('.nov-appeal p').allTextContents()) === JSON.stringify(d1.appeal));
const closePrayer = nov.close.find((c) => c.kind === 'prayer');
ok('the closing prayer is in the gold box', (await text('blockquote.nov-prayer p')) === closePrayer.text);
ok('the line and count texts follow, in order',
   JSON.stringify(await page.locator('p.nov-line').allTextContents()) === JSON.stringify(nov.close.filter((c) => c.kind !== 'prayer').map((c) => c.text)));
const sums = await page.locator('details.nov-pr > summary').allTextContents();
ok('two prayer details: 天主經 and 聖母經', JSON.stringify(sums) === JSON.stringify(['天主經', '聖母經']));
ok('their text equals data/prayers.json',
   JSON.stringify(await page.locator('details.nov-pr .nov-pr-body').allTextContents())
   === JSON.stringify([prayers.prayers['our-father'].text, prayers.prayers['hail-mary'].text]));
ok('the day screen fits the narrow screen', await noHScroll());

// ───────────── 念完第一天 ─────────────
await page.click('#nov-mark');
await page.waitForSelector('#nov-undo');
const r1 = await store();
ok('marking day 1 stores a run that starts today', JSON.stringify(r1.runs.souls) === JSON.stringify({ start: TODAY, days: { 1: TODAY } }));
ok('a toast says 第一天念完了', (await text('#toast')) === '第一天念完了');
ok('the day now says when it was finished', (await text('.nov-done')) === `已於 ${shortOf(TODAY)}念完`);
ok('and offers the next undone day', (await text('#nov-see')) === '看第二天');

// 回到目錄：進度、點點、今天的提示、明天要念的那一天
await page.click('#novena-back');
await page.waitForSelector('.nov-progress');
ok('the progress line counts and gives the start', (await text('.nov-progress')) === `已念 1 / 9 天 · ${shortOf(TODAY)}開始`);
ok('the first dot is on', (await count('.nov-dot.on')) === 1);
ok('the hint says today and tomorrow', (await text('.nov-hint')) === '今天已念第一天，明天念第二天');
ok('the start button now says 念第二天', (await text('#nov-go')) === '念第二天');
ok('day 1 in the list shows its date', (await text('.nov-day[data-n="1"] .nov-day-date')) === shortOf(TODAY));
ok('restart is offered while a run is going', await onView('#nov-restart'));

// 首頁：有進行中的念誦，繼續按鈕念第二天
await backTo('#view-home.active');
ok('home shows the progress', (await homeLine()) === `${nov.name}：已念 1 / 9 天`);
ok('and the continue button says 念第二天', (await text('#novena-continue')) === '念第二天' && (await onView('#novena-continue')));

// 繼續念第二天；前後一天的按鈕；取消紀錄要先問
await page.click('#novena-continue');
await page.waitForSelector('.nov-day-title');
ok('continue opens day 2', (await text('.nov-day-title')) === '第二天');
ok('day 2 has a previous button and a next button', (await onView('#nov-prev')) && (await onView('#nov-next')));
await page.click('#nov-prev');
await page.waitForSelector('.nov-day-title:has-text("第一天")');
ok('the previous button goes to day 1', (await text('.nov-day-title')) === '第一天');
ok('day 1 has no previous button', !(await onView('#nov-prev')));
await page.click('#nov-next');
await page.waitForSelector('.nov-day-title:has-text("第二天")');
await page.click('#nov-prev');
await page.waitForSelector('.nov-day-title:has-text("第一天")');

let asked = null;
autoDialog(false);
page.once('dialog', (d) => { asked = d.message(); d.dismiss(); });
await page.click('#nov-undo');
autoDialog(true);
ok('undo asks first, and cancelling keeps the day', asked === '取消第一天的紀錄？' && JSON.stringify((await store()).runs.souls.days) === JSON.stringify({ 1: TODAY }));
await page.click('#nov-undo');
await page.waitForSelector('#nov-mark');
ok('undo removes the day and the run with it', (await store()).runs.souls === undefined);
ok('the day is open to mark again', (await text('#nov-mark')) === '念完第一天');
await page.click('#nov-mark');
await page.waitForSelector('#nov-undo');

// 回到首頁，重新開始會清除念誦
await backTo('#view-home.active');
await page.click('#novena-open');
await page.waitForSelector('.nov-card');
await page.click('.nov-card');
await page.waitForSelector('#nov-restart');
autoDialog(false);
page.once('dialog', (d) => d.dismiss());
await page.click('#nov-restart');
autoDialog(true);
ok('cancelling restart keeps the run', (await store()).runs.souls !== undefined);
await page.click('#nov-restart');
await page.waitForSelector('#nov-go:has-text("開始：念第一天")');
ok('restart clears the run', (await store()).runs.souls === undefined && (await count('.nov-progress')) === 0);

// ───────────── 提示：上次念是三天前 ─────────────
await seed({ runs: { souls: { start: daysAgo(3), days: { 1: daysAgo(3) } } }, done: [], intent: {} });
await home();
await page.click('#novena-open');
await page.waitForSelector('.nov-card');
await page.click('.nov-card');
await page.waitForSelector('.nov-hint');
ok('a run last done three days ago says 已隔 2 天', (await text('.nov-hint'))
   === `上次念是 ${shortOf(daysAgo(3))}，已隔 2 天。可以接著念，也可以重新開始。`);

// ───────────── 為誰祈禱、完成九天、完成的紀錄 ─────────────
const past = {};
for (let n = 1; n <= 8; n++) past[n] = daysAgo(9 - n);
await seed({ runs: { souls: { start: daysAgo(8), days: past } }, done: [], intent: {} });
await home();
await toNovena();
ok('with days 1–8 done the button says 念第九天', (await text('#nov-go')) === '念第九天');
await page.fill('#nov-intent', '亡父 若瑟');
ok('the intention is saved as typed', (await store()).intent.souls === '亡父 若瑟');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#nov-intent');
ok('the intention survives a reload, on the same screen', (await page.inputValue('#nov-intent')) === '亡父 若瑟'
   && (await onView('#view-novena.active')));
await page.click('#nov-go');
await page.waitForSelector('.nov-day-title:has-text("第九天")');
ok('day 9 shows the intention and has no next button', (await text('.nov-for')) === '為：亡父 若瑟' && !(await onView('#nov-next')));
ok('day 9 has a previous button', await onView('#nov-prev'));
await page.click('#nov-mark');
await page.waitForSelector('.nov-finished');
const done = await store();
ok('finishing day 9 records one done entry and clears the run', done.done.length === 1 && done.runs.souls === undefined);
ok('the entry has the start, today as the end, and the intention',
   JSON.stringify(done.done[0]) === JSON.stringify({ id: 'souls', start: daysAgo(8), end: TODAY, for: '亡父 若瑟' }));
ok('a toast says the novena is finished', (await text('#toast')) === `${nov.name}念完了`);
ok('day 9 stays on screen and says all nine days are done', (await text('.nov-finished')) === `九天都念完了（${shortOf(daysAgo(8))}開始）`
   && !(await onView('#nov-mark')) && !(await onView('#nov-undo')));
await page.click('#nov-prev');
await page.waitForSelector('.nov-day-title:has-text("第八天")');
ok('the other days say so too, with no mark button', (await count('.nov-finished')) === 1 && !(await onView('#nov-mark')));
await page.click('#nov-records-go');
await page.waitForSelector('.nov-records li');
ok('看念完的紀錄 opens the novena screen', await onView('#view-novena.active') && (await count('.nov-day')) === 9);
ok('the record line shows the date, the start and the intention',
   (await text('.nov-record-list li')) === `${fullOf(TODAY)}念完（${shortOf(daysAgo(8))}開始）· 為：亡父 若瑟`);
ok('the record shows the intention on its own line', (await text('.nov-record-for')) === '· 為：亡父 若瑟');
await backTo('#view-home.active');
ok('home now says when it was last finished', (await homeLine()) === `上次念完：${nov.name}，${shortOf(TODAY)}`);
ok('and the continue button is hidden', !(await onView('#novena-continue')));
await page.click('#novena-open');
await page.waitForSelector('.nov-card');
ok('the list says 念完 1 次', (await text('.nov-card-status')) === '念完 1 次');

// ───────────── 壞掉的儲存：不會當掉，卡片照樣出現 ─────────────
for (const bad of [
  '{not json',
  JSON.stringify({ runs: { souls: { start: '2999-01-01', days: { 1: TODAY } } }, done: [{ id: '../x', start: 'x', end: 'y' }], intent: { souls: 5 } }),
  JSON.stringify({ runs: { souls: { start: TODAY, days: { 10: TODAY, 0: TODAY, x: TODAY } } }, done: 'nope' }),
  JSON.stringify([1, 2, 3]),
]) {
  await page.evaluate((b) => localStorage.setItem('mercy.novena.v1', b), bad);
  await home();
  ok(`garbage in storage does not stop the card (${bad.slice(0, 24)}…)`, (await text('#novena-home .bible-home-title')) === '九日敬禮'
     && (await homeLine()) === '連續九天的祈禱');
}
await page.click('#novena-open');
await page.waitForSelector('.nov-card');
ok('bad entries are dropped: the card still reads 還沒念過', (await text('.nov-card-status')) === '還沒念過');

// ───────────── 返回鍵、重新載入 ─────────────
await reset();
await page.click('#novena-open');
await page.waitForSelector('.nov-card');
await page.click('.nov-card');
await page.waitForSelector('.nov-day');
await page.click('.nov-day[data-n="3"]');
await page.waitForSelector('.nov-day-title:has-text("第三天")');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.nov-day-title');
ok('a reload on a day screen comes back to that day', (await text('.nov-day-title')) === '第三天' && (await onView('#view-novena.active')));
await backTo('.nov-day');
ok('back from day 3 goes to the novena screen', await onView('.nov-day'));
await backTo('.nov-card');
ok('back again goes to the list', await onView('.nov-card'));
await backTo('#view-home.active');
ok('back a third time goes home', await onView('#view-home.active'));

console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'no console errors');
ok('no console errors', errors.length === 0);
ok('nothing left the device', outbound.length === 0);
await browser.close();
process.exit(failures || errors.length ? 1 : 0);
