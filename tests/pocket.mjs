// 口袋模式：關著螢幕、用手錶上的音樂控制數珠。
// 測試攔下真正的 mediaSession API，抓住程式登記的處理器再去呼叫它，
// 所以驗的是實際接上去的那條線，不是另外開給測試用的後門。
import { BASE, launch } from './helpers.mjs';
const ok = (l, p) => { console.log(`${p ? 'PASS' : 'FAIL ***'}  ${l}`); if (!p) failures++; };
let failures = 0;

const { browser, page, errors } = await launch();

// 在程式跑起來之前先換掉 setActionHandler，把處理器留下來
await page.addInitScript(() => {
  window.__handlers = {};
  window.__meta = [];
  const ms = navigator.mediaSession;
  if (!ms) return;
  const real = ms.setActionHandler.bind(ms);
  ms.setActionHandler = (action, fn) => {
    window.__handlers[action] = fn;
    try { real(action, fn); } catch { /* headless 未必支援全部動作 */ }
  };
  const desc = Object.getOwnPropertyDescriptor(MediaSession.prototype, 'metadata');
  Object.defineProperty(ms, 'metadata', {
    get() { return desc.get.call(this); },
    set(v) {
      window.__meta.push(v ? { title: v.title, artist: v.artist, album: v.album } : null);
      desc.set.call(this, v);
    },
  });
});

const fire = (action) => page.evaluate((a) => window.__handlers[a] && window.__handlers[a](), action);
const meta = () => page.evaluate(() => window.__meta.at(-1));
const stepName = () => page.textContent('#step-name');
const stepCount = () => page.textContent('#step-count');

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('#view-home.active');

ok('the home screen offers pocket mode', await page.isVisible('#pocket-btn'));
ok('and shows no unfinished progress on a clean start', !(await page.isVisible('#resume')));

await page.click('#pocket-btn');
await page.waitForSelector('#view-prayer.active');

// ── 撐住分頁的那段音訊 ──
const audio = await page.evaluate(() => {
  const el = document.querySelector('#hold');
  return { src: (el.getAttribute('src') || '').slice(0, 5), paused: el.paused, loop: el.loop };
});
ok('a looping track is playing to hold the tab alive', !audio.paused && audio.loop);
ok('and it is generated locally, not fetched', audio.src === 'blob:');

// Chrome 只替夠長、聽得到的音訊建立媒體控制；太短或太安靜會被當成音效，
// 手錶上就什麼都不會出現。這兩項是口袋模式的成敗所在。
await page.waitForFunction(() => document.querySelector('#hold').duration > 0);
const track = await page.evaluate(async () => {
  const el = document.querySelector('#hold');
  const raw = await (await fetch(el.src)).arrayBuffer();
  const pcm = new Int16Array(raw, 44);
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
  return { secs: el.duration, peak: peak / 32768, samples: pcm.length };
});
ok('the track is long enough for the system to treat it as media, not a sound effect',
   track.secs >= 10);
ok('and loud enough to count as playing', track.peak > 0.005);
ok('but far too quiet to hear', track.peak < 0.05);

// 40Hz：手機喇叭推不出來，所以可以放得比偵測門檻大聲而人還是聽不到
const cycles = await page.evaluate(async () => {
  const raw = await (await fetch(document.querySelector('#hold').src)).arrayBuffer();
  const pcm = new Int16Array(raw, 44, 8000);        // 第一秒
  let up = 0;
  for (let i = 1; i < pcm.length; i++) if (pcm[i - 1] < 0 && pcm[i] >= 0) up++;
  return up;
});
ok('the tone sits below what a phone speaker can reproduce', cycles >= 38 && cycles <= 42);
ok('the screen says it can be switched off',
   (await page.textContent('#pocket-bar')).includes('可以關螢幕'));
ok('the full-text toggle is out of the way — it has no beads to count',
   !(await page.isVisible('#mode-toggle')));

// ── 手錶上的按鍵 ──
ok('the watch is given next and previous', await page.evaluate(() =>
   typeof window.__handlers.nexttrack === 'function'
   && typeof window.__handlers.previoustrack === 'function'));
ok('and play/pause, so a stray press does not end the prayer', await page.evaluate(() =>
   typeof window.__handlers.play === 'function' && typeof window.__handlers.pause === 'function'));

const first = await stepName();
await fire('nexttrack');
await page.waitForTimeout(120);
ok('pressing next on the watch advances one bead', (await stepName()) !== first);
await fire('previoustrack');
await page.waitForTimeout(120);
ok('and previous steps back', (await stepName()) === first);

ok('pause stops the track without ending the session', await (async () => {
  await fire('pause');
  await page.waitForTimeout(100);
  const paused = await page.evaluate(() => document.querySelector('#hold').paused);
  await fire('play');
  await page.waitForTimeout(100);
  const playing = await page.evaluate(() => !document.querySelector('#hold').paused);
  return paused && playing && await page.isVisible('#view-prayer.active');
})());

// ── 手錶上顯示的字 ──
let m = await meta();
ok('the watch is told which prayer this is', m && m.artist.includes('救主慈悲串經'));
ok('and how far in', m && /第 \d+ 步，共 \d+ 步/.test(m.album));

// 走到小珠，那裡的標題才數得出珠
for (let i = 0; i < 6; i++) { await fire('nexttrack'); await page.waitForTimeout(40); }
ok('the walk reached the small beads', (await stepCount()).includes('珠'));
m = await meta();
ok('the watch title counts the bead, so a glance is enough', m && /\d+／\d+/.test(m.title));
const titleBefore = m.title;
await fire('nexttrack');
await page.waitForTimeout(120);
ok('and it changes on every press', (await meta()).title !== titleBefore);

// ── 被系統清掉也不會白唸 ──
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.pocket.v1') || 'null'));
ok('every bead is written down as it goes', saved && saved.index > 0 && saved.set === 'chaplet');

const at = saved.index;
await page.reload({ waitUntil: 'networkidle' });   // 等於被系統清掉之後重開
await page.waitForSelector('#view-home.active');
ok('reopening after a kill offers the unfinished walk back', await page.isVisible('#resume'));
ok('and says where it stopped',
   (await page.textContent('#resume-where')).includes(`第 ${at + 1} 步`));

await page.click('#resume-go');
await page.waitForSelector('#view-prayer.active');
ok('carrying on picks up at the same bead', await page.evaluate((i) =>
   JSON.parse(localStorage.getItem('mercy.pocket.v1')).index === i, at));
ok('and the watch controls are live again',
   await page.evaluate(() => typeof window.__handlers.nexttrack === 'function'
     && !document.querySelector('#hold').paused));

// ── 走完 ──
const total = await page.evaluate(() => Number(document.querySelector('#progress-fill')
  .closest('.progress').getAttribute('aria-valuemax')));
ok('the progress bar is a percentage', total === 100);
for (let i = 0; i < 80; i++) {
  if (await page.isVisible('#view-done.active')) break;
  await fire('nexttrack');
}
await page.waitForTimeout(200);
ok('the last press finishes the prayer', await page.isVisible('#view-done.active'));

const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.records.v1')).at(-1));
ok('the walk is recorded', rec && rec.set === 'chaplet');
ok('and marked as a pocket-mode prayer', rec.mode === 'pocket');
ok('the unfinished progress is cleared once it is done',
   await page.evaluate(() => localStorage.getItem('mercy.pocket.v1') === null));
ok('and the track is stopped — nothing left holding the tab awake',
   await page.evaluate(() => document.querySelector('#hold').paused));

await page.click('#done-home');
await page.waitForTimeout(200);
await page.click('[data-go="history"]');
await page.waitForTimeout(400);
ok('the record shows up tagged as a pocket prayer in the log', await page.evaluate(() => {
  const l = document.querySelector('#log li');
  return !!l && l.textContent.includes('口袋');
}));
ok('and the flower counts it like any other',
   await page.locator('#rose .flower.chaplet').count() === 1);
await page.click('#view-history [data-go="home"]');
await page.waitForTimeout(200);

// ── 記成一次 ──
await page.evaluate(() => {
  localStorage.setItem('mercy.pocket.v1', JSON.stringify({
    startedAt: Date.now() - 600000, index: 40, set: 'chaplet', mystery: null }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#view-home.active');
await page.click('#resume-log');
await page.waitForTimeout(250);
const logged = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.records.v1')).at(-1));
ok('an abandoned walk can be recorded without praying it again', logged.mode === 'pocket');
ok('and its length is taken from when it started', logged.secs > 500 && logged.secs < 700);
ok('the card goes away once it is dealt with', !(await page.isVisible('#resume')));

await page.evaluate(() => {
  localStorage.setItem('mercy.pocket.v1', JSON.stringify({
    startedAt: Date.now(), index: 3, set: 'chaplet', mystery: null }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#view-home.active');
const before = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.records.v1')).length);
await page.click('#resume-drop');
await page.waitForTimeout(200);
ok('throwing the progress away leaves no record behind',
   await page.evaluate((n) => JSON.parse(localStorage.getItem('mercy.records.v1')).length === n, before));
ok('and the card is gone', !(await page.isVisible('#resume')));

// ── 平常的祈禱不該被影響 ──
await page.click('#start-btn');
await page.waitForSelector('#view-prayer.active');
ok('an ordinary prayer is not in pocket mode', !(await page.isVisible('#pocket-bar')));
ok('and plays nothing', await page.evaluate(() => document.querySelector('#hold').paused));
ok('and keeps the full-text toggle', await page.isVisible('#mode-toggle'));
ok('and does not leave pocket progress behind',
   await page.evaluate(() => localStorage.getItem('mercy.pocket.v1') === null));

// ── 自我檢查 ──
// 手錶沒反應時，要分得出是這支程式沒交出控制，還是手錶那頭沒接上
await page.click('#prayer-exit');
await page.waitForTimeout(250);
await page.click('[data-go="settings"]');
await page.waitForTimeout(200);
ok('settings offers a way to check the watch link', await page.isVisible('#probe-btn'));
await page.click('#probe-btn');
await page.waitForTimeout(400);
ok('the check plays the track', await page.evaluate(() => !document.querySelector('#hold').paused));
ok('and reports what it found', await page.isVisible('#probe-out'));
const probed = () => page.textContent('#probe-out');
ok('it says the track is playing', (await probed()).includes('是'));
ok('and how long the track is', /\d+ 秒/.test(await probed()));
ok('it starts with no presses received', (await probed()).includes('⏭ 0'));

await fire('nexttrack');
await fire('nexttrack');
await fire('previoustrack');
await page.waitForTimeout(200);
const counted = await probed();
ok('pressing the watch is counted, so a dead link is visible',
   counted.includes('⏭ 2') && counted.includes('⏮ 1'));
ok('the check does not start a prayer', !(await page.isVisible('#view-prayer.active')));
ok('and leaves no record behind', await page.evaluate((n) =>
   JSON.parse(localStorage.getItem('mercy.records.v1')).length === n, before));

await page.click('#probe-btn');
await page.waitForTimeout(250);
ok('stopping the check stops the track', await page.evaluate(() =>
   document.querySelector('#hold').paused));
ok('and clears the readout', !(await page.isVisible('#probe-out')));

console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'no console errors');
await browser.close();
process.exit(failures || errors.length ? 1 : 0);
