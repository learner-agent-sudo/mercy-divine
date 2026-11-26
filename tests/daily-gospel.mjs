// 每日福音：讀經表的出處（全部算過一遍）、首頁與大廳的今日卡片、今天的畫面（翻天、選節、標已讀、整章、紀錄）。
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { BASE, launch } from './helpers.mjs';

let failures = 0;
const ok = (l, p) => { console.log(`${p ? 'PASS' : 'FAIL ***'}  ${l}`); if (!p) failures++; };
const root = new URL('..', import.meta.url).pathname;

/* ───────────── 一、只看資料（不開瀏覽器）───────────── */

// 讀經經文用同一支解析程式讀一遍，當作標準答案
const bctx = { module: { exports: {} } };
vm.createContext(bctx);
vm.runInContext(readFileSync(`${root}bible-parse.js`, 'utf8'), bctx);
const { BIBLE_BOOKS, parseBook } = bctx.module.exports;
const parsed = (id) => parseBook(readFileSync(root + BIBLE_BOOKS.find((b) => b.id === id).file, 'utf8'));
const parsedCache = new Map();
const bookOf = (id) => { if (!parsedCache.has(id)) parsedCache.set(id, parsed(id)); return parsedCache.get(id); };

// 讀經表：lectionary.js 在 vm 裡跑，它會把 LECTIONARY 掛在 globalThis 上
const lctx = {};
vm.createContext(lctx);
vm.runInContext(readFileSync(`${root}lectionary.js`, 'utf8'), lctx);
const { lectionaryDay, cite, SUNDAY, WEEKDAY, FIXED } = lctx.LECTIONARY;

const REF = /^(\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$/;
const CITE = /^[MKLJ] \S+$/;
const BOOK_OF = { mat: 1, mrk: 1, luk: 1, jhn: 1 };

// 每一卷經文：章:節 的集合，與每一節的次序（章×1000＋節）
const verseSet = (b) => {
  const set = new Set();
  b.chapters.forEach((list, c) => (list || []).forEach((e) => {
    for (let n = e.v; n <= (e.to || e.v); n++) set.add(`${c}:${n}`);
  }));
  return set;
};
const verseSetCache = new Map();
const versesOf = (id) => { if (!verseSetCache.has(id)) verseSetCache.set(id, verseSet(bookOf(id))); return verseSetCache.get(id); };

// 把所有出處的字串找出來（巢狀的物件與陣列都走一遍）
const cites = [];
const walk = (x, where) => {
  if (typeof x === 'string') { if (CITE.test(x)) cites.push([where, x]); }
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) walk(v, `${where}.${k}`);
};
walk(SUNDAY, 'SUNDAY');
walk(WEEKDAY, 'WEEKDAY');
walk(FIXED, 'FIXED');
ok(`every table is walked (${cites.length} citations found)`, cites.length > 300);

// 出處的每一段都要能在經文裡找到：起頭的節一定要有；結尾的節若不在（如 谷 11:26），範圍裡還要有至少一節
const badCites = [];
const absentEnds = [];
for (const [where, s] of cites) {
  let c;
  try { c = cite(s); } catch (e) { badCites.push(`${where} ${s}: ${e.message}`); continue; }
  if (!BOOK_OF[c.book]) { badCites.push(`${where} ${s}: 不認得的書卷 ${c.book}`); continue; }
  const vs = versesOf(c.book);
  for (const ref of c.refs) {
    const m = REF.exec(ref);
    if (!m) { badCites.push(`${where} ${s}: 寫法 ${ref}`); continue; }
    const sc = +m[1], sv = +m[2];
    const ec = m[3] ? +m[3] : sc, ev = m[4] ? +m[4] : sv;
    if (!vs.has(`${sc}:${sv}`)) { badCites.push(`${where} ${s}: 起頭 ${sc}:${sv} 不在 ${c.book}`); continue; }
    if (vs.has(`${ec}:${ev}`)) continue;
    // 結尾不在：範圍裡要至少有一節
    const lo = sc * 1000 + sv, hi = ec * 1000 + ev;
    let any = false;
    for (const k of vs) { const [kc, kv] = k.split(':').map(Number); const o = kc * 1000 + kv; if (o >= lo && o <= hi) { any = true; break; } }
    if (!any) badCites.push(`${where} ${s}: ${ref} 範圍裡一節都沒有`);
    else absentEnds.push(`${where} ${s} → ${ref}`);
  }
}
ok('every citation parses, and each starting verse is in the book', badCites.length === 0);
if (badCites.length) for (const x of badCites.slice(0, 20)) console.log(`       ${x}`);
console.log(`       info: ${absentEnds.length} 個範圍的結尾節不在經文裡（但範圍內還有節）：${absentEnds.slice(0, 4).join('；')}`);

// 2024 至 2040 每一天都有名稱與福音
{
  const bad = [];
  const d = new Date(Date.UTC(2024, 0, 1));
  const end = Date.UTC(2040, 11, 31);
  let n = 0;
  while (d.getTime() <= end) {
    const key = d.toISOString().slice(0, 10);
    n++;
    try {
      const x = lectionaryDay(key);
      if (!x.name || !x.gospel || !x.gospel.label || !x.gospel.refs.length || !BOOK_OF[x.gospel.book]) bad.push(`${key} 沒有名稱或福音`);
    } catch (e) { bad.push(`${key}: ${e.message}`); }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  ok(`every day 2024-01-01 to 2040-12-31 has a name and a gospel (${n} days)`, bad.length === 0);
  if (bad.length) for (const x of bad.slice(0, 10)) console.log(`       ${x}`);
}

// 指定的日子
const SPOT = [
  ['2026-11-26', '常年期第三十四週星期四', '路 21:20-28'],
  ['2026-11-29', '將臨期第一主日', '谷 13:33-37'],
  ['2026-11-30', '聖安德肋宗徒', '瑪 4:18-22'],
  ['2026-12-27', '聖家節', '路 2:22-40'],
  ['2027-01-03', '主顯節', '瑪 2:1-12'],
  ['2027-01-10', '主受洗節', '谷 1:7-11'],
  ['2027-03-21', '聖枝主日（救主受難）', '谷 14:1-15:47'],
  ['2027-04-04', '復活期第二主日（救主慈悲主日）', '若 20:19-31'],
  ['2027-04-05', '預報救主降生', '路 1:26-38'],
  ['2027-05-09', '耶穌升天節', '谷 16:15-20'],
  ['2026-08-03', '常年期第十八週星期一', '瑪 14:22-36'],
  ['2025-04-07', '四旬期第五週星期一', '若 8:12-20'],
  ['2028-03-20', '聖若瑟（聖母淨配）', '瑪 1:16, 18-21, 24a'],
  ['2030-12-09', '聖母無玷始胎', '路 1:26-38'],
  ['2022-06-23', '聖若翰洗者誕辰', '路 1:57-66, 80'],
];
for (const [date, name, label] of SPOT) {
  const x = lectionaryDay(date);
  const got = `${x.name} | ${x.gospel.label}`;
  ok(`${date} → ${name} | ${label}`, got === `${name} | ${label}`);
  if (got !== `${name} | ${label}`) console.log(`       got: ${got}`);
}

/* ───────────── 二、瀏覽器 ───────────── */

const { browser, page, errors } = await launch();
const outbound = [];
// 只看真正的 http(s) 網路請求；localhost 與 blob: 不算離開裝置
page.on('request', (r) => {
  const u = new URL(r.url());
  if (/^https?:$/.test(u.protocol) && u.hostname !== 'localhost') outbound.push(r.url());
});

const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('mercy.bible.v1') || 'null'));
const readCount = async () => {
  const s = await store();
  return s && s.read ? Object.values(s.read).reduce((a, b) => a + b.length, 0) : 0;
};
const title = () => page.textContent('#bible-title');
const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

// 回到乾淨的首頁（先清掉歷史紀錄裡留著的那一層）
async function home() {
  await page.evaluate(() => history.replaceState(null, ''));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#view-home.active');
  await page.waitForFunction(() => /節/.test(document.querySelector('#bible-home-line').textContent));
}
async function openHub() {
  await page.click('#bible-open');
  await page.waitForSelector('.bible-tab');
}
// 一天的經文要算出哪些節：用這一天的出處（頁面算出的）與經文檔算出來的答案比對
const expectKeys = (bookId, refs) => {
  const b = bookOf(bookId);
  const all = [];
  b.chapters.forEach((list, c) => (list || []).forEach((e) => {
    for (let n = e.v; n <= (e.to || e.v); n++) all.push({ key: `${c}:${n}`, o: c * 1000 + n });
  }));
  const out = new Set();
  for (const ref of refs) {
    const m = REF.exec(ref);
    const lo = +m[1] * 1000 + +m[2];
    const hi = (m[3] || m[1]) * 1000 + +(m[4] || m[2]);
    for (const x of all) if (x.o >= lo && x.o <= hi) out.add(x.key);
  }
  return out;
};

// 1. 首頁：今日卡片
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await home();
const today = await page.evaluate(() => {
  const d = lectionaryDay(new Date());
  return { date: d.date, name: d.name, label: d.gospel.label, book: d.gospel.book, refs: d.gospel.refs };
});
console.log(`       today: ${today.date} ${today.name} | ${today.label}`);

await page.waitForSelector('#bible-today:not([hidden])');
ok('首頁的 #bible-today 顯示出來（fresh profile）', await page.isVisible('#bible-today'));
const homeRef = await page.textContent('#bible-today-ref');
ok(`#bible-today-ref 以今天的出處開頭（${homeRef}）`, homeRef.startsWith(today.label));

// 2. 點進今天的畫面
await page.click('#bible-today');
await page.waitForSelector('.bible-day-ref');
ok('今天的畫面的出處與頁面算出的一致', (await page.textContent('.bible-day-ref')) === today.label);
ok('今天的畫面的標題是今天的福音名稱', (await page.textContent('.bible-day-name')) === today.name);

const dayDomKeys = async () => page.$$eval('.bible-day-text .v[data-key]', (els) => els.map((e) => e.dataset.key));
const shown = await dayDomKeys();
const distinct = [...new Set(shown)];
const expected = expectKeys(today.book, today.refs);
const chaptersOK = (() => {
  const chs = new Set(today.refs.map((r) => r.split(':')[0]));
  return distinct.every((k) => chs.has(k.split(':')[0]));
})();
ok(`今天的經文有 ${distinct.length} 節，涵蓋出處要求的每一節（${expected.size} 節）`,
  distinct.length > 0 && [...expected].every((k) => distinct.includes(k)));
ok('每一節都在出處的章裡', chaptersOK);

const pagerBtns = page.locator('.bible-pager button');
ok('今天的 pager 有 ‹ 前一天、今天、後一天 ›', (await pagerBtns.count()) === 3
  && (await pagerBtns.nth(0).textContent()) === '‹ 前一天'
  && (await pagerBtns.nth(1).textContent()) === '今天'
  && (await pagerBtns.nth(2).textContent()) === '後一天 ›');
ok('「今天」按鈕在今天的畫面是停用的', await pagerBtns.nth(1).isDisabled());
ok('相關的經文區塊存在', (await page.locator('.bible-day-rel').count()) === 1);

const dateBefore = await page.textContent('.bible-day-date');
await pagerBtns.nth(2).click();
await page.waitForFunction((d) => document.querySelector('.bible-day-date')?.textContent !== d, dateBefore);
ok('後一天：「今天」按鈕變成可以按', !(await page.locator('.bible-pager button').nth(1).isDisabled()));
await page.locator('.bible-pager button').nth(0).click();
await page.waitForFunction((d) => document.querySelector('.bible-day-date')?.textContent === d, dateBefore);
ok('後一天再前一天：回到同一天的出處', (await page.textContent('.bible-day-ref')) === today.label);
ok('並且又是今天（「今天」按鈕停用）', await page.locator('.bible-pager button').nth(1).isDisabled());

// 3. 選節、標已讀、取消
const vs = page.locator('.bible-day-text .v[data-i]');
ok('今天至少有四節可以選', (await vs.count()) >= 4);
const selKeys = (await vs.evaluateAll((els) => els.map((e) => e.dataset.key))).slice(1, 4);
await vs.nth(1).click();
await vs.nth(3).click();
ok('點第二節、第四節：選到三節', (await page.locator('.bible-day-text .v.sel').count()) === 3);
ok('選取列出現', await page.isVisible('.bible-selbar'));
const selLabel = await page.textContent('.bible-sel-label');
ok(`選取列的字以（3 節）結尾（${selLabel}）`, selLabel.endsWith('（3 節）'));

const readBefore = await readCount();
await page.click('.bible-sel-mark');
await page.waitForFunction(() => document.querySelector('.bible-selbar').hidden);
const isReadKeys = await page.$$eval('.bible-day-text .v.is-read', (els) => els.map((e) => e.dataset.key));
ok('標為已讀：那三節亮起來（is-read）', JSON.stringify([...new Set(isReadKeys)].sort()) === JSON.stringify([...new Set(selKeys)].sort()));
ok('選取列收起來', await page.locator('.bible-selbar').isHidden());
ok('已讀的節數多了三節', (await readCount()) === readBefore + 3);

await vs.nth(1).click();
await vs.nth(3).click();
ok('同樣兩節再選一次：按鈕變成「取消已讀」', (await page.textContent('.bible-sel-mark')) === '取消已讀');
await page.click('.bible-sel-mark');
ok('取消已讀：亮的節都熄掉', (await page.locator('.bible-day-text .v.is-read').count()) === 0);
ok('已讀的節數回到原來', (await readCount()) === readBefore);

// 4. 讀完了
ok('「讀完了」按鈕在經文下面', (await page.locator('.bible-done').count()) === 1);
await page.click('.bible-done');
await page.waitForFunction(() => document.querySelector('.bible-done')?.textContent === '✓ 已讀');
ok('按了之後是「✓ 已讀」', (await page.textContent('.bible-done')) === '✓ 已讀');

await page.click('#bible-back');
await page.waitForSelector('#view-home.active');
ok('回首頁：#bible-today-ref 以 ✓ 結尾', (await page.textContent('#bible-today-ref')).endsWith(' ✓'));
await page.click('#bible-open');
await page.waitForSelector('#bible-today-card');
ok('回大廳：今日卡片的狀態是「✓ 已讀」', (await page.textContent('#bible-today-card .btc-state')) === '✓ 已讀');
await page.click('#bible-back');
await page.waitForSelector('#view-home.active');

// 5. 章：整章讀完、部分讀完的標記
await page.click('#bible-open');
await page.waitForSelector('.glass-lancet[data-book="mat"]');
await page.click('.glass-lancet[data-book="mat"]');
await page.waitForSelector('.ch-btn');
ok('瑪竇福音的章按鈕有 28 個', (await page.locator('.ch-btn').count()) === 28);
await page.click('.ch-btn[data-c="2"]');
await page.waitForSelector('.bible-ch-done');
await page.click('.bible-ch-done');
await page.waitForFunction(() => document.querySelector('.bible-ch-done')?.textContent === '✓ 第二章都讀過了');
ok('整章讀完：按鈕變成「✓ 第二章都讀過了」', (await page.textContent('.bible-ch-done')) === '✓ 第二章都讀過了');
await page.goBack();
await page.waitForSelector('.ch-btn');
ok('回到書卷：第 2 章的按鈕是 all', (await page.getAttribute('.ch-btn[data-c="2"]', 'data-state')) === 'all');
await page.goBack();
await page.waitForSelector('.glass-lancet[data-book="mat"]');
ok('回大廳：瑪竇的窗上第 2 塊玻璃亮了', (await page.locator('.glass-lancet[data-book="mat"] rect.glass-lit[data-c="2"]').count()) === 1);

await page.click('.glass-lancet[data-book="mrk"]');
await page.waitForSelector('.ch-btn');
await page.click('.ch-btn[data-c="8"]');
await page.waitForSelector('.bible-sec');
ok('谷 8 章有一處「這一章的部分」（跨到 9:1）', (await page.locator('.bible-part-done').count()) === 1);
await page.goBack();
await page.waitForSelector('.ch-btn');
await page.goBack();
await page.waitForSelector('.glass-lancet');

// 6. 紀錄：在別處讀的經文
await home();
await openHub();
await page.click('.bible-tab[data-tab="log"]');
await page.waitForSelector('details.bible-addlog summary');
await page.click('details.bible-addlog summary');
await page.waitForSelector('.bal-save');
const logBefore = await page.locator('.bl-row').count();
const want = ['2:1', '2:2', '2:3', '2:4', '2:5', '2:6', '2:7'];
const lukBefore = (await store())?.read?.luk || [];
ok('存檔前，路加 2:1–7 還沒有標記', want.every((k) => !lukBefore.includes(k)));
await page.selectOption('.bal-book', 'luk');
await page.selectOption('.bal-ch', '2');
await page.selectOption('.bal-from', '1');
await page.selectOption('.bal-to', '7');
await page.click('.bal-save');
await page.waitForFunction(() => [...document.querySelectorAll('.bl-ref')].some((e) => e.textContent === '路 2:1-7'));
ok('新增一筆紀錄，寫著「路 2:1-7」', (await page.locator('.bl-row').count()) === logBefore + 1
  && (await page.locator('.bl-row', { has: page.locator('.bl-ref', { hasText: '路 2:1-7' }) }).count()) === 1);
const lukAfter = (await store())?.read?.luk || [];
ok('路加 2:1–7 這七節都在 mercy.bible.v1 裡', want.every((k) => lukAfter.includes(k)));

// 7. 390 px 寬：今天的畫面不橫向捲動
await page.setViewportSize({ width: 390, height: 844 });
await home();
await page.click('#bible-today');
await page.waitForSelector('.bible-day-ref');
ok('390 px 寬的今天畫面沒有橫向捲動', await noHScroll());
await page.setViewportSize({ width: 393, height: 852 });

// 8. 沒有錯誤、沒有資料離開裝置
ok('no request left the machine', outbound.length === 0);
if (outbound.length) console.log(`       outbound: ${outbound.slice(0, 5).join(' ')}`);
ok('no console errors', errors.length === 0);
if (errors.length) console.log(`       ${errors.join('; ')}`);
console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'no console errors');

await browser.close();
process.exit(failures || errors.length ? 1 : 0);
