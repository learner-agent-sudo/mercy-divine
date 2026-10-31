// 讀經：書卷、章、事件對照、已讀進度、搜尋、返回鍵、備份匯入的檢查，以及單檔預覽版也能開。
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { BASE, launch } from './helpers.mjs';

const ok = (l, p) => { console.log(`${p ? 'PASS' : 'FAIL ***'}  ${l}`); if (!p) failures++; };
let failures = 0;
const root = new URL('..', import.meta.url).pathname;

// 經文用同一支解析程式讀一遍，當作標準答案
const ctx = { module: { exports: {} } };
vm.createContext(ctx);
vm.runInContext(readFileSync(`${root}bible-parse.js`, 'utf8'), ctx);
const { BIBLE_BOOKS, parseBook } = ctx.module.exports;
const parsed = (id) => parseBook(readFileSync(root + BIBLE_BOOKS.find((b) => b.id === id).file, 'utf8'));
const ABBR = Object.fromEntries(BIBLE_BOOKS.map((b) => [b.id, b.abbr]));

const hasEvents = existsSync(`${root}data/gospel-events.json`);
const events = hasEvents ? JSON.parse(readFileSync(`${root}data/gospel-events.json`, 'utf8')) : null;
// 用出處找事件，不用代號
const eventByRef = (book, range) => events.events.find((e) => (e.refs[book] || []).includes(range));
// 哪一件事的哪一卷包含這一節（範圍寫法：'5:3'、'5:1-12'、'8:34-9:1'）
const covers = (range, c, v) => {
  const m = /^(\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$/.exec(range);
  const o = c * 1000 + v;
  return !!m && m[1] * 1000 + +m[2] <= o && o <= (m[3] || m[1]) * 1000 + +(m[4] || m[2]);
};
const eventAt = (book, c, v) => events.events.find((e) => (e.refs[book] || []).some((r) => covers(r, c, v)));

// 人物：只假設 peter 和他的五段話（別的人與話是另一邊在補）
const hasPeople = existsSync(`${root}data/people.json`);
const peopleData = hasPeople ? JSON.parse(readFileSync(`${root}data/people.json`, 'utf8')) : null;
const sayingOf = (id) => peopleData.people.flatMap((p) => p.stages.flatMap((g) => g.sayings)).find((x) => x.id === id);
const verseText = (book, c, v) => parsed(book).chapters[c].filter((e) => e.v === v).map((e) => e.t).join('');

const { browser, page, errors } = await launch();
const outbound = [];
page.on('request', (r) => { if (new URL(r.url()).hostname !== 'localhost') outbound.push(r.url()); });

const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('mercy.bible.v1') || 'null'));
const title = () => page.textContent('#bible-title');
const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

// 回到乾淨的首頁（重新載入會回到歷史紀錄裡留著的那一層，所以先把它清掉）
async function home() {
  await page.evaluate(() => history.replaceState(null, ''));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#view-home.active');
  await page.waitForFunction(() => /節/.test(document.querySelector('#bible-home-line').textContent));
}
async function reset() {
  await page.evaluate(() => localStorage.clear());
  await home();
}
async function hubTab(tab) {
  if (!(await page.isVisible('.bible-tab'))) { await page.click('#bible-open'); await page.waitForSelector('.bible-tab'); }
  await page.click(`.bible-tab[data-tab="${tab}"]`);
}
async function openHub() {
  await page.click('#bible-open');
  await page.waitForSelector('.bible-tab');
  await hubTab('books');
  await page.waitForSelector('.bible-book');
}
async function openChapter(book, c) {
  await home();
  await openHub();
  await page.click(`.bible-book[data-book="${book}"]`);
  await page.click(`.ch-btn[data-c="${c}"]`);
  await page.waitForSelector('.bible-sec');
}
const secOf = (text) => page.locator(`.bible-sec:has(.bible-sec-title:has-text("${text}"))`);

// ───────────── 首頁的卡片 ─────────────
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('#view-home.active');
ok('home has the 讀經 card', await page.isVisible('#bible-home') && (await page.textContent('#bible-home .bible-home-title')) === '讀經');
ok('with 繼續讀 and 打開讀經', (await page.textContent('#bible-continue')) === '繼續讀' && (await page.textContent('#bible-open')) === '打開讀經');
ok('the card sits between the 補記 button and the stats', await page.evaluate(() => {
  const y = (s) => document.querySelector(s).getBoundingClientRect().top;
  return y('#manual-btn') < y('#bible-home') && y('#bible-home') < y('#home-stats');
}));
await page.waitForFunction(() => /節/.test(document.querySelector('#bible-home-line').textContent));
ok('it shows the total number of verses once loaded', /4,780/.test(await page.textContent('#bible-home-line')));
ok('the prayers are still there beside it', await page.isVisible('#start-btn') && (await page.locator('#set-picker button').count()) === 2);

// ───────────── 大廳 ─────────────
await openHub();
ok('the hub opens', await page.isVisible('#view-bible.active') && (await title()) === '讀經');
const books = await page.locator('.bible-book .bb-name').allTextContents();
ok('five books are listed', books.length === 5);
ok('named the 思高 way', books.join('、') === '瑪竇福音、馬爾谷福音、路加福音、若望福音、宗徒大事錄');
ok('with the overall progress and a 繼續讀 button', /已讀 0／4,780 節（0%）/.test(await page.textContent('.bible-sum-line'))
   && (await page.textContent('#bible-hub-continue')) === '繼續讀');
ok('the tabs are there, 人物 between 主題 and 紀錄', (await page.locator('.bible-tab').allTextContents()).join('') === (hasPeople ? '書卷事件主題人物紀錄' : '書卷事件主題紀錄'));
ok('and they fit in one row', await page.evaluate(() => {
  const t = [...document.querySelectorAll('.bible-tab')].map((b) => b.getBoundingClientRect());
  return t.every((r) => r.top === t[0].top && r.right <= innerWidth);
}));
ok('the source notice is linked in the footer', await page.locator('.bible-foot a[href$="bible/README.md"]').count() === 1);
await page.click('.bible-foot a');
await page.waitForFunction(() => /思高/.test(document.querySelector('.bible-foot .bible-notice').textContent));
ok('which opens the notice right there', /GNU/.test(await page.textContent('.bible-foot .bible-notice')));
ok('the hub fits the narrow screen', await noHScroll());

// ───────────── 瑪竇福音 第五章 ─────────────
await page.click('.bible-book[data-book="mat"]');
await page.waitForSelector('.ch-btn');
ok('the book screen has 28 chapter buttons', (await page.locator('.ch-btn').count()) === 28);
await page.click('.ch-btn[data-c="5"]');
await page.waitForSelector('.bible-sec');
ok('chapter title', (await title()) === '瑪竇福音 第五章');
ok('the section 真福八端 is there', (await secOf('真福八端').count()) === 1);
ok('with its larger heading above', (await page.locator('.bible-part').allTextContents()).includes('山中聖訓'));
ok('and 48 verses in the chapter', (await page.locator('.bible-text .v').count()) === 48);
ok('the chapter fits the narrow screen', await noHScroll());
const beatSec = secOf('真福八端');
const beatIdx = Number(await beatSec.getAttribute('data-sec'));
ok('the section starts at verse 1', (await beatSec.locator('.v').first().getAttribute('data-key')) === '5:1');

// 標記已讀
ok('the button starts as 讀完了', (await beatSec.locator('.bible-done').textContent()) === '讀完了');
await beatSec.locator('.bible-done').click();
ok('marking toasts the reference', (await page.textContent('#toast')) === '已記下：瑪 5:1-12');
ok('the button becomes ✓ 已讀', (await beatSec.locator('.bible-done').textContent()) === '✓ 已讀');
let saved = await store();
ok('twelve verses are saved', saved.read.mat.length === 12 && saved.read.mat.includes('5:1') && saved.read.mat.includes('5:12'));
ok('one log entry with the section title', saved.log.length === 1 && saved.log[0].title === '真福八端'
   && saved.log[0].from === '5:1' && saved.log[0].to === '5:12' && saved.log[0].book === 'mat');
ok('and the place is remembered', saved.last.book === 'mat' && saved.last.c === 5);

// 重新載入：回到原來那一章，已讀的還在；返回鍵一層一層退回去，每一層都帶著新的進度
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.bible-sec');
ok('a reload comes back to the same chapter', (await title()) === '瑪竇福音 第五章' && (await page.isVisible('#view-bible.active')));
ok('the section is still ✓ 已讀', (await secOf('真福八端').locator('.bible-done').textContent()) === '✓ 已讀');
await page.goBack();
await page.waitForSelector('.ch-grid');
ok('back from it is the book, with the chapter half-filled', (await page.getAttribute('.ch-btn[data-c="5"]', 'data-state')) === 'part');
await page.goBack();
await page.waitForSelector('.bible-tab');
ok('then the hub with the progress', /已讀 12／4,780/.test(await page.textContent('.bible-sum-line')));
ok('and the book list', /12／1,071/.test(await page.locator('.bible-book[data-book="mat"] .bb-sub').textContent()));
await page.goBack();
await page.waitForSelector('#view-home.active');
ok('then home, with the progress on the card', /已讀 12／4,780 節（0%）/.test(await page.textContent('#bible-home-line')));

// 繼續讀：從上次的那一章起，找第一段沒讀完的
await page.click('#bible-continue');
await page.waitForSelector('.bible-sec');
const cont = await page.evaluate(() => ({ st: history.state.bible, title: document.querySelector('#bible-title').textContent }));
ok('繼續讀 opens the chapter you were in', cont.title === '瑪竇福音 第五章' && cont.st.screen === 'chapter');
ok('at the next section you have not finished', cont.st.sec === beatIdx + 1
   && (await page.locator(`.bible-sec[data-sec="${cont.st.sec}"] .v`).first().getAttribute('data-key')) === '5:13');
ok('scrolled so that it is in view', await page.evaluate((i) => {
  const r = document.querySelector(`.bible-sec[data-sec="${i}"]`).getBoundingClientRect();
  return r.top >= 0 && r.top < innerHeight / 2;
}, cont.st.sec));
ok('going back from there is home, not the hub', await (async () => { await page.goBack(); await page.waitForSelector('#view-home.active'); return true; })());
await page.click('#bible-continue');
await page.waitForSelector('.bible-sec');

// 取消：拿掉已讀，紀錄留著
await secOf('真福八端').locator('.bible-done').click();
ok('tapping ✓ 已讀 again unmarks it', (await secOf('真福八端').locator('.bible-done').textContent()) === '讀完了');
saved = await store();
ok('the verses are gone but the log stays', saved.read.mat.length === 0 && saved.log.length === 1);
await secOf('真福八端').locator('.bible-done').click();   // 再標回去，下面還要用

// ───────────── 若望福音 13：節號 ─────────────
await reset();
await openChapter('jhn', 13);
const nums = await page.locator('.bible-text .vn:not(.vn-cont)').allTextContents();
ok('John 13 shows verse numbers 1 to 38 in order', nums.length === 38 && nums.every((n, i) => n === String(i + 1)));

// ───────────── 宗徒大事錄 9：句中換段 ─────────────
await openChapter('act', 9);
const act9 = parsed('act').chapters[9].filter((e) => e.v === 19);
ok('the parser splits verse 19 in two', act9.length === 2 && act9[1].cont === true);
const damascus = secOf('在大馬士革講道');
ok('the section 在大馬士革講道 is shown', (await damascus.count()) === 1);
ok('it opens with the second half of verse 19, marked as a continuation',
   (await damascus.locator('.v').first().textContent()).endsWith(act9[1].t)
   && (await damascus.locator('.v .vn-cont').count()) === 1);
const chapterText = (await page.textContent('#bible-body')).replace(/\s+/g, '');
ok('both halves of verse 19 are there, nothing lost', chapterText.includes(act9[0].t.replace(/\s+/g, '')) && chapterText.includes(act9[1].t.replace(/\s+/g, '')));
await damascus.locator('.bible-done').click();
saved = await store();
ok('reading the second half marks verse 9:19 as read', saved.read.act.includes('9:19') && saved.read.act.includes('9:20'));

// ───────────── 跨章的小段（谷 8:34 到 9:1） ─────────────
await reset();
{
  const mrk = parsed('mrk');
  const s = mrk.sections.find((x) => x.c === 8 && x.v === 34);
  await openChapter('mrk', 8);
  const sec = secOf(s.title);
  ok('a section crossing a chapter ends with a pointer, not a button',
     (await sec.locator('.bible-more').count()) === 1 && (await sec.locator('.bible-done').count()) === 0);
  await page.click('#bible-body .bible-pager .btn:last-child');
  await page.waitForSelector('.bible-sec');
  const tail = page.locator('.bible-sec').first();
  ok('chapter 9 opens with it under （續）', (await tail.locator('.bible-sec-title').textContent()).startsWith(`（續）${s.title}`));
  ok('the 讀完了 button is at its real end', (await tail.locator('.bible-done').count()) === 1);
  await tail.locator('.bible-done').click();
  const r = (await store()).read.mrk;
  ok('and marks the whole section, both chapters', r.includes('8:34') && r.includes('8:38') && r.includes('9:1') && !r.includes('9:2'));
  ok('the log shows it as one range', (await store()).log[0].from === '8:34' && (await store()).log[0].to === '9:1');
  ok('paging with 下一章 replaced the history entry (one back leaves the book)', await (async () => {
    await page.goBack();
    return page.isVisible('.ch-grid');
  })());
}

// ───────────── 搜尋 ─────────────
await reset();
await openHub();
await page.fill('#bible-search', '真');
await page.waitForTimeout(350);
ok('one character is not enough', (await page.locator('.bible-result').count()) === 0 && /兩個字/.test(await page.textContent('#bible-results')));
await page.fill('#bible-search', '真福');
await page.waitForSelector('.bible-result');
const hits = await page.locator('.bible-result').count();
ok('searching 真福 finds results (in the section headings)', hits >= 1 && hits <= 100);
ok('with the match highlighted', (await page.locator('.bible-result mark').first().textContent()) === '真福');
await page.locator('.bible-result', { hasText: '真福八端' }).first().click();
await page.waitForSelector('.bible-sec');
ok('tapping a result opens the chapter', (await title()) === '瑪竇福音 第五章');
ok('and highlights the place', (await page.locator('.v.hl').count()) === 1);
await page.goBack();
await page.waitForSelector('#bible-search');
ok('going back keeps the search', (await page.inputValue('#bible-search')) === '真福' && (await page.locator('.bible-result').count()) === hits);
await page.fill('#bible-search', '天國是他們的');
await page.locator('.bible-result mark', { hasText: '天國是他們的' }).first().waitFor();   // 上一次的結果還在，等新的出來
const verseHit = page.locator('.bible-result').first();
ok('verse text is searched too', /瑪 5:3/.test(await verseHit.textContent()) && (await verseHit.locator('mark').textContent()) === '天國是他們的');
await verseHit.click();
await page.waitForSelector('.v.hl');
ok('the verse itself is highlighted and in view', await page.evaluate(() => {
  const r = document.querySelector('.v.hl').getBoundingClientRect();
  return document.querySelector('.v.hl').dataset.key === '5:3' && r.top > 0 && r.bottom < innerHeight;
}));
await page.goBack();
await page.fill('#bible-search', '的');
await page.waitForTimeout(350);
ok('one character, even a common one, lists nothing', (await page.locator('.bible-result').count()) === 0);
await page.fill('#bible-search', '耶穌');
await page.waitForSelector('.bible-result');
ok('a very common word lists at most 100', (await page.locator('.bible-result').count()) === 100 && /前 100 處/.test(await page.textContent('.bible-count')));

// ───────────── 返回鍵：事件 → 章 → 書 → 大廳 → 首頁 ─────────────
if (hasEvents) {
  await reset();
  await openHub();
  await page.click('.bible-book[data-book="mat"]');
  await page.click('.ch-btn[data-c="9"]');
  await page.waitForSelector('.bible-sec');
  const jairus = eventByRef('mat', '9:18-26');
  ok('(data) there is an event for 瑪 9:18-26 with the other Gospels', jairus && jairus.refs.mrk && jairus.refs.luk);
  const sec = page.locator('.bible-sec', { has: page.locator('.v[data-key="9:18"]') });
  ok('the 瑪 9:18-26 section lists the parallels as chips', await (async () => {
    const chips = await sec.locator('.bible-chip').allTextContents();
    return chips.includes(`谷 ${jairus.refs.mrk.join('、')}`) && chips.includes(`路 ${jairus.refs.luk.join('、')}`);
  })());
  await sec.locator('.bible-chip[data-book="luk"]').click();
  await page.waitForSelector('.bible-ev-title');
  ok('tapping a chip opens the event on that Gospel', (await page.textContent('.bible-ev-title')) === jairus.title
     && (await page.getAttribute('.bible-etab[data-book="luk"]', 'aria-selected')) === 'true');
  ok('with a tab for each Gospel that records it', (await page.locator('.bible-etab').allTextContents()).join('') === '瑪谷路');
  ok('and the 路 passage', (await page.locator('.bible-text .v').first().getAttribute('data-key')) === '8:40');
  await page.click('.bible-etab[data-book="mrk"]');                      // 換分頁不算一層
  ok('switching tabs shows that Gospel', (await page.locator('.bible-text .v').first().getAttribute('data-key')) === '5:21');
  ok('the event screen fits the narrow screen', await noHScroll());

  await page.goBack(); await page.waitForSelector('.bible-sec');
  ok('back from the event returns to the chapter', (await title()) === '瑪竇福音 第九章');
  await page.goBack(); await page.waitForSelector('.ch-grid');
  ok('then the book', (await title()) === '瑪竇福音');
  await page.goBack(); await page.waitForSelector('.bible-tab');
  ok('then the hub', (await title()) === '讀經');
  await page.goBack(); await page.waitForSelector('#view-home.active');
  ok('then home', await page.isVisible('#bible-home'));
  ok('and the Bible view is no longer showing', !(await page.isVisible('#view-bible.active')));
}
await home();
await openHub();
await page.click('#bible-back');
await page.waitForSelector('#view-home.active');
ok('the back button in the bar also returns home from the hub', true);

// ───────────── 事件對照 ─────────────
if (hasEvents) {
  await reset();
  const jairus = eventByRef('mat', '9:18-26');
  const cana = events.events.find((e) => e.title.includes('加納'));
  ok('(data) 加納婚宴 is recorded only in 若', cana && Object.keys(cana.refs).join() === 'jhn');

  // 時間軸
  await openHub();
  await hubTab('events');
  await page.waitForSelector('.tl-item', { state: 'attached' });
  ok('the timeline has the phase headings', (await page.locator('.tl-phase').count()) === events.phases.length);
  ok('and every event', (await page.locator('.tl-item').count()) === events.events.length);
  ok('phases come in order', (await page.locator('.tl-phase > span').allTextContents()).join() === events.phases.map((p) => p.title).join());
  const canaRow = page.locator('.tl-item', { hasText: cana.title });
  ok('加納婚宴 is marked 獨有, with only the 若 badge', (await canaRow.locator('.uniq').count()) === 1
     && (await canaRow.locator('.bdg').allTextContents()).join() === '若');
  const jRow = page.locator('.tl-item', { hasText: jairus.title });
  ok('an event told three times has three badges and no 獨有', (await jRow.locator('.bdg').allTextContents()).join('') === '瑪谷路' && (await jRow.locator('.uniq').count()) === 0);
  ok('the continue button on this tab names the next event', (await page.textContent('.bible-next')).startsWith('下一件：'));
  ok('the timeline fits the narrow screen', await noHScroll());

  // 時期可以收起來：一開始只展開「繼續讀」會讀到的那一期
  const openPhases = () => page.locator('.tl-group').evaluateAll((ds) => ds.filter((d) => d.open).length);
  ok('at first only one phase is open', (await openPhases()) === 1);
  ok('and it is the one with the next event to read', await page.locator('.tl-group[open] .tl-item').first().isVisible());
  await page.click('.tl-all');
  ok('全部展開 opens every phase', (await openPhases()) === events.phases.length && (await page.textContent('.tl-all')) === '全部收起');
  await page.click('.tl-all');
  ok('全部收起 closes them all', (await openPhases()) === 0 && (await page.textContent('.tl-all')) === '全部展開');
  await page.locator('.tl-phase').nth(3).click();
  ok('a phase opens on its own when tapped', (await openPhases()) === 1
     && await page.locator('.tl-group').nth(3).evaluate((d) => d.open));
  await page.click('.tl-all');               // 下面要點到各時期裡的事件

  // 在事件裡讀
  await jRow.locator('.tl-node').click();
  await page.waitForSelector('.bible-ev-title');
  ok('the event opens on the first account', (await page.getAttribute('.bible-etab[data-book="mat"]', 'aria-selected')) === 'true');
  const keyBook = jairus.key.split(' ')[0], keyKey = jairus.key.split(' ')[1];
  await page.click(`.bible-etab[data-book="${keyBook}"]`);
  ok('the key verse is set apart', (await page.locator('.v.key').count()) === 1 && (await page.locator('.v.key').getAttribute('data-key')) === keyKey);
  ok('with a gold border', await page.evaluate(() => getComputedStyle(document.querySelector('.v.key')).borderLeftWidth === '3px'));
  await page.click('.bible-etab[data-book="luk"]');
  ok('no hint while nothing has been read', await page.isHidden('.bible-seen'));
  await page.click('.bible-etab[data-book="mat"]');
  await page.locator('.bible-done').click();
  ok('reading 瑪 toasts the reference', (await page.textContent('#toast')) === `已記下：瑪 ${jairus.refs.mat.join('、')}`);
  ok('and ticks its tab', (await page.textContent('.bible-etab[data-book="mat"]')).includes('✓'));
  await page.click('.bible-etab[data-book="luk"]');
  ok('the 路 account says you already read it in 瑪', /已在 瑪 讀過/.test(await page.textContent('.bible-seen'))
     && /路加 的記載/.test(await page.textContent('.bible-seen')));
  ok('but the 路 account itself still counts as unread', (await page.textContent('.bible-done')) === '讀完了');
  const reads = (await store()).read;
  ok('only the 瑪 verses are marked', reads.mat.length === 9 && reads.luk.length === 0);
  await page.locator('.bible-done').click();
  ok('reading 路 as well removes the hint', await page.isHidden('.bible-seen'));

  // 讀過的事，到處都看得到
  await page.goBack();
  await page.waitForSelector('.tl-item', { state: 'attached' });
  ok('going back keeps the phases as you left them', (await openPhases()) === events.phases.length);
  const jRow2 = page.locator('.tl-item', { hasText: jairus.title });
  ok('the timeline marks the finished accounts', (await jRow2.locator('.bdg.done').allTextContents()).join('') === '瑪路'
     && (await jRow2.getAttribute('data-state')) === 'part');
  await hubTab('books');
  await page.click('.bible-book[data-book="mat"]');
  await page.click('.ch-btn[data-c="9"]');
  await page.waitForSelector('.bible-sec');
  const sec9 = page.locator('.bible-sec', { has: page.locator('.v[data-key="9:18"]') });
  ok('the chapter marks the same verses', (await sec9.locator('.bible-chip[data-book="luk"]').textContent()).startsWith('✓ '));

  // 回到原來的位置
  await page.goBack(); await page.goBack();
  await hubTab('events');
  await page.waitForSelector('.tl-item', { state: 'attached' });
  const node = page.locator('.tl-node').nth(120);
  await node.scrollIntoViewIfNeeded();
  const y0 = await page.evaluate(() => Math.round(scrollY));
  await node.click();
  await page.waitForSelector('.bible-ev-title');
  await page.goBack();
  await page.waitForSelector('.tl-item', { state: 'attached' });
  ok('going back to the timeline restores where you were', Math.abs((await page.evaluate(() => scrollY)) - y0) < 40 && y0 > 1000);

  // 繼續讀（事件）：下一件還有福音沒讀的
  await page.evaluate(() => window.scrollTo(0, 0));
  const nextTitle = (await page.textContent('.bible-next')).replace('下一件：', '');
  await page.click('#bible-hub-continue');
  await page.waitForSelector('.bible-ev-title');
  ok('繼續讀 on the events tab opens the next unfinished event', (await page.textContent('.bible-ev-title')) === nextTitle);
  ok('(and next/previous move along the timeline)', await (async () => {
    const t0 = await page.textContent('.bible-ev-title');
    await page.click('.bible-pager .btn:last-child');
    await page.waitForFunction((t) => document.querySelector('.bible-ev-title').textContent !== t, t0);
    await page.click('.bible-pager .btn:first-child');
    await page.waitForFunction((t) => document.querySelector('.bible-ev-title').textContent === t, t0);
    return true;
  })());

  // 主題
  await page.goBack();
  await page.waitForSelector('.bible-tab');
  await hubTab('themes');
  await page.waitForSelector('.th-item');
  const groups = await page.locator('.th-group > summary').allTextContents();
  ok('themes: 奇蹟, 比喻, 講道', groups.map((g) => g.replace(/[\s\d]+/g, '')).join() === '奇蹟,比喻,講道');
  const miracles = page.locator('.th-group').first();
  ok('miracles are grouped: healing, exorcism, nature, raising the dead',
     (await miracles.locator('.th-sub').allTextContents()).join() === '治病,驅魔,自然,復活死人');
  const mCount = await miracles.locator('.th-item').count();
  ok('every miracle shows its key verse as a quote with the reference',
     mCount === events.events.filter((e) => (e.tags || []).includes('奇蹟')).length
     && (await miracles.locator('.th-item .th-quote').count()) === mCount
     && /^「.+」 (瑪|谷|路|若) \d+:\d+$/.test((await miracles.locator('.th-quote').first().textContent()).trim()));
  const tellers = (group) => group.locator('.th-item').evaluateAll((bs) => bs.map((b) => b.querySelectorAll('.bdg').length));
  const sorted = (xs) => xs.every((x, i) => !i || xs[i - 1] >= x);
  ok('parables told by more Gospels come first', await (async () => {
    const xs = await tellers(page.locator('.th-group').nth(1));
    return xs.length > 10 && sorted(xs) && xs[0] >= 3 && xs[xs.length - 1] === 1;
  })());
  ok('and so do the miracles within each kind', await miracles.locator('.th-sub').evaluateAll((hs) => hs.every((h) => {
    const xs = [];
    for (let n = h.nextElementSibling; n && !n.classList.contains('th-sub'); n = n.nextElementSibling) xs.push(n.querySelectorAll('.bdg').length);
    return xs.every((x, i) => !i || xs[i - 1] >= x);
  })));
  ok('an event with two miracle tags is listed only once', (await miracles.locator('.th-item', { hasText: jairus.title }).count()) === 1);
  ok('and under the first of them', await miracles.locator('.th-sub').first().evaluate((h, t) => {
    let n = h.nextElementSibling;
    while (n && !n.classList.contains('th-sub')) { if (n.textContent.includes(t)) return true; n = n.nextElementSibling; }
    return false;
  }, jairus.title));
  ok('read accounts show in the themes list too', (await miracles.locator('.th-item', { hasText: jairus.title }).locator('.bdg.done').count()) === 2);
  ok('the other groups start folded, and open on a tap', await (async () => {
    const d = page.locator('.th-group').nth(1);
    const closed = !(await d.evaluate((n) => n.open));
    await d.locator('summary').click();
    return closed && (await d.locator('.th-item').count()) > 10;
  })());
  ok('themes fit the narrow screen', await noHScroll());
  await miracles.locator('.th-item', { hasText: jairus.title }).click();
  await page.waitForSelector('.bible-ev-title');
  ok('a theme item opens the event', (await page.textContent('.bible-ev-title')) === jairus.title);
  await page.goBack();
  await page.waitForSelector('.th-item');
  ok('and back keeps the groups as you left them', (await page.locator('.th-group').nth(1).evaluate((n) => n.open)) === true);
} else {
  console.log('SKIP  event tests: data/gospel-events.json is not there yet');
}

// ───────────── 人物：誰說了什麼 ─────────────
if (hasPeople) {
  const peter = peopleData.people.find((p) => p.id === 'peter');
  const confess = sayingOf('peter-confess'), words = sayingOf('peter-words-of-life');
  const silver = sayingOf('peter-no-silver'), sinner = sayingOf('peter-sinner');
  ok('(data) peter and the five sayings these tests use are in data/people.json', peter && confess && words && silver && sinner && sayingOf('peter-love'));
  const nSayings = peter.stages.reduce((n, g) => n + g.sayings.length, 0);
  const card = (id) => page.locator(`.say[data-say="${id}"]`);
  const inView = (sel) => page.evaluate((q) => {
    const r = document.querySelector(q).getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight;
  }, sel);
  const openStages = () => page.locator('.pe-stage').evaluateAll((ds) => ds.filter((d) => d.open).length);
  const openPeter = async () => {
    await hubTab('people');
    await page.click('.pp-item[data-person="peter"]');
    await page.waitForSelector('.say', { state: 'attached' });
  };
  const expandAll = async () => { if ((await page.textContent('.tl-all')) === '全部展開') await page.click('.tl-all'); };

  // 列表
  await reset();
  await openHub();
  await hubTab('people');
  await page.waitForSelector('.pp-item');
  const heads = peopleData.groups.filter((g) => peopleData.people.some((p) => p.group === g.id)).map((g) => g.title);
  ok('the 人物 tab has a heading per group, in the file order', (await page.locator('.pp-group').allTextContents()).join() === heads.join());
  const row = page.locator('.pp-item[data-person="peter"]');
  ok('伯多祿 is listed, with his other names', (await row.locator('.pp-name').textContent()) === '伯多祿'
     && (await row.locator('.pp-aka').textContent()) === `又名 ${peter.aka.join('、')}`);
  ok('his intro and 「N 段話 · 讀過 x」', (await row.locator('.pp-intro').textContent()) === peter.intro
     && (await row.locator('.pp-meta').textContent()) === `${nSayings} 段話 · 讀過 0`);
  ok('he sits under his own group heading', await row.evaluate((r, title) => {
    let n = r.previousElementSibling;
    while (n && !n.classList.contains('pp-group')) n = n.previousElementSibling;
    return !!n && n.textContent === title;
  }, peopleData.groups.find((g) => g.id === peter.group).title));
  ok('the list fits the narrow screen', await noHScroll());

  // 人物畫面
  await row.click();
  await page.waitForSelector('.say', { state: 'attached' });
  ok('the screen is titled with the name', (await title()) === '伯多祿');
  ok('the header has the other names, the intro and the progress', (await page.textContent('.pe-aka')) === `又名 ${peter.aka.join('、')}`
     && (await page.textContent('.pe-intro')) === peter.intro && (await page.textContent('.pe-line')) === `讀完 0／${nSayings} 段話`
     && (await page.evaluate(() => document.querySelector('.pe-head .bible-bar > span').style.width)) === '0%');
  ok('one folding card per stage, one card per saying', (await page.locator('.pe-stage').count()) === peter.stages.length
     && (await page.locator('.say').count()) === nSayings);
  ok('the stages look like the event timeline groups', (await page.locator('details.th-group.tl-group').count()) === peter.stages.length);
  ok('on fresh progress exactly one stage is open, the first', (await openStages()) === 1 && (await page.locator('.pe-stage').first().evaluate((d) => d.open)));
  ok('the other stages are folded (their cards are hidden)', await page.locator('.pe-stage').first().locator('.say').first().isVisible() && (await page.locator('.say:visible').count()) < nSayings);
  await page.click('.tl-all');
  ok('全部展開 opens every stage', (await openStages()) === peter.stages.length && (await page.textContent('.tl-all')) === '全部收起');
  await page.click('.tl-all');
  ok('全部收起 closes them all', (await openStages()) === 0 && (await page.textContent('.tl-all')) === '全部展開');
  await page.locator('.pe-stage > summary').last().click();
  ok('a stage opens on its own when tapped, and the button follows', (await openStages()) === 1 && (await page.locator('.pe-stage').last().evaluate((d) => d.open)));
  await page.click('.tl-all');
  ok('the person screen fits the narrow screen', await noHScroll());
  const histLen = await page.evaluate(() => history.length);
  await page.goBack();
  await page.waitForSelector('.pp-item');
  await openPeter();
  ok('the open stages are remembered for the session, also coming back', (await openStages()) === peter.stages.length);

  // 一段話：書卷分頁、金句、回答
  const cc = card(confess.id);
  const pass = cc.locator('.say-body > .say-pass');
  ok('the saying headline is in 「」 and says who it was said to', (await cc.locator('.say-title').textContent()) === `「${confess.title}」`
     && (await cc.locator('.say-to').textContent()) === `對 ${confess.to} 說`);
  ok('it has book badges 瑪 谷 路', (await cc.locator('.say-sub .bdg').allTextContents()).join('') === '瑪谷路');
  ok('and small tabs for the books, opening on the first unread one', (await cc.locator('.say-tabs .bible-etab').allTextContents()).join('') === '瑪谷路'
     && (await cc.locator('.bible-etab[data-book="mat"]').getAttribute('aria-selected')) === 'true');
  ok('the 瑪 tab shows 瑪 16:16 with its verse number', (await pass.locator('.v').first().getAttribute('data-key')) === '16:16'
     && (await pass.locator('.v').first().textContent()).endsWith(verseText('mat', 16, 16)) && (await pass.locator('.v .vn').first().textContent()) === '16');
  ok('the key verse has the gold border', (await pass.locator('.v.key').count()) === 1 && (await pass.locator('.v.key').getAttribute('data-key')) === '16:16'
     && await pass.locator('.v.key').evaluate((n) => getComputedStyle(n).borderLeftWidth === '3px'));
  const reply = cc.locator('.say-reply');
  ok('the 瑪 tab shows 耶穌回答 with 瑪 16:17-19', (await reply.locator('.say-reply-label').textContent()) === `${confess.replyBy}回答`
     && (await reply.locator('.v').first().getAttribute('data-key')) === '16:17'
     && (await reply.textContent()).includes(verseText('mat', 16, 17)) && (await reply.textContent()).includes('瑪竇福音 16:17-19'));
  await cc.locator('.bible-etab[data-book="mrk"]').click();
  ok('the 谷 tab switches to 谷 8:29', (await pass.locator('.v').first().getAttribute('data-key')) === '8:29'
     && (await pass.locator('.v').first().textContent()).endsWith(verseText('mrk', 8, 29)) && (await cc.locator('.bible-etab[data-book="mrk"]').getAttribute('aria-selected')) === 'true');
  ok('and highlights nothing, since the key verse is in 瑪', (await cc.locator('.v.key').count()) === 0);
  ok('the reply is still shown, from the first book that has one', (await reply.locator('.v').first().getAttribute('data-key')) === '16:17');
  await cc.locator('.bible-etab[data-book="luk"]').click();
  ok('the 路 tab shows 路 9:20', (await pass.locator('.v').first().getAttribute('data-key')) === '9:20' && (await pass.locator('.v.key').count()) === 0);
  ok('the note is shown like an event note', (await cc.locator('.bible-note').textContent()) === confess.note);
  ok('switching tabs does not add history entries', (await page.evaluate(() => history.length)) === histLen);
  await cc.locator('.bible-etab[data-book="mat"]').click();

  // 對照：跳到另一段話，返回鍵回得來
  const wc = card(words.id);
  ok('a saying in one book has no tabs', (await wc.locator('.say-tabs').count()) === 0 && (await wc.locator('.say-body .v').first().getAttribute('data-key')) === '6:68');
  ok('and its key verse is set apart', (await wc.locator('.v.key').getAttribute('data-key')) === '6:68');
  const chip = wc.locator('.say-see .chip');
  ok('the 對照 chip names the other saying of the same person', (await chip.allTextContents()).join() === `對照：${confess.title}`);
  await wc.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.querySelector('.say[data-say="peter-words-of-life"]').getBoundingClientRect().top + scrollY - 80));
  const y0 = await page.evaluate(() => Math.round(scrollY));
  await chip.click();
  await page.waitForSelector('.say.hl', { state: 'attached' });
  ok('tapping it pushes a history entry for that saying', await page.evaluate(() => {
    const b = history.state.bible;
    return b.screen === 'person' && b.id === 'peter' && b.at === 'peter-confess';
  }));
  ok('the card is scrolled into view and flashes', (await page.locator('.say.hl').getAttribute('data-say')) === confess.id && await inView('.say[data-say="peter-confess"]'));
  ok('and its stage is open', await page.locator(`.pe-stage:has(.say[data-say="peter-confess"])`).evaluate((d) => d.open));
  ok('the flash fades by itself', await (async () => { await page.waitForFunction(() => !document.querySelector('.say.hl'), null, { timeout: 5000 }); return true; })());
  await page.goBack();
  await page.waitForSelector('.say', { state: 'attached' });
  ok('back returns to where you were, without flashing again', (await title()) === '伯多祿' && Math.abs((await page.evaluate(() => scrollY)) - y0) < 40 && y0 > 200
     && (await page.locator('.say.hl').count()) === 0 && await page.evaluate(() => history.state.bible.at === undefined));

  // 看上下文
  if (hasEvents) {
    const mrkEv = eventAt('mrk', 8, 29), matEv = eventAt('mat', 16, 16);
    ok('(data) 瑪 16:16 and 谷 8:29 are in events', mrkEv && matEv);
    await card(confess.id).locator('.bible-etab[data-book="mrk"]').click();
    await card(confess.id).locator('.say-ctx').click();
    await page.waitForSelector('.bible-ev-title');
    ok('看上下文 on the 谷 tab opens the event with 谷 active', (await page.textContent('.bible-ev-title')) === mrkEv.title
       && (await page.getAttribute('.bible-etab[data-book="mrk"]', 'aria-selected')) === 'true'
       && (await page.locator('.bible-text .v[data-key="8:29"]').count()) === 1);
    await page.goBack();
    await page.waitForSelector('.say', { state: 'attached' });
    ok('back returns to the saying, with the 谷 tab still chosen', (await card(confess.id).locator('.bible-etab[data-book="mrk"]').getAttribute('aria-selected')) === 'true');
    await card(confess.id).locator('.bible-etab[data-book="mat"]').click();
    await card(confess.id).locator('.say-ctx').click();
    await page.waitForSelector('.bible-ev-title');
    ok('and on the 瑪 tab it opens that event with 瑪 active', (await page.textContent('.bible-ev-title')) === matEv.title
       && (await page.getAttribute('.bible-etab[data-book="mat"]', 'aria-selected')) === 'true');
    await page.goBack();
    await page.waitForSelector('.say', { state: 'attached' });
  } else {
    console.log('SKIP  context-to-event tests: data/gospel-events.json is not there yet');
  }
  await card(silver.id).locator('.say-ctx').click();
  await page.waitForSelector('.bible-sec');
  ok('看上下文 on an Acts saying opens that chapter', (await title()) === '宗徒大事錄 第三章');
  ok('with verse 6 highlighted and in view', await page.evaluate(() => {
    const v = document.querySelector('.v.hl');
    const r = v && v.getBoundingClientRect();
    return !!v && v.dataset.key === '3:6' && r.top > 0 && r.bottom < innerHeight;
  }));
  await page.goBack();
  await page.waitForSelector('.say', { state: 'attached' });

  // ✓：全部出處都讀過才算
  await page.evaluate(() => localStorage.setItem('mercy.bible.v1', JSON.stringify({ read: { mat: ['16:16'], mrk: ['8:29'], luk: [], jhn: [], act: [] }, log: [], last: null })));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.say', { state: 'attached' });
  await expandAll();
  ok('two of three books read is not yet ✓', (await card(confess.id).locator('.say-ok').count()) === 0
     && (await card(confess.id).locator('.say-sub .bdg.done').allTextContents()).join('') === '瑪谷');
  ok('and the tab opens on the first unread book', (await card(confess.id).locator('.bible-etab[data-book="luk"]').getAttribute('aria-selected')) === 'true'
     && (await card(confess.id).locator('.say-tabs .bible-etab').allTextContents()).join('') === '瑪 ✓谷 ✓路');
  await page.evaluate(() => localStorage.setItem('mercy.bible.v1', JSON.stringify({ read: { mat: ['16:16'], mrk: ['8:29'], luk: ['9:20'], jhn: [], act: [] }, log: [], last: null })));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.say', { state: 'attached' });
  await expandAll();
  ok('all three read: ✓ before the headline', (await card(confess.id).locator('.say-title').textContent()).startsWith('✓') && await card(confess.id).evaluate((n) => n.classList.contains('is-read')));
  ok('the tab opens on the first book when everything is read', (await card(confess.id).locator('.bible-etab[data-book="mat"]').getAttribute('aria-selected')) === 'true');
  ok('the header and the stage count it', /^讀完 [1-9]\d*／\d+ 段話$/.test(await page.textContent('.pe-line'))
     && /^[1-9]\d*／\d+$/.test(await page.locator('.pe-stage', { has: card(confess.id) }).locator('summary small').textContent()));

  // ✓：讀完事件，這裡就有 ✓
  if (hasEvents) {
    await reset();
    await openHub();
    await openPeter();
    await expandAll();
    ok('peter-sinner starts without a ✓', (await card(sinner.id).locator('.say-ok').count()) === 0);
    await card(sinner.id).locator('.say-ctx').click();
    await page.waitForSelector('.bible-ev-title');
    await page.locator('.bible-done').click();
    await page.goBack();
    await page.waitForSelector('.say', { state: 'attached' });
    ok('after marking its event read, ✓ appears on peter-sinner', (await card(sinner.id).locator('.say-ok').count()) === 1
       && (await card(sinner.id).locator('.say-title').textContent()).startsWith('✓') && (await card(sinner.id).locator('.say-sub .bdg.done').allTextContents()).join('') === '路');
    ok('the progress counts it', /^讀完 [1-9]\d*／\d+ 段話$/.test(await page.textContent('.pe-line')));
    await page.goBack();
    await page.waitForSelector('.pp-item');
    ok('and so does the list', /讀過 [1-9]/.test(await page.textContent('.pp-item[data-person="peter"] .pp-meta')));
  }

  // 這裡說話的人
  if (hasEvents) {
    await reset();
    const ev = eventAt('mat', 16, 16);
    ok('(data) the event with 瑪 16:16 is told in 谷 too', ev && ev.refs.mrk);
    await openChapter('mat', 16);
    ok('Gospel chapters show no speaker row (they have the event page)', (await page.locator('.bible-who').count()) === 0);
    const sec = page.locator('.bible-sec', { has: page.locator('.v[data-key="16:16"]') });
    await sec.locator('.bible-chip[data-book="mrk"]').click();
    await page.waitForSelector('.bible-ev-title');
    const who = page.locator('.bible-who');
    ok('the event screen says 這裡說話的人：', (await who.locator('.bible-par-label').textContent()) === '這裡說話的人：');
    ok('with a chip 伯多祿：你是默西亞 on the 谷 tab', (await who.locator('.chip', { hasText: `伯多祿：${confess.title}` }).count()) === 1);
    ok('after the verses, before the 讀完了 button', await page.evaluate(() => {
      const w = document.querySelector('.bible-who'), t = document.querySelector('.bible-text'), d = document.querySelector('.bible-done');
      return !!(t.compareDocumentPosition(w) & Node.DOCUMENT_POSITION_FOLLOWING) && !!(w.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING);
    }));
    ok('the event screen still fits', await noHScroll());
    await page.click('.bible-etab[data-book="mat"]');
    ok('and on the 瑪 tab too', (await who.locator('.chip', { hasText: `伯多祿：${confess.title}` }).count()) === 1);
    await who.locator('.chip', { hasText: `伯多祿：${confess.title}` }).click();
    await page.waitForSelector('.say.hl', { state: 'attached' });
    ok('the chip opens his screen at that saying', (await title()) === '伯多祿' && (await page.locator('.say.hl').getAttribute('data-say')) === confess.id && await inView('.say.hl'));
    await page.goBack();
    await page.waitForSelector('.bible-ev-title');
    ok('back returns to the event, on the 瑪 tab', (await page.getAttribute('.bible-etab[data-book="mat"]', 'aria-selected')) === 'true');
  }
  await openChapter('act', 3);
  const actSec = page.locator('.bible-sec', { has: page.locator('.v[data-key="3:6"]') });
  ok('Acts chapters show the chip after the section holding the key verse', (await page.locator('.bible-who').count()) >= 1
     && (await actSec.locator('.bible-who .chip', { hasText: `伯多祿：${silver.title}` }).count()) === 1
     && (await page.locator(`.bible-who .chip[data-say="${silver.id}"]`).count()) === 1);
  ok('after the text, before the 讀完了 button', await actSec.evaluate((n) => {
    const w = n.querySelector('.bible-who'), t = n.querySelector('.bible-text'), d = n.querySelector('.bible-done');
    return !!(t.compareDocumentPosition(w) & Node.DOCUMENT_POSITION_FOLLOWING) && !!(w.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING);
  }));
  ok('the chapter still fits', await noHScroll());
  await actSec.locator('.bible-who .chip', { hasText: silver.title }).click();
  await page.waitForSelector('.say.hl', { state: 'attached' });
  ok('the chip opens his screen at 金銀我沒有', (await title()) === '伯多祿' && (await page.locator('.say.hl').getAttribute('data-say')) === silver.id);
  await page.goBack();
  await page.waitForSelector('.bible-sec');
  ok('back returns to the chapter', (await title()) === '宗徒大事錄 第三章');

  // 重新載入後仍在這個人
  await page.goForward();
  await page.waitForSelector('.say', { state: 'attached' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.say', { state: 'attached' });
  ok('a reload comes back to the same person', (await title()) === '伯多祿' && (await page.locator('.say').count()) === nSayings);
} else {
  console.log('SKIP  人物 tests: data/people.json is not there yet');
}

// ───────────── 人物：自備資料，檢查整理與長篇經文 ─────────────
{
  const mock = {
    groups: [{ id: 'g1', title: '試驗組' }, { id: 'g1', title: '重複的組' }, { id: 'g2', title: '空的組' }],
    people: [
      { id: 'ann', name: '安妮', aka: ['小安', '', 7], group: 'g1', intro: '試驗用。', stages: [
        { title: '一', sayings: [
          { id: 'ann-long', title: '長的一段', to: '眾人', refs: { mat: ['5:3-12'], luk: ['6:20-23'] }, key: 'luk 6:20', note: '一個註' },
          { id: 'ann-bad', title: '壞的出處', to: '誰', refs: { mat: ['99:1'] }, key: 'mat 99:1' },
          { id: 'ann-nobook', title: '沒有這卷', to: '誰', refs: { zzz: ['1:1'] }, key: 'zzz 1:1' },
          { id: 'ann-half', title: '一半壞', to: '誰', refs: { mat: ['5:3', '77:7'], zzz: ['1:1'] }, key: 'mat 77:7' },
          { id: 'ann-html', title: '<img src=x onerror="window.__pwned=1">', to: '<b>誰</b>', refs: { mat: ['5:4'] }, key: 'mat 5:4' },
          { id: 'ann-long', title: '重複的 id', to: '誰', refs: { mat: ['5:5'] }, key: 'mat 5:5' },
        ] },
        { title: '空的', sayings: [{ id: 'ann-x', title: 'x', to: 'y', refs: { mat: ['88:1'] }, key: 'mat 88:1' }] },
      ] },
      { id: 'dan', name: '但', group: 'g1', intro: '', stages: [{ title: '甲', sayings: [
        { id: 'dan-1', title: '一句', to: '安妮', refs: { luk: ['6:20'] }, key: 'luk 6:20', see: ['ann-long', 'dan-1', 'no-such-saying'] },
      ] }] },
      { id: 'bob', name: '鮑伯', group: 'g1', intro: '', stages: [{ title: '壞', sayings: [{ id: 'bob-x', title: 'x', to: 'y', refs: { mat: ['99:9'] }, key: 'mat 99:9' }] }] },
      { id: 'cat', name: '貓', group: 'nope', intro: 'x', stages: [{ title: 'a', sayings: [{ id: 'cat-1', title: 'ok', to: 'z', refs: { mat: ['5:3'] }, key: 'mat 5:3' }] }] },
      'junk', null, 7,
    ],
  };
  const mk = await launch({ serviceWorkers: 'block' });
  const m = mk.page;
  await m.route('**/people.json', (r) => r.fulfill({ json: mock }));
  await m.goto(BASE, { waitUntil: 'networkidle' });
  await m.waitForFunction(() => /節/.test(document.querySelector('#bible-home-line').textContent));
  await m.click('#bible-open');
  await m.waitForSelector('.bible-tab');
  await m.click('.bible-tab[data-tab="people"]');
  await m.waitForSelector('.pp-item');
  const mcard = (id) => m.locator(`.say[data-say="${id}"]`);
  ok('mock: a person with no good saying, or in an unknown group, is dropped', (await m.locator('.pp-item').allTextContents()).length === 2
     && (await m.locator('.pp-name').allTextContents()).join() === '安妮,但');
  ok('mock: a duplicate group, an empty group are not listed twice or at all', (await m.locator('.pp-group').allTextContents()).join() === '試驗組');
  ok('mock: only the sayings with real passages count', (await m.locator('.pp-item[data-person="ann"] .pp-meta').textContent()) === '3 段話 · 讀過 0');
  ok('mock: bad nicknames are skipped', (await m.locator('.pp-item[data-person="ann"] .pp-aka').textContent()) === '又名 小安');
  await m.click('.pp-item[data-person="ann"]');
  await m.waitForSelector('.say', { state: 'attached' });
  ok('mock: the person screen has one stage with the three good sayings', (await m.locator('.pe-stage').count()) === 1 && (await m.locator('.say').count()) === 3
     && (await m.locator('.say').evaluateAll((ns) => ns.map((n) => n.dataset.say))).join() === 'ann-long,ann-half,ann-html');
  ok('mock: data is shown as text, never as markup', (await m.evaluate(() => window.__pwned)) === undefined
     && (await mcard('ann-html').locator('.say-title').textContent()).includes('<img src=x') && (await mcard('ann-html').locator('img').count()) === 0
     && (await mcard('ann-html').locator('.say-to').textContent()) === '對 <b>誰</b> 說');
  ok('mock: a key that is not in the passage means no highlight', (await mcard('ann-half').locator('.v').count()) === 1 && (await mcard('ann-half').locator('.v.key').count()) === 0);

  // 長篇：超過五節只放金句，按了展開全段
  const lc = mcard('ann-long');
  const mat312 = parsed('mat').chapters[5].filter((e) => e.v >= 3 && e.v <= 12 && !e.cont).length;
  ok('mock: tabs open on 瑪 (first book), the key is in 路', (await lc.locator('.say-tabs .bible-etab').allTextContents()).join('') === '瑪路'
     && (await lc.locator('.bible-etab[data-book="mat"]').getAttribute('aria-selected')) === 'true');
  ok('mock: a passage over 5 verses shows only its first verse when the key is in another book', (await lc.locator('.say-body .v').count()) === 1
     && (await lc.locator('.say-body .v').getAttribute('data-key')) === '5:3' && (await lc.locator('.v.key').count()) === 0);
  const more = lc.locator('.say-more');
  ok('mock: with a 「展開全段（N 節）」 toggle', (await more.textContent()) === `展開全段（${mat312} 節）`);
  await more.click();
  ok('mock: which shows the whole passage', (await lc.locator('.say-body .v').count()) === parsed('mat').chapters[5].filter((e) => e.v >= 3 && e.v <= 12).length
     && (await lc.locator('.say-more').textContent()) === '收合');
  await lc.locator('.say-more').click();
  ok('mock: and folds again', (await lc.locator('.say-body .v').count()) === 1);
  await lc.locator('.bible-etab[data-book="luk"]').click();
  ok('mock: the 路 passage is short, so it is all shown, key verse set apart', (await lc.locator('.say-body .v').count()) >= 4 && (await lc.locator('.say-more').count()) === 0
     && (await lc.locator('.v.key').getAttribute('data-key')) === '6:20');
  await lc.locator('.bible-etab[data-book="mat"]').click();
  await m.evaluate(() => { document.querySelector('.say[data-say="ann-long"] .say-more').click(); });
  ok('mock: an expanded passage stays expanded after switching tabs and back', await (async () => {
    await lc.locator('.bible-etab[data-book="luk"]').click();
    await lc.locator('.bible-etab[data-book="mat"]').click();
    return (await lc.locator('.say-body .v').count()) > 5;
  })());
  ok('mock: the note shows', (await lc.locator('.bible-note').textContent()) === '一個註');
  ok('mock: a page of this still fits the narrow screen', await m.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));

  // 對照另一個人：標籤上加人名；指向不存在的話就不出現
  await m.goBack();
  await m.waitForSelector('.pp-item');
  await m.click('.pp-item[data-person="dan"]');
  await m.waitForSelector('.say', { state: 'attached' });
  const dc = mcard('dan-1').locator('.say-see .chip');
  ok('mock: the 對照 chip of another person carries the name; unknown and self links are dropped', (await dc.allTextContents()).join() === '對照：安妮 · 長的一段');
  await dc.click();
  await m.waitForSelector('.say.hl', { state: 'attached' });
  ok('mock: it opens that person, at that saying', (await m.textContent('#bible-title')) === '安妮' && (await m.locator('.say.hl').getAttribute('data-say')) === 'ann-long');
  await m.goBack();
  await m.waitForSelector('.say', { state: 'attached' });
  ok('mock: back returns to the first person', (await m.textContent('#bible-title')) === '但');

  // 事件頁：沒有重疊的話，就沒有「這裡說話的人」
  if (hasEvents) {
    await m.goBack();
    await m.waitForSelector('.pp-item');
    await m.click('.bible-tab[data-tab="books"]');
    await m.click('.bible-book[data-book="jhn"]');
    await m.click('.ch-btn[data-c="2"]');
    await m.waitForSelector('.bible-sec');
    await m.locator('.bible-uniq').first().click();
    await m.waitForSelector('.bible-ev-title');
    ok('mock: an event with no speaker in it has no 這裡說話的人 row', (await m.locator('.bible-who').count()) === 0);
    await m.goBack();
    await m.waitForSelector('.bible-sec');
    await m.goBack(); await m.goBack();
    await m.click('.bible-book[data-book="mat"]');
    await m.click('.ch-btn[data-c="5"]');
    await m.waitForSelector('.bible-sec');
    const first = m.locator('.bible-sec', { has: m.locator('.v[data-key="5:4"]') });
    await first.locator('.bible-uniq, .bible-chip').first().click();
    await m.waitForSelector('.bible-ev-title');
    if (await m.locator('.bible-etab[data-book="mat"]').count()) await m.click('.bible-etab[data-book="mat"]');
    ok('mock: and one that overlaps a saying lists it', (await m.locator('.bible-who .chip', { hasText: '安妮：長的一段' }).count()) === 1);
  }
  ok('mock: no errors', mk.errors.length === 0);
  if (mk.errors.length) console.log(mk.errors.join('\n'));
  await mk.browser.close();
}

// 人物資料不見了或壞了：沒有那一頁，其他都照常
for (const [what, route] of [['missing', (r) => r.fulfill({ status: 404, body: 'no' })], ['not JSON', (r) => r.fulfill({ body: '{oops' })],
  ['the wrong shape', (r) => r.fulfill({ json: { groups: 'x', people: { a: 1 } } })], ['all bad', (r) => r.fulfill({ json: { groups: [{ id: 'a', title: 'A' }], people: [{ id: 'p', name: 'P', group: 'a', stages: 5 }] } })]]) {
  const bare = await launch({ serviceWorkers: 'block' });
  await bare.page.route('**/people.json', route);
  await bare.page.goto(BASE, { waitUntil: 'networkidle' });
  await bare.page.waitForFunction(() => /節/.test(document.querySelector('#bible-home-line').textContent));
  await bare.page.click('#bible-open');
  await bare.page.waitForSelector('.bible-book');
  ok(`without people (${what}): no 人物 tab, the rest is as before`, (await bare.page.locator('.bible-tab').allTextContents()).join('') === '書卷事件主題紀錄'
     && (await bare.page.locator('.bible-book').count()) === 5);
  // 上次停在「人物」分頁的人，打開時回到書卷
  await bare.page.evaluate(() => { const st = JSON.parse(localStorage.getItem('mercy.settings.v1') || '{}'); st.bibleTab = 'people'; localStorage.setItem('mercy.settings.v1', JSON.stringify(st)); });
  await bare.page.reload({ waitUntil: 'networkidle' });
  await bare.page.waitForSelector('.bible-book', { state: 'attached' });
  ok(`and a remembered 人物 tab falls back to 書卷 (${what})`, (await bare.page.getAttribute('.bible-tab[data-tab="books"]', 'aria-selected')) === 'true');
  ok(`and chapters and events still work (${what})`, await (async () => {
    await bare.page.click('.bible-tab[data-tab="events"]');
    await bare.page.waitForSelector('.tl-item', { state: 'attached' });
    return (await bare.page.locator('.tl-item').count()) > 100;
  })());
  ok(`no errors (${what})`, bare.errors.length === 0);
  await bare.browser.close();
}

// ───────────── 紀錄 ─────────────
await reset();
await openChapter('mat', 5);
await secOf('真福八端').locator('.bible-done').click();
await page.goBack(); await page.waitForSelector('.ch-grid');
await page.goBack(); await page.waitForSelector('.bible-tab');
await hubTab('log');
await page.waitForSelector('.bl-day');
const day = await page.textContent('.bl-day');
ok('the log is grouped by day', /^\d{1,2}月\d{1,2}日（星期[日一二三四五六]）$/.test(day));
ok('with the reference and title on each line', (await page.textContent('.bl-row')).replace(/\s+/g, '') === '瑪5:1-12真福八端');
ok('and a summary at the top', (await page.textContent('.bible-log-sum')) === '本月讀經 1 天 · 累計讀完 1 段');
ok('the log fits the narrow screen', await noHScroll());
await page.click('.bl-row');
await page.waitForSelector('.bible-sec');
ok('a log line opens that place', (await title()) === '瑪竇福音 第五章' && (await page.locator('.v.hl').count()) === 1);
await page.goBack();

// 分頁會記住
ok('the last tab is remembered in the settings', await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.settings.v1')).bibleTab) === 'log');
await home();
await page.click('#bible-open');
await page.waitForSelector('.bible-tab');
ok('and used when the hub opens again', (await page.getAttribute('.bible-tab[data-tab="log"]', 'aria-selected')) === 'true');

// ───────────── 字體放大、深色 ─────────────
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('mercy.settings.v1')); s.font = 180; s.theme = 'dark'; localStorage.setItem('mercy.settings.v1', JSON.stringify(s)); });
await home();
await openHub();
await openChapter('mat', 5);
const fs = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.bible-text')).fontSize));
ok('the verse text follows the font-size setting', fs > 30);
ok('large text still fits the screen', await noHScroll());
ok('dark theme: readable text on a dark page', await page.evaluate(() => {
  const lum = (c) => { const [r, g, b] = c.match(/\d+/g).map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  return lum(getComputedStyle(document.querySelector('.bible-text')).color) > 180 && lum(getComputedStyle(document.body).backgroundColor) < 60;
}));
if (hasPeople) {
  await home();
  await openHub();
  await hubTab('people');
  await page.click('.pp-item[data-person="peter"]');
  await page.waitForSelector('.say', { state: 'attached' });
  if ((await page.textContent('.tl-all')) === '全部展開') await page.click('.tl-all');
  ok('large text and dark theme: the person screen still fits the screen', await noHScroll());
  ok('dark theme: the saying cards are dark with light text', await page.evaluate(() => {
    const lum = (c) => { const [r, g, b] = c.match(/\d+/g).map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const card = document.querySelector('.say');
    return lum(getComputedStyle(card).backgroundColor) < 60 && lum(getComputedStyle(card.querySelector('.say-title')).color) > 180
      && lum(getComputedStyle(card.querySelector('.bible-text')).color) > 180;
  }));
}

// ───────────── 沒有對照資料時 ─────────────
{
  const bare = await launch({ serviceWorkers: 'block' });
  await bare.page.route('**/gospel-events.json', (r) => r.fulfill({ status: 404, body: 'no' }));
  await bare.page.goto(BASE, { waitUntil: 'networkidle' });
  await bare.page.waitForFunction(() => /節/.test(document.querySelector('#bible-home-line').textContent));
  await bare.page.click('#bible-open');
  await bare.page.waitForSelector('.bible-book');
  ok('without the event table, the books still list', (await bare.page.locator('.bible-book').count()) === 5);
  await bare.page.click('.bible-tab[data-tab="events"]');
  ok('the 事件 tab says the table is missing', /對照資料尚未載入/.test(await bare.page.textContent('#bible-panel')));
  await bare.page.click('.bible-tab[data-tab="themes"]');
  ok('so does 主題', /對照資料尚未載入/.test(await bare.page.textContent('#bible-panel')));
  await bare.page.click('.bible-tab[data-tab="books"]');
  await bare.page.click('.bible-book[data-book="luk"]');
  await bare.page.click('.ch-btn[data-c="8"]');
  await bare.page.waitForSelector('.bible-sec');
  ok('chapters read normally, with no chips', (await bare.page.locator('.bible-chip').count()) === 0 && (await bare.page.locator('.bible-done').count()) > 0);
  await bare.page.locator('.bible-done').first().click();
  ok('and progress is still recorded', (await bare.page.evaluate(() => JSON.parse(localStorage.getItem('mercy.bible.v1')).read.luk.length)) > 0);
  ok('no errors there either', bare.errors.length === 0);
  await bare.browser.close();
}

// ───────────── 單檔預覽版 ─────────────
{
  const dir = mkdtempSync(join(tmpdir(), 'mercy-preview-'));
  const file = join(dir, 'preview.html');
  execFileSync(process.execPath, ['scripts/build-preview.mjs', file], { cwd: root, stdio: 'ignore' });
  const pv = await launch();
  const asked = [];
  pv.page.on('request', (r) => asked.push(r.url()));
  await pv.page.goto(`file://${file}`, { waitUntil: 'load' });
  await pv.page.waitForSelector('#view-home.active');
  await pv.page.waitForFunction(() => /節/.test(document.querySelector('#bible-home-line').textContent));
  ok('preview: the home card shows the totals', /4,780/.test(await pv.page.textContent('#bible-home-line')));
  await pv.page.click('#bible-open');
  await pv.page.waitForSelector('.bible-book');
  ok('preview: the hub lists five books', (await pv.page.locator('.bible-book').count()) === 5);
  await pv.page.click('.bible-book[data-book="jhn"]');
  await pv.page.click('.ch-btn[data-c="13"]');
  await pv.page.waitForSelector('.bible-sec');
  ok('preview: a chapter opens', (await pv.page.locator('.bible-text .v').count()) === 38);
  await pv.page.goBack(); await pv.page.goBack();
  await pv.page.waitForSelector('.bible-tab');
  if (hasEvents) {
    await pv.page.click('.bible-tab[data-tab="events"]');
    await pv.page.waitForSelector('.tl-item', { state: 'attached' });
    ok('preview: the timeline is there', (await pv.page.locator('.tl-item').count()) === events.events.length);
  }
  if (hasPeople) {
    await pv.page.click('.bible-tab[data-tab="people"]');
    await pv.page.waitForSelector('.pp-item[data-person="peter"]');
    ok('preview: the people are there too', (await pv.page.locator('.pp-item').count()) === peopleData.people.length);
    await pv.page.click('.pp-item[data-person="peter"]');
    await pv.page.waitForSelector('.say', { state: 'attached' });
    ok('preview: a person opens, with verses', (await pv.page.locator('.say .v').count()) >= 1);
    await pv.page.goBack();
    await pv.page.waitForSelector('.bible-tab');
  }
  await pv.page.click('.bible-foot a');
  await pv.page.waitForFunction(() => /GNU/.test(document.querySelector('.bible-foot .bible-notice').textContent));
  ok('preview: the notice is readable too', true);
  ok('preview: no requests beyond the file itself', asked.every((u) => u.startsWith('file://') || u.startsWith('data:')));
  ok('preview: no errors', pv.errors.length === 0);
  if (pv.errors.length) console.log(pv.errors.join('\n'));
  await pv.browser.close();
}

// ───────────── 匯入的讀經進度要逐項檢查 ─────────────
{
  await reset();
  const dir = mkdtempSync(join(tmpdir(), 'mercy-bible-import-'));
  const file = join(dir, 'bible-hostile.json');
  const long = 'x'.repeat(5000);
  writeFileSync(file, JSON.stringify({
    app: 'mercy-divine', version: 5, records: [],
    bible: {
      read: { mat: ['5:3', '5:3', 'abc', '5:3:1', '<script>', 'http://198.51.100.7/x', '9999999:1', 5, null, '1:1'], zzz: ['1:1'], mrk: 'nope', luk: { a: 1 } },
      log: [
        { at: '2026-03-01T08:00:00.000Z', book: 'mat', from: '5:1', to: '5:12', title: '真福八端' },
        { at: '2026-03-01T08:00:00.000Z', book: 'mat', from: '5:1', to: '5:12', title: '重複的' },
        { at: 'not a date', book: 'mat', from: '5:1', to: '5:2', title: 'bad date' },
        { at: '2026-03-02T08:00:00.000Z', book: 'evil', from: '5:1', to: '5:2', title: 'bad book' },
        { at: '2026-03-02T08:00:00.000Z', book: 'mat', from: 'x', to: '5:2', title: 'bad key' },
        { at: '2026-03-03T08:00:00.000Z', book: 'luk', from: '1:1', to: '1:4', title: long },
        { at: long, book: 'luk', from: '1:1', to: '1:4', title: 'long at' },
        'junk', null, 7,
      ],
      last: { book: 'mat', c: 5 },
    },
  }));
  const before = outbound.length;
  await page.click('[data-go="settings"]');
  await page.setInputFiles('#import-file', file);
  await page.waitForTimeout(900);
  const got = await store();
  ok('imported: only well-formed verse keys are kept', JSON.stringify(got.read.mat.sort()) === JSON.stringify(['1:1', '5:3']) && got.read.luk.length === 0);
  ok('unknown books are dropped', !('zzz' in got.read) && Object.keys(got.read).join() === 'mat,mrk,luk,jhn,act');
  ok('log entries are checked and de-duplicated', got.log.length === 2 && got.log[0].title === '真福八端');
  ok('over-long titles are cut', got.log[1].title.length === 80);
  ok('the place is adopted when there was none', got.last.book === 'mat' && got.last.c === 5);
  ok('nothing touched the network', outbound.length === before);
  await page.setInputFiles('#import-file', file);
  await page.waitForTimeout(700);
  const again = await store();
  ok('importing twice changes nothing', JSON.stringify(again) === JSON.stringify(got));
}

ok('no request left the machine', outbound.length === 0);
console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'no console errors');
await browser.close();
process.exit(failures || errors.length ? 1 : 0);
