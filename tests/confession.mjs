// 修和聖事：首頁的卡片、步驟、告明時的次序與金線、痛悔經、今天已辦告解、重新載入、返回鍵、移除日期。
import { readFileSync } from 'node:fs';
import { BASE, launch } from './helpers.mjs';

const ok = (l, p) => { console.log(`${p ? 'PASS' : 'FAIL ***'}  ${l}`); if (!p) failures++; };
let failures = 0;

// 不啟用離線快取：下面要攔截資料檔換成兩式的版本，快取的回應攔不到（離線與快取另有 offline 測試）
const { browser, page, errors, autoDialog } = await launch({ serviceWorkers: 'block', acceptDownloads: true });
// 資料檔本身：下面的斷言拿它當標準答案
const real = await (await fetch(`${BASE}data/confession.json`)).json();
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
// 款目的卡片：沒開才點開（點一下會收起來）
const openSec = async (id) => { if ((await page.getAttribute(`details.cx-sec[data-sec="${id}"]`, 'open')) === null) await page.click(`details.cx-sec[data-sec="${id}"] summary`); };

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
ok('step 5 shows the default 痛悔經 text (痛悔經（二）)', (await lines().nth(4).locator('.conf-quote').textContent()).includes('全心痛悔'));
ok('with six acts, six choice buttons', (await page.locator('.conf-act-btn').count()) === 6);
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

// ───────────── 省察 ─────────────
await home();
await page.click('#confession-steps');
await page.waitForSelector('details.conf-step');
ok('the tabs run 步驟 · 省察 · 告明時', (await page.locator('.conf-tab').allTextContents()).join(' · ') === '步驟 · 省察 · 告明時');
await page.click('details.conf-step[data-step="examine"] summary');
await page.click('details.conf-step[data-step="examine"] .conf-go');
await page.waitForSelector('.cx-form');
ok('開始省察 switches to 省察', (await tabOn('exam')) === 'true' && (await tabOn('steps')) === 'false');
ok('第一式 is chosen by default', (await page.textContent('.cx-form[aria-pressed="true"] .cx-form-name')) === '第一式');
ok('each form has its sub line', (await page.locator('.cx-form-sub').allTextContents()).join('|') === real.exams.map((e) => e.sub).join('|'));
await page.click('.cx-form >> nth=1');
await page.waitForSelector('.cx-form[aria-pressed="true"]:has-text("第二式")');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.cx-form');
ok('the choice of 第二式 persists across a reload', (await page.textContent('.cx-form[aria-pressed="true"] .cx-form-name')) === '第二式');
ok('and its angle is the hint line', (await page.textContent('.cx-angle')) === real.exams[1].angle);
await page.click('.cx-form >> nth=0');
await page.waitForSelector('.cx-form[aria-pressed="true"]:has-text("第一式")');
ok('第一式 has the 天主十誡 card with ten lines', (await page.locator('details.cx-dec').count()) === 1
   && (await page.locator('details.cx-dec li').count()) === 10);
ok('the lines are numbered on from group to group (1, then 4)', (await page.locator('ol.cx-dec-lines').evaluateAll((os) => os.map((o) => o.start).join())) === '1,4');
const secTitles = await page.locator('details.cx-sec .cx-sum-title').allTextContents();
ok('第一式 has 第一誡 … 第十誡, 聖教四規 and 七罪宗', secTitles.join('|') === [
  '第一誡', '第二誡', '第三誡', '第四誡', '第五誡', '第六、九誡', '第七誡', '第八誡', '第十誡',
  '聖教四規', '驕傲', '慳吝', '迷色', '憤怒', '貪饕', '嫉妒', '懶惰'].join('|'));
ok('its parts are 天主十誡, 聖教四規 and 七罪宗', (await page.locator('.cx-part-title').allTextContents()).join('|') === '天主十誡|聖教四規|七罪宗');
ok('第六、九誡 carries its law in the summary', (await page.textContent('details.cx-sec[data-sec="one/c69"] .cx-sum-law')).includes('毋行邪淫；毋願他人妻'));
ok('the exam fits the narrow screen', await noHScroll());

// 勾選：打開第一誡，勾第一條，數字跟著變
await openSec('one/c1');
await page.click('[role="checkbox"][data-key="one/c1/0"]');
await page.waitForSelector('[role="checkbox"][data-key="one/c1/0"][aria-checked="true"]');
ok('a tick marks the item and counts it in the section', (await page.textContent('details.cx-sec[data-sec="one/c1"] .cx-count')) === '已勾 1');
await page.click('[data-key="one/c1/0"][data-act="plus"]');
await page.waitForSelector('[role="checkbox"][data-key="one/c1/0"]:has-text("×2")');
ok('the stepper goes to 2 and the row shows ×2', (await page.textContent('.cx-step .cx-n')) === '2');
await page.click('[data-key="one/c1/0"][data-act="minus"]');
await page.waitForSelector('[role="checkbox"][data-key="one/c1/0"]:not(:has-text("×2"))');
ok('minus brings it back to 1', (await page.textContent('.cx-step .cx-n')) === '1');
await page.click('[data-key="one/c1/0"][data-act="minus"]');
ok('minus at 1 does nothing: still ticked, still 1', (await page.getAttribute('[role="checkbox"][data-key="one/c1/0"]', 'aria-checked')) === 'true'
   && (await page.textContent('.cx-step .cx-n')) === '1');
await page.click('[role="checkbox"][data-key="one/c1/1"]');
await page.waitForSelector('[role="checkbox"][data-key="one/c1/1"][aria-checked="true"]');
await page.fill('#cx-note', '為家人祈禱\n第二行');
await page.waitForFunction(() => JSON.parse(localStorage.getItem('mercy.examen.v1')).note.includes('第二行'));

// 重新載入：勾選與自己寫的內容都還在
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#cx-note');
ok('after a reload the note is there, line breaks and all', (await page.inputValue('#cx-note')) === '為家人祈禱\n第二行');
ok('and the ticks too, with their count', (await page.getAttribute('[role="checkbox"][data-key="one/c1/0"]', 'aria-checked')) === 'true'
   && (await page.getAttribute('[role="checkbox"][data-key="one/c1/1"]', 'aria-checked')) === 'true'
   && (await page.textContent('details.cx-sec[data-sec="one/c1"] .cx-count')) === '已勾 2');

// 告明時第 3 步：我的省察
await page.click('.conf-tab[data-tab="rite"]');
await page.waitForSelector('.cx-mine-list');
const mine = await page.locator('.cx-mine-item').allTextContents();
ok('step 3 lists the ticks with their source', mine.length === 2 && mine[0].includes('不信天主') && mine[0].includes('第一式 · 第一誡')
   && mine[1].includes('思疑天主的道理') && mine[1].includes('第一式 · 第一誡'));
ok('and the note, line breaks kept', (await page.textContent('.cx-mine-note')) === '為家人祈禱\n第二行');
await page.click('.conf-link');
ok('去省察 switches to 省察', (await tabOn('exam')) === 'true');

// 今天已辦告解：清除勾選與自己寫的內容（確認的文字要對）
await page.click('.conf-tab[data-tab="rite"]');
await page.waitForSelector('#conf-today');
let asked = '';
page.once('dialog', (d) => { asked = d.message(); });
await page.click('#conf-today');
await page.waitForFunction(() => { const r = JSON.parse(localStorage.getItem('mercy.examen.v1')); return Object.keys(r.ticks).length === 0 && r.note === ''; });
ok('今天已辦告解 asks with the warning about the ticks', asked === '記下今天辦了告解？省察的勾選和自己寫的內容會一併清除。');
ok('it records the day and clears the ticks and the note', JSON.stringify(await dates()) === JSON.stringify([TODAY]));

// 備份：不含省察的資料
await page.click('.conf-tab[data-tab="exam"]');
await openSec('one/c1');
await page.click('[role="checkbox"][data-key="one/c1/0"]');
await page.fill('#cx-note', '不要進備份');
await page.click('#confession-back');
await page.waitForSelector('#view-home.active');
await page.click('[data-go="settings"]');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export-btn')]);
const exportText = readFileSync(await dl.path(), 'utf8');
const exported = JSON.parse(exportText);
ok('the backup carries the confession day', JSON.stringify(exported.confession) === JSON.stringify({ dates: [TODAY] }));
ok('but no 省察 data: no examen key, no ticks, no note', !('examen' in exported) && !exportText.includes('mercy.examen')
   && !exportText.includes('不信天主') && !exportText.includes('不要進備份'));
await page.click('#view-settings [data-go="home"]');

// 日期已記過：還有勾選時仍可清除（同樣的確認文字）
await page.click('#confession-rite');
await page.waitForSelector('#conf-today');
let asked2 = '';
page.once('dialog', (d) => { asked2 = d.message(); });
await page.click('#conf-today');
await page.waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem('mercy.examen.v1')).ticks).length === 0);
ok('a day already recorded still offers to clear the ticks', asked2 === '清除所有勾選和自己寫的內容？');

// 清除勾選：一次清空勾選與自己寫的內容
await page.click('.conf-tab[data-tab="exam"]');
await openSec('one/c1');
await page.click('[role="checkbox"][data-key="one/c1/0"]');
await page.fill('#cx-note', 'y');
let asked3 = '';
page.once('dialog', (d) => { asked3 = d.message(); });
await page.click('#cx-clear');
await page.waitForFunction(() => { const r = JSON.parse(localStorage.getItem('mercy.examen.v1')); return Object.keys(r.ticks).length === 0 && r.note === ''; });
ok('清除勾選 asks first, then empties ticks and the note', asked3 === '清除所有勾選和自己寫的內容？'
   && (await page.locator('[role="checkbox"][aria-checked="true"]').count()) === 0 && (await page.inputValue('#cx-note')) === '');

// 第二式、第三式也要能開（不攔截資料，只看畫面）
await page.click('.cx-form >> nth=2');
await page.waitForSelector('.cx-form[aria-pressed="true"]:has-text("第三式")');
ok('第三式 opens with its parts and no 天主十誡 card', (await page.locator('details.cx-dec').count()) === 0
   && (await page.locator('.cx-part-title').count()) === 1);
await page.click('.cx-form >> nth=0');
await page.waitForSelector('.cx-form[aria-pressed="true"]:has-text("第一式")');

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

// 痛悔經：六式，預設 acts[actDefault]（第二式）；選的那一式記在設定裡；每一行各成一段
await page.evaluate(() => localStorage.removeItem('mercy.settings.v1'));
await home();
await page.click('#confession-rite');
await page.waitForSelector('li.conf-line');
ok('six small buttons 一 to 六', (await page.locator('.conf-act-btn').allTextContents()).join('') === '一二三四五六');
ok('the default is acts[1], 痛悔經（二）', (await page.getAttribute('.conf-act-btn >> nth=1', 'aria-pressed')) === 'true'
   && (await lines().nth(4).locator('.conf-act-title').textContent()) === real.acts[1].title);
ok('and its text is shown', (await lines().nth(4).locator('blockquote').textContent()).includes(real.acts[1].text.slice(0, 20)));
await page.click('.conf-act-btn >> nth=4');
await page.waitForSelector('.conf-act-btn[aria-pressed="true"]:has-text("五")');
ok('acts[4] has a paragraph for each of its two lines', (await lines().nth(4).locator('blockquote p').count()) === 2);
ok('choosing 五 is remembered in settings', await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.settings.v1')).actOfContrition === 4));
ok('the six buttons fit the narrow screen', await noHScroll());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('li.conf-line');
ok('the choice survives a reload', (await page.getAttribute('.conf-act-btn >> nth=4', 'aria-pressed')) === 'true');
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
