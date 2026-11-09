// 修和聖事：首頁的卡片、步驟、告明時的次序與金線、痛悔經、今天已辦告解、重新載入、返回鍵、移除日期。
import { BASE, launch } from './helpers.mjs';

const ok = (l, p) => { console.log(`${p ? 'PASS' : 'FAIL ***'}  ${l}`); if (!p) failures++; };
let failures = 0;

// 不啟用離線快取：下面要攔截資料檔換成兩式的版本，快取的回應攔不到（離線與快取另有 offline 測試）
const { browser, page, errors, autoDialog } = await launch({ serviceWorkers: 'block' });
const outbound = [];
page.on('request', (r) => { if (new URL(r.url()).hostname !== 'localhost') outbound.push(r.url()); });

// 日期用本機時間算，和程式一樣
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return dayKey(d); };
const TODAY = dayKey(new Date());
const thisYear = new Date().getFullYear();
const fullOf = (k) => { const [y, m, d] = k.split('-').map(Number); return `${y}年${m}月${d}日`; };
const shortOf = (k) => (k.slice(0, 4) === String(thisYear) ? fullOf(k).replace(/^\d{4}年/, '') : fullOf(k));

const dates = () => page.evaluate(() => {
  const raw = localStorage.getItem('mercy.confession.v1');
  return raw ? JSON.parse(raw).dates : null;
});
const homeLine = () => page.textContent('#confession-home-line');
const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const tabOn = async (id) => page.getAttribute(`.conf-tab[data-tab="${id}"]`, 'aria-selected');
const lines = () => page.locator('li.conf-line');

// 回到乾淨的首頁（重新載入會回到歷史紀錄裡留著的那一層，所以先清掉）
async function home() {
  await page.evaluate(() => history.replaceState(null, ''));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#view-home.active');
}
async function reset() {
  await page.evaluate(() => localStorage.clear());
  await home();
}

// ───────────── 首頁的卡片 ─────────────
await page.goto(BASE, { waitUntil: 'networkidle' });
await reset();
ok('home has the 修和聖事 card', (await page.textContent('#confession-home .bible-home-title')) === '修和聖事');
ok('with the first-visit line', (await homeLine()) === '辦告解前的準備與步驟');
ok('with 準備辦告解 and 告明時', (await page.textContent('#confession-steps')) === '準備辦告解'
   && (await page.textContent('#confession-rite')) === '告明時');
ok('the card sits after 讀經', await page.evaluate(() =>
  document.querySelector('#bible-home').getBoundingClientRect().bottom <= document.querySelector('#confession-home').getBoundingClientRect().top + 1));
ok('the card fits the narrow screen', await noHScroll());

// ───────────── 步驟 ─────────────
await page.click('#confession-steps');
await page.waitForSelector('details.conf-step');
ok('準備辦告解 opens the confession screen on 步驟', await page.isVisible('#view-confession.active') && (await tabOn('steps')) === 'true');
ok('with the title in the bar', (await page.textContent('#view-confession .bar-title')) === '修和聖事');
const names = await page.locator('details.conf-step .conf-name').allTextContents();
ok('six cards in order: 省察 痛悔 定改 告明 赦罪 補贖', names.join(' ') === '1 省察 2 痛悔 3 定改 4 告明 5 赦罪 6 補贖');
ok('all the cards start closed', (await page.locator('details.conf-step[open]').count()) === 0);
ok('each card shows its lead line in the summary', (await page.textContent('details.conf-step[data-step="resolve"] summary')).includes('立定志向'));
await page.click('details.conf-step[data-step="contrition"] summary');
const pts = await page.locator('details.conf-step[data-step="contrition"] .conf-points li').count();
ok('a card opens and shows its points', pts === 3 && (await page.textContent('details.conf-step[data-step="contrition"] .conf-points')).includes('上等痛悔'));
ok('the step cards fit the narrow screen', await noHScroll());

// 告明：步驟 4 的按鈕切到告明時
await page.click('details.conf-step[data-step="confess"] summary');
await page.click('details.conf-step[data-step="confess"] .conf-go');
await page.waitForSelector('li.conf-line');
ok('告明時的步驟 switches the tab to 告明時', (await tabOn('rite')) === 'true' && (await tabOn('steps')) === 'false');
ok('the rite has ten numbered steps', (await lines().count()) === 10);
ok('each step has a role label', (await lines().nth(0).locator('.conf-role').textContent()) === '懺悔者'
   && (await lines().nth(1).locator('.conf-role').textContent()) === '神父'
   && (await lines().nth(2).locator('.conf-role').textContent()) === '懺悔者');
ok('the stage direction is there, muted', (await lines().nth(1).locator('.conf-do').textContent()) === '神父可用聖經提示懺悔者放心告明。');
ok('the penitent speaks in the gold-bordered quote', (await page.locator('li.conf-line[data-who="penitent"] blockquote.conf-quote.key').count()) === 5);
ok('the priest speaks in a plain quote', (await page.locator('li.conf-line[data-who="priest"] blockquote.conf-quote:not(.key)').count()) === 2
   && (await page.locator('li.conf-line[data-who="priest"] .conf-quote.key').count()) === 0);
ok('step 3 has no hint when there is no record', (await lines().nth(2).locator('.conf-fill').count()) === 0);
ok('step 5 shows the 痛悔經 text', (await lines().nth(4).locator('.conf-quote').textContent()).includes('全心痛悔'));
ok('with only one act, no choice buttons', (await page.locator('.conf-acts').count()) === 0);
ok('no records yet, and the line says so', (await page.textContent('.conf-dates')) === '還沒有記下過告解。');
ok('the rite fits the narrow screen', await noHScroll());

// ───────────── 今天已辦告解 ─────────────
await page.click('#conf-today');                       // 對話框預設按確定
await page.waitForSelector('.conf-fill');
ok('the day is recorded as a local date', JSON.stringify(await dates()) === JSON.stringify([TODAY]));
ok('step 3 shows the hint with 今天', (await lines().nth(2).locator('.conf-fill').textContent()) === `上次告解：${fullOf(TODAY)}，今天`);
ok('the list shows the day and a remove link', (await page.textContent('.conf-dates')).includes(fullOf(TODAY))
   && (await page.locator('.conf-rm').count()) === 1);
ok('a toast confirms it', (await page.textContent('#toast')) === '已記下今天的告解');

await page.click('#confession-back');
await page.waitForSelector('#view-home.active');
ok('the back button returns home', await page.isVisible('#view-home.active'));
ok('and the home line shows the day', (await homeLine()) === `上次告解：${shortOf(TODAY)}（今天）`);

// 重新載入：停在原來那一頁，紀錄還在
await page.click('#confession-rite');
await page.waitForSelector('li.conf-line');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('li.conf-line');
ok('a reload comes back to the 告明時 screen', (await page.isVisible('#view-confession.active')) && (await tabOn('rite')) === 'true');
ok('and the record is still there', (await lines().nth(2).locator('.conf-fill').textContent()) === `上次告解：${fullOf(TODAY)}，今天`);

// ───────────── 取消移除 ─────────────
autoDialog(false);
page.once('dialog', (d) => d.dismiss());
await page.click('.conf-rm');
autoDialog(true);
ok('cancelling the remove keeps the day', JSON.stringify(await dates()) === JSON.stringify([TODAY]));

// ───────────── 移除日期 ─────────────
await page.click('.conf-rm');
await page.waitForSelector('.conf-dates:has-text("還沒有記下過告解。")');
ok('removing a date takes it out', JSON.stringify(await dates()) === '[]');
ok('its hint goes with it', (await lines().nth(2).locator('.conf-fill').count()) === 0);
await page.click('#confession-back');
await page.waitForSelector('#view-home.active');
ok('and the home line goes back to the first-visit text', (await homeLine()) === '辦告解前的準備與步驟');

// ───────────── 相隔多久的說法 ─────────────
for (const [n, want] of [[10, '10 天前'], [40, '5 週前'], [200, `${Math.floor(200 / 30.44)} 個月前`]]) {
  const day = daysAgo(n);
  await page.evaluate((d) => localStorage.setItem('mercy.confession.v1', JSON.stringify({ dates: [d] })), day);
  await home();
  ok(`${n} days ago reads as "${want}"`, (await homeLine()) === `上次告解：${shortOf(day)}（${want}）`);
}
await page.evaluate(() => localStorage.removeItem('mercy.confession.v1'));
await home();
ok('a hint 40 days old reads 約 5 週前', await (async () => {
  await page.evaluate((d) => localStorage.setItem('mercy.confession.v1', JSON.stringify({ dates: [d] })), daysAgo(40));
  await home();
  await page.click('#confession-rite');
  await page.waitForSelector('li.conf-line');
  return (await lines().nth(2).locator('.conf-fill').textContent()) === `上次告解：${fullOf(daysAgo(40))}，約 5 週前`;
})());
await page.evaluate(() => localStorage.removeItem('mercy.confession.v1'));

// 痛悔經有好幾式：攔下資料檔，改成兩式，按的那一式記在設定裡
const real = await (await fetch(`${BASE}data/confession.json`)).json();
const two = { ...real, acts: [{ title: '一式', text: '第一式的經文' }, { title: '二式', text: '第二式的經文' }] };
await page.route('**/data/confession.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(two) }));
await page.evaluate(() => localStorage.removeItem('mercy.settings.v1'));
await home();
await page.click('#confession-rite');
await page.waitForSelector('li.conf-line');
ok('with two acts, a choice button for each', (await page.locator('.conf-act-btn').allTextContents()).join() === '一式,二式');
ok('the first one is chosen at the start', (await page.getAttribute('.conf-act-btn >> nth=0', 'aria-pressed')) === 'true');
ok('and its text is shown', (await lines().nth(4).locator('.conf-quote').textContent()) === '第一式的經文');
await page.click('.conf-act-btn >> nth=1');
await page.waitForSelector('.conf-act-btn[aria-pressed="true"]:has-text("二式")');
ok('choosing the second switches the text', (await lines().nth(4).locator('.conf-quote').textContent()) === '第二式的經文');
ok('and the choice is remembered in settings', await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.settings.v1')).actOfContrition === 1));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('li.conf-line');
ok('the choice survives a reload', (await lines().nth(4).locator('.conf-quote').textContent()) === '第二式的經文');
await page.unroute('**/data/confession.json');
await page.evaluate(() => localStorage.removeItem('mercy.settings.v1'));

// 資料檔無法載入：顯示一句話與再試一次，不影響其他部分
await page.route('**/data/confession.json', (route) => route.fulfill({ status: 404, body: 'missing' }));
await home();
await page.click('#confession-steps');
await page.waitForSelector('#confession-body button:has-text("再試一次")');
ok('a missing data file shows a short message and a retry', (await page.textContent('#confession-body .empty')) === '無法載入修和聖事的資料檔案。');
await page.unroute('**/data/confession.json');
await page.click('#confession-back');
await page.waitForSelector('#view-home.active');
ok('the back button still returns home', await page.isVisible('#view-home.active'));
ok('and the rest of the app still works', await page.isVisible('#bible-home') && (await page.textContent('#bible-home .bible-home-title')) === '讀經');

console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'no console errors');
ok('nothing left the device', outbound.length === 0);
await browser.close();
process.exit(failures || errors.length ? 1 : 0);
