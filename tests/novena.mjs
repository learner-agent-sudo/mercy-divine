// 九日敬禮：首頁的卡片、列表（四個九日敬禮，各有插圖）、九天的目錄、某一天的內容與經文、念完與取消、
// 為誰祈禱、完成的紀錄、返回鍵、重新載入、前後一天、壞掉的儲存；另有開始與結尾的區塊（小標題、經文段落、
// 啟應、共同部分與每天部分的分界）、首頁同時有好幾個念誦進行中、念某一天時螢幕不熄、
// 插圖（列表、九日敬禮的頁面、每一天的小圖，圖檔要真的載入）、聖母進教（只有共同的部分、每天相同）、
// 125% 字級時不橫向捲動。
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
const SOULS_CARD = '.nov-card[data-id="souls"]';
// 天主聖神與聖母進教：開始與結尾都有區塊的兩個九日敬禮
const rosary = await (await fetch(`${BASE}data/rosary.json`)).json();
const spirit = real.novenas.find((n) => n.id === 'spirit');
const immaculate = real.novenas.find((n) => n.id === 'immaculate');
const auxilium = real.novenas.find((n) => n.id === 'auxilium');
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
  await page.click(SOULS_CARD);
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
ok('打開 shows one card per novena, in data order', (await count('.nov-card')) === 4
   && JSON.stringify(await page.locator('.nov-card-name').allTextContents()) === JSON.stringify(real.novenas.map((n) => n.name)));
ok('the souls card has the name, the sub line and 還沒念過', (await text(`${SOULS_CARD} .nov-card-name`)) === nov.name
   && (await text(`${SOULS_CARD} .nov-card-sub`)) === nov.sub && (await text(`${SOULS_CARD} .nov-card-status`)) === '還沒念過');
await page.click(SOULS_CARD);
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
ok('a souls day has no part headings (its file has no open blocks)', (await count('.nov-part')) === 0);
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
await page.click(SOULS_CARD);
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
await page.click(SOULS_CARD);
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
ok('the list says 念完 1 次', (await text(`${SOULS_CARD} .nov-card-status`)) === '念完 1 次');

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
ok('bad entries are dropped: the card still reads 還沒念過', (await text(`${SOULS_CARD} .nov-card-status`)) === '還沒念過');

// ───────────── 開始與結尾的區塊：天主聖神（啟應、小標題、經文段落） ─────────────
await reset();
await page.click('#novena-open');
await page.waitForSelector('.nov-card');
await page.click('.nov-card[data-id="spirit"]');
await page.waitForSelector('.nov-day');
await page.click('.nov-day[data-n="1"]');
await page.waitForSelector('.nov-part-day');
const sp1 = spirit.days[0];
const spOpenSay = spirit.open.filter((c) => c.kind === 'say');
const spOpenText = spirit.open.filter((c) => c.kind === 'text').flatMap((c) => c.text);
ok('spirit day 1: the part headings are the opening title and this day', JSON.stringify(await page.locator('.nov-part').allTextContents())
   === JSON.stringify(['向聖母瑪利亞求獲聖神誦', `第一天 · ${sp1.theme}`]));
ok('spirit day 1: the who of each 啟應 line, in order', JSON.stringify(await page.locator('.nov-who').allTextContents())
   === JSON.stringify(spOpenSay.map((c) => c.who)) && spOpenSay.map((c) => c.who).join('') === '啟應啟應啟應眾');
ok('spirit day 1: the 啟應 texts are verbatim', JSON.stringify(await page.locator('.nov-say-text').allTextContents())
   === JSON.stringify(spOpenSay.map((c) => c.text)));
ok('spirit day 1: three 聖母經 prayer details in the opening', JSON.stringify(await page.locator('details.nov-pr > summary').allTextContents())
   === JSON.stringify(['聖母經', '聖母經', '聖母經']));
ok('spirit day 1: the paragraphs are the opening text, then the day text', JSON.stringify(await page.locator('.nov-text p').allTextContents())
   === JSON.stringify([...spOpenText, ...sp1.text]));
ok('spirit day 1: the opening comes before the day heading, which comes before the day text', await page.evaluate(() => {
  const ps = document.querySelectorAll('.nov-text p');
  const part = document.querySelector('.nov-part-day');
  const first = ps[0];
  const last = ps[ps.length - 1];
  const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;
  return !!(first.compareDocumentPosition(part) & FOLLOWING) && !!(part.compareDocumentPosition(last) & FOLLOWING);
}));
ok('spirit day 1 has a mark button', (await count('#nov-mark')) === 1);
ok('spirit day 1 fits the narrow screen', await noHScroll());

// ───────────── 結尾的區塊：無玷始胎（開始的一句與小標題、結尾的經文段落、請眾同禱、讚美之聖誦） ─────────────
await reset();
await page.click('#novena-open');
await page.waitForSelector('.nov-card');
await page.click('.nov-card[data-id="immaculate"]');
await page.waitForSelector('.nov-day');
await page.click('.nov-day[data-n="9"]');
await page.waitForSelector('.nov-part-day');
const imOpenLine = immaculate.open.find((c) => c.kind === 'line').text;
const imOpenTitle = immaculate.open.find((c) => c.kind === 'title').text;
const imCloseTitle = immaculate.close.find((c) => c.kind === 'title').text;
const imCount = immaculate.close.find((c) => c.kind === 'count');
const imPrayer = immaculate.close.find((c) => c.kind === 'prayer');
const hailText = prayers.prayers['hail-mary'].text;
const gloryText = rosary.prayers.glory.text;
const lines = await page.locator('p.nov-line').allTextContents();
ok('immaculate day 9: the first line is the opening line', lines[0] === imOpenLine);
ok('immaculate day 9: the count line is shown', lines.includes(imCount.text));
ok('immaculate day 9: the prayers are 聖母經 and 聖三光榮經', JSON.stringify(await page.locator('details.nov-pr > summary').allTextContents())
   === JSON.stringify(['聖母經', '聖三光榮經']));
const bodies = await page.locator('details.nov-pr .nov-pr-body').allTextContents();
ok('immaculate day 9: 聖母經 text is the same as data/prayers.json', bodies[0] === hailText);
ok('immaculate day 9: 聖三光榮經 text is the same as data/rosary.json', bodies[1] === gloryText);
ok('immaculate day 9: the closing prayer is the file text', (await text('blockquote.nov-prayer p')) === imPrayer.text);
ok('immaculate day 9: the closing prayer label is the file label (if any)',
   (await count('.nov-prayer-label')) === (imPrayer.label ? 1 : 0) && (!imPrayer.label || (await text('.nov-prayer-label')) === imPrayer.label));
ok('immaculate day 9: the say lines are the file 啟應, in order', JSON.stringify(await page.locator('.nov-who').allTextContents())
   === JSON.stringify(immaculate.close.filter((c) => c.kind === 'say').map((c) => c.who)));
ok('immaculate day 9: the part headings are the opening title, this day, and the closing title', JSON.stringify(await page.locator('.nov-part').allTextContents())
   === JSON.stringify([imOpenTitle, `第九天 · ${immaculate.days[8].theme}`, imCloseTitle]));
ok('immaculate day 9 fits the narrow screen', await noHScroll());
// 第七天的經文：檔案裡有「即堅定」（結尾的文字在它之後）
await page.goBack();
await page.waitForSelector('.nov-day');
await page.click('.nov-day[data-n="7"]');
await page.waitForSelector('.nov-day-title:has-text("第七天")');
const d7 = immaculate.days[6].text;
const shownText = await page.locator('.nov-text p').allTextContents();
const at = shownText.indexOf(d7[0]);
ok('immaculate day 7 shows the file text (which contains 即堅定), after the opening text',
   at > 0 && JSON.stringify(shownText.slice(at, at + d7.length)) === JSON.stringify(d7) && d7.join('').includes('即堅定'));

// ───────────── 首頁：兩個念誦同時進行 ─────────────
await seed({ runs: { souls: { start: TODAY, days: { 1: TODAY } }, spirit: { start: TODAY, days: { 1: TODAY, 2: TODAY } } }, done: [], intent: {} });
await home();
ok('home with two runs lists each one on its own line', JSON.stringify(await page.locator('.nov-home-run').allTextContents())
   === JSON.stringify([`${nov.name}：已念 1 / 9 天`, `${spirit.name}：已念 2 / 9 天`]));
ok('home with two runs shows 繼續念', (await text('#novena-continue')) === '繼續念' && (await onView('#novena-continue')));
await page.click('#novena-continue');
await page.waitForSelector('.nov-card');
ok('繼續念 with two runs goes to the list', (await count('.nov-card')) === 4 && (await onView('#view-novena.active')));

// 只剩一個念誦：回到原來的樣子，按鈕念第二天
await seed({ runs: { spirit: { start: TODAY, days: { 1: TODAY } } }, done: [], intent: {} });
await home();
ok('home with one run is the single-line form again', (await homeLine()) === `${spirit.name}：已念 1 / 9 天`
   && (await count('.nov-home-run')) === 0);
ok('and the button says 念第二天', (await text('#novena-continue')) === '念第二天');
await page.click('#novena-continue');
await page.waitForSelector('.nov-day-title');
ok('with one run the button goes to that day', (await text('.nov-day-title')) === '第二天' && (await text('.nov-crumb')) === spirit.name);

// ───────────── 返回鍵、重新載入 ─────────────
await reset();
await page.click('#novena-open');
await page.waitForSelector('.nov-card');
await page.click(SOULS_CARD);
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

// ───────────── 念某一天時螢幕不熄 ─────────────
// 換成假的 wakeLock，數一數要了幾次、現在握著幾個
await page.addInitScript(() => {
  window.__wake = { requested: 0, held: 0 };
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => {
    window.__wake.requested++;
    window.__wake.held++;
    const s = { released: false, release: async () => { if (!s.released) { s.released = true; window.__wake.held--; } } };
    return s;
  } } });
});
const wake = () => page.evaluate(() => window.__wake);
const settle = () => page.waitForTimeout(150);
await reset();
await toNovena();
await settle();
ok('the novena screen does not keep the screen on', (await wake()).held === 0);
await page.click('#nov-go');
await page.waitForSelector('.nov-day-title:has-text("第一天")');
await settle();
ok('a day screen keeps the screen on', (await wake()).held === 1);
await page.click('#nov-next');
await page.waitForSelector('.nov-day-title:has-text("第二天")');
await page.click('#nov-mark');
await page.waitForSelector('#nov-undo');
await settle();
const w2 = await wake();
ok('turning the page and marking a day keep one lock, not several', w2.held === 1 && w2.requested === 1);
await page.goBack();
await page.waitForSelector('.nov-day');
await settle();
ok('back on the novena screen the screen may sleep again', (await wake()).held === 0);
await page.click('.nov-day[data-n="3"]');
await page.waitForSelector('.nov-day-title:has-text("第三天")');
await settle();
ok('a day screen again keeps it on', (await wake()).held === 1);
await backTo('#view-home.active');
await settle();
ok('going home lets it sleep', (await wake()).held === 0);
// 設定裡關掉「祈禱時保持螢幕不熄」：念九日敬禮也不要
await page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem('mercy.settings.v1') || '{}');
  st.wake = false;
  localStorage.setItem('mercy.settings.v1', JSON.stringify(st));
});
await home();
await toNovena();
await page.click('#nov-go');
await page.waitForSelector('.nov-day-title');
await settle();
ok('with the setting off, a day screen does not ask', (await wake()).requested === 0);

// ───────────── 插圖：列表、九日敬禮的頁面、每一天的小圖（圖檔要真的載入） ─────────────
await reset();
await page.click('#novena-open');
await page.waitForSelector('.nov-card');
const picsLoaded = await page.waitForFunction(() => {
  const pics = [...document.querySelectorAll('img.nov-card-pic')];
  return pics.length === 4 && pics.every((i) => i.complete && i.naturalWidth > 0);
}, null, { timeout: 5000 }).then(() => true, () => false);
const cardPics = await page.$$eval('.nov-card', (cards) => cards.map((c) => {
  const i = c.querySelector('img.nov-card-pic');
  return { id: c.dataset.id, src: i ? i.getAttribute('src') : null, w: i ? i.naturalWidth : 0 };
}));
ok('every list card has its picture (src ends with the file), and it loads', picsLoaded && real.novenas.every((n) => {
  const p = cardPics.find((x) => x.id === n.id);
  return p && p.src && p.src.endsWith(n.picture.file) && p.w > 0;
}));

await page.click('.nov-card[data-id="spirit"]');
await page.waitForSelector('.nov-hero');
await page.waitForFunction(() => { const i = document.querySelector('.nov-hero img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 5000 }).catch(() => {});
const hero = await page.evaluate(() => {
  const i = document.querySelector('.nov-hero img');
  const f = document.querySelector('.nov-hero figcaption');
  return i ? { src: i.getAttribute('src'), alt: i.alt, cap: f ? f.textContent : null, w: i.naturalWidth } : null;
});
ok('spirit novena screen: the hero picture, its alt and figcaption are the caption, and it loads',
   !!hero && hero.src.endsWith(spirit.picture.file) && hero.alt === spirit.picture.caption && hero.cap === spirit.picture.caption && hero.w > 0);

await page.click('#novena-back');
await page.waitForSelector('.nov-card');
await page.click(SOULS_CARD);
await page.waitForSelector('.nov-day');
await page.click('.nov-day[data-n="1"]');
await page.waitForSelector('.nov-day-head img.nov-day-pic');
const dayPic = await page.evaluate(() => { const i = document.querySelector('.nov-day-head img.nov-day-pic'); return i ? i.naturalWidth : 0; });
ok('souls day 1: the day head has its small picture', (await count('.nov-day-head img.nov-day-pic')) === 1 && dayPic > 0);
ok('souls day 1: the crumb, the title and the theme are in the day head',
   (await count('.nov-day-head .nov-crumb')) === 1 && (await count('.nov-day-head .nov-day-title')) === 1 && (await count('.nov-day-head .nov-theme')) === 1
   && (await text('.nov-crumb')) === nov.name && (await text('.nov-day-title')) === '第一天' && (await text('.nov-theme')) === d1.theme);

// ───────────── 聖母進教：開始與每一天的經文都相同，沒有每天的小標題與主題 ─────────────
await home();
await page.click('#novena-open');
await page.waitForSelector('.nov-card');
await page.click('.nov-card[data-id="auxilium"]');
await page.waitForSelector('.nov-day');
await page.click('.nov-day[data-n="1"]');
await page.waitForSelector('#nov-mark');
const auCounts = auxilium.open.filter((c) => c.kind === 'count');
const auText = auxilium.open.find((c) => c.kind === 'text').text;
ok('auxilium day 1: no theme and no 每天 heading', (await count('.nov-theme')) === 0 && (await count('.nov-part-day')) === 0);
ok('auxilium day 1: the one part heading is 一連九天誦唸', JSON.stringify(await page.locator('.nov-part').allTextContents()) === JSON.stringify(['一連九天誦唸']));
ok('auxilium day 1: the two count lines', JSON.stringify(await page.locator('p.nov-line').allTextContents()) === JSON.stringify(auCounts.map((c) => c.text)));
ok('auxilium day 1: the four prayers are 天主經、聖母經、聖三光榮經、又聖母經', JSON.stringify(await page.locator('details.nov-pr > summary').allTextContents())
   === JSON.stringify(['天主經', '聖母經', '聖三光榮經', '又聖母經']));
ok('auxilium day 1: the three paragraphs are the open text block', JSON.stringify(await page.locator('.nov-text p').allTextContents()) === JSON.stringify(auText));
ok('auxilium day 1: the mark button says 念完第一天', (await text('#nov-mark')) === '念完第一天');
await page.click('#nov-mark');
await page.waitForSelector('#nov-undo');
ok('auxilium day 1: marking it works', (await text('.nov-done')) === `已於 ${shortOf(TODAY)}念完`);
ok('auxilium day 1 fits the narrow screen', await noHScroll());

// ───────────── 125% 字級：列表、九日敬禮、某一天都不橫向捲動 ─────────────
await reset();
await page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem('mercy.settings.v1') || '{}');
  st.font = 125;
  localStorage.setItem('mercy.settings.v1', JSON.stringify(st));
});
await home();
await page.click('#novena-open');
await page.waitForSelector('.nov-card');
ok('at 125% the list fits without horizontal scroll', await noHScroll());
await page.click('.nov-card[data-id="immaculate"]');
await page.waitForSelector('.nov-day');
ok('at 125% the immaculate novena screen fits without horizontal scroll', await noHScroll());
await page.click('.nov-day[data-n="1"]');
await page.waitForSelector('.nov-day-head');
ok('at 125% a day fits without horizontal scroll', await noHScroll());

console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'no console errors');
ok('no console errors', errors.length === 0);
ok('nothing left the device', outbound.length === 0);
await browser.close();
process.exit(failures || errors.length ? 1 : 0);
