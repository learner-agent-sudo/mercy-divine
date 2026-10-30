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
ok('the four tabs are there', (await page.locator('.bible-tab').allTextContents()).join('') === '書卷事件主題紀錄');
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
  if (hasEvents) {
    await pv.page.goBack(); await pv.page.goBack();
    await pv.page.click('.bible-tab[data-tab="events"]');
    await pv.page.waitForSelector('.tl-item', { state: 'attached' });
    ok('preview: the timeline is there', (await pv.page.locator('.tl-item').count()) === events.events.length);
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
