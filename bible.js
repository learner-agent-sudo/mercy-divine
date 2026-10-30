/* 讀經：瑪竇、馬爾谷、路加、若望福音與宗徒大事錄。
   經文在 bible/，拆章節的程式在 bible-parse.js，事件對照在 data/gospel-events.json。
   讀過哪幾節只存在本機（mercy.bible.v1）。與祈禱各自獨立。
   整份包在函式裡，只把 app.js 會呼叫的幾個名稱放到全域。 */
(() => {
'use strict';

const K_BIBLE = 'mercy.bible.v1';
const LOG_MAX = 3000;
const IDS = BIBLE_BOOKS.map((b) => b.id);
const ABBR = Object.fromEntries(BIBLE_BOOKS.map((b) => [b.id, b.abbr]));
const SHORT = { mat: '瑪竇', mrk: '馬爾谷', luk: '路加', jhn: '若望', act: '宗徒大事錄' };
const TABS = [['books', '書卷'], ['events', '事件'], ['themes', '主題'], ['log', '紀錄']];
const KEY_RE = /^\d{1,3}:\d{1,3}$/;
const ID_RE = /^[\w-]{1,60}$/;
const RANGE_RE = /^(\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$/;
const MIRACLES = [['治病', '治病'], ['驅魔', '驅魔'], ['自然', '自然'], ['復活', '復活死人']];
const NO_EVENTS = '對照資料尚未載入。';

/* ── 小工具 ───────────────────────────────────────── */
const fmtNum = (n) => n.toLocaleString('en-US');
const pct = (a, b) => (b ? Math.floor((a * 100) / b) : 0);
const ordOf = (k) => { const [c, v] = k.split(':'); return c * 1000 + +v; };
const keyCmp = (a, b) => ordOf(a) - ordOf(b);
const CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const cnNum = (n) => (n < 10 ? CN[n] : n < 20 ? `十${CN[n % 10]}` : n < 100 ? `${CN[Math.floor(n / 10)]}十${CN[n % 10]}` : String(n));

// '5:1'、'5:12' → '5:1-12'；跨章 '8:34'、'9:1' → '8:34-9:1'
function labelRange(from, to) {
  const [c1, v1] = from.split(':');
  const [c2, v2] = to.split(':');
  if (c1 === c2) return v1 === v2 ? `${c1}:${v1}` : `${c1}:${v1}-${v2}`;
  return `${from}-${to}`;
}

// 在遞增的陣列裡找：第一個 >= x 的位置、第一個 > x 的位置
function lower(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; }
  return lo;
}
function upper(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= x) lo = m + 1; else hi = m; }
  return lo;
}

function btn(text, cls, fn) {
  const b = el('button', cls, text);
  b.type = 'button';
  if (fn) b.addEventListener('click', fn);
  return b;
}
const bodyEl = () => document.getElementById('bible-body');
const setTitle = (t) => { document.getElementById('bible-title').textContent = t; };

/* ── 進度（localStorage） ─────────────────────────── */
// 一筆紀錄只收長得像樣的：備份檔可能來自他處
function cleanLog(r) {
  if (!r || typeof r !== 'object') return null;
  const { at, book, from, to, title } = r;
  if (typeof at !== 'string' || at.length > 40 || !IDS.includes(book)) return null;
  if (typeof from !== 'string' || typeof to !== 'string' || !KEY_RE.test(from) || !KEY_RE.test(to)) return null;
  const t = Date.parse(at);
  if (Number.isNaN(t)) return null;
  return { at: new Date(t).toISOString(), book, from, to, title: typeof title === 'string' ? title.slice(0, 80) : '' };
}

function cleanLast(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const last = {};
  if (IDS.includes(raw.book) && Number.isInteger(raw.c) && raw.c >= 1 && raw.c <= 200) { last.book = raw.book; last.c = raw.c; }
  if (typeof raw.ev === 'string' && ID_RE.test(raw.ev)) last.ev = raw.ev;
  return Object.keys(last).length ? last : null;
}

function readProgress() {
  const raw = store.read(K_BIBLE, null);
  const p = { read: {}, log: [], last: null };
  for (const id of IDS) {
    const arr = raw && raw.read && Array.isArray(raw.read[id]) ? raw.read[id] : [];
    p.read[id] = new Set(arr.filter((k) => typeof k === 'string' && KEY_RE.test(k)));
  }
  if (raw && Array.isArray(raw.log)) p.log = raw.log.map(cleanLog).filter(Boolean).slice(-LOG_MAX);
  if (raw) p.last = cleanLast(raw.last);
  return p;
}

const prog = readProgress();

function snapshot() {
  const read = {};
  for (const id of IDS) read[id] = [...prog.read[id]].sort(keyCmp);
  return { read, log: prog.log, last: prog.last };
}
const persist = () => store.write(K_BIBLE, snapshot());

const hasProgress = () => IDS.some((id) => prog.read[id].size) || prog.log.length > 0;

// 備份：有進度才交出去
function bibleExport() {
  return hasProgress() ? snapshot() : null;
}

// 備份檔裡的讀經進度：已讀的節取聯集，紀錄去掉重複，一律逐項檢查
function bibleImport(raw) {
  const added = { verses: 0, logs: 0 };
  if (!raw || typeof raw !== 'object') return added;
  const src = raw.read && typeof raw.read === 'object' ? raw.read : {};
  for (const id of IDS) {
    const arr = Array.isArray(src[id]) ? src[id].slice(0, 6000) : [];
    for (const k of arr) {
      if (typeof k !== 'string' || !KEY_RE.test(k) || prog.read[id].has(k)) continue;
      if (data && !data.byId[id].keyIdx.has(k)) continue;     // 經文載入後，不存在的節不收
      prog.read[id].add(k);
      added.verses++;
    }
  }
  const id = (r) => `${r.at}|${r.book}|${r.from}|${r.to}`;
  const have = new Set(prog.log.map(id));
  for (const r of Array.isArray(raw.log) ? raw.log.slice(-LOG_MAX) : []) {
    const c = cleanLog(r);
    if (!c || have.has(id(c))) continue;
    have.add(id(c));
    prog.log.push(c);
    added.logs++;
  }
  if (added.logs) {
    prog.log.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    if (prog.log.length > LOG_MAX) prog.log.splice(0, prog.log.length - LOG_MAX);
  }
  const last = cleanLast(raw.last);
  if (last && !prog.last) prog.last = last;
  if (added.verses || added.logs || (last && prog.last === last)) { persist(); refresh(); }
  return added;
}

/* ── 載入與整理 ───────────────────────────────────── */
let data = null;              // 載入完成後 { books, byId, events, evById, phases, ... }
let loadPromise = null;

const embedded = {};          // 單檔預覽版嵌在頁面裡的資料，只解析一次
function inline(id) {
  if (!(id in embedded)) {
    try { embedded[id] = inlineJSON(id); } catch { embedded[id] = null; }
  }
  return embedded[id];
}

async function fetchAll() {
  const packed = inline('data-bible');            // 單檔預覽版把內容嵌在頁面裡
  if (packed) return { raws: packed, events: inline('data-events') };
  const raws = {};
  const books = Promise.all(BIBLE_BOOKS.map(async (b) => {
    const r = await fetch(b.file);
    if (!r.ok) throw new Error(b.file);
    raws[b.id] = await r.text();
  }));
  // 沒有對照資料也能讀經，所以這份失敗不算失敗
  const events = fetch('data/gospel-events.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  await books;
  return { raws, events: await events };
}

function load() {
  if (!loadPromise) {
    loadPromise = fetchAll().then(build).catch((e) => { loadPromise = null; throw e; });
  }
  return loadPromise;
}

function makeBook(meta, p) {
  const book = {
    id: meta.id, abbr: meta.abbr, title: p.title, nch: p.chapters.length - 1, chapters: p.chapters,
    entries: [], keys: [], ords: [], keyIdx: new Map(), e1: [], secs: [], chKeys: [null], ranges: [],
  };
  p.chapters.forEach((list, c) => (list || []).forEach((e) => {
    e.c = c;
    e.i = book.entries.length;
    e.ord0 = c * 1000 + e.v;
    e.ord1 = c * 1000 + (e.to || e.v);
    book.entries.push(e);
    book.e1.push(e.ord1);
  }));
  const keysOf = (e) => { const out = []; for (let n = e.v; n <= (e.to || e.v); n++) out.push(`${e.c}:${n}`); return out; };
  for (const e of book.entries) {
    for (const k of keysOf(e)) {
      if (book.keyIdx.has(k)) continue;           // 句中換段的下半句和上半句是同一節
      book.keyIdx.set(k, book.keys.length);
      book.keys.push(k);
      book.ords.push(ordOf(k));
      (book.chKeys[e.c] = book.chKeys[e.c] || []).push(k);
    }
  }
  for (let c = 1; c <= book.nch; c++) if (!book.chKeys[c]) book.chKeys[c] = [];

  // 每個小標題從哪一筆經文開始；到下一個小標題之前都屬於它
  const starts = p.sections
    .map((s) => ({ s, a: book.entries.findIndex((e) => e.c === s.c && e.v === s.v && !!e.cont === !!s.cont) }))
    .filter((x) => x.a >= 0)
    .sort((x, y) => x.a - y.a);
  if (book.entries.length && (!starts.length || starts[0].a > 0)) starts.unshift({ s: { title: '', parts: [] }, a: 0 });
  starts.forEach((x, i) => {
    const a = x.a;
    const z = i + 1 < starts.length ? starts[i + 1].a : book.entries.length;
    const keys = [];
    for (let j = a; j < z; j++) { book.entries[j].sec = i; for (const k of keysOf(book.entries[j])) if (!keys.includes(k)) keys.push(k); }
    const first = book.entries[a], end = book.entries[z - 1];
    book.secs.push({
      book: meta.id, i, title: x.s.title, parts: x.s.parts || [], a, z, c: first.c, v: first.v, keys,
      label: labelRange(`${first.c}:${first.v}`, `${end.c}:${end.to || end.v}`),
      lo: first.ord0, hi: end.ord1,
    });
  });
  return book;
}

function makeEvents(raw, byId) {
  if (!raw || !Array.isArray(raw.events)) return null;
  const phases = new Map((Array.isArray(raw.phases) ? raw.phases : []).map((p) => [p.id, p.title]));
  const events = [];
  for (const e of raw.events) {
    if (!e || typeof e.id !== 'string' || typeof e.title !== 'string' || !e.refs || typeof e.refs !== 'object') continue;
    const ev = {
      id: e.id, title: e.title, phase: e.phase, tags: Array.isArray(e.tags) ? e.tags : [],
      note: typeof e.note === 'string' ? e.note : '', see: Array.isArray(e.see) ? e.see : [],
      acc: {}, keyRef: null, n: events.length,
    };
    for (const id of IDS) {
      if (!Array.isArray(e.refs[id])) continue;
      const book = byId[id];
      const ranges = [];
      for (const r of e.refs[id]) {
        const m = RANGE_RE.exec(String(r));
        if (!m) continue;
        const lo = m[1] * 1000 + +m[2];
        const hi = (m[3] || m[1]) * 1000 + +(m[4] || m[2]);
        const a = lower(book.ords, lo), z = upper(book.ords, hi);
        if (hi < lo || z <= a) continue;
        const keys = book.keys.slice(a, z);
        ranges.push({ lo, hi, label: String(r), keys, from: keys[0], to: keys[keys.length - 1] });
      }
      if (!ranges.length) continue;
      ev.acc[id] = { ranges, keys: [...new Set(ranges.flatMap((r) => r.keys))], label: ranges.map((r) => r.label).join('、') };
      for (const r of ranges) book.ranges.push({ ev, lo: r.lo, hi: r.hi });
    }
    if (!Object.keys(ev.acc).length) continue;
    const k = /^(\w+) (\d+:\d+)$/.exec(String(e.key || ''));
    if (k && byId[k[1]]) ev.keyRef = { book: k[1], key: k[2] };
    events.push(ev);
  }
  const evById = new Map(events.map((ev) => [ev.id, ev]));
  return { events, evById, phases };
}

function build({ raws, events }) {
  const books = BIBLE_BOOKS.map((meta) => {
    if (typeof raws[meta.id] !== 'string') throw new Error(`缺少 ${meta.file}`);
    return makeBook(meta, parseBook(raws[meta.id]));
  });
  const byId = Object.fromEntries(books.map((b) => [b.id, b]));
  let ev = null;
  try { ev = makeEvents(events, byId); } catch { ev = null; }
  data = {
    books, byId, secs: books.flatMap((b) => b.secs),
    events: ev ? ev.events : null, evById: ev ? ev.evById : null, phases: ev ? ev.phases : null,
  };
  return data;
}

// 某一卷在 lo～hi（章×1000＋節）之間的經文
function entriesIn(book, lo, hi) {
  const out = [];
  for (let i = lower(book.e1, lo); i < book.entries.length; i++) {
    const e = book.entries[i];
    if (e.ord0 > hi) break;
    out.push(e);
  }
  return out;
}

/* ── 已讀的狀態 ───────────────────────────────────── */
function stateOf(id, keys) {
  const set = prog.read[id];
  let n = 0;
  for (const k of keys) if (set.has(k)) n++;
  return n === 0 ? 'none' : n === keys.length ? 'all' : 'part';
}
const countRead = (id, keys) => { let n = 0; for (const k of keys) if (prog.read[id].has(k)) n++; return n; };

function totals() {
  let read = 0, total = 0;
  for (const b of data.books) { total += b.keys.length; read += countRead(b.id, b.keys); }
  return { read, total };
}

const evState = (ev) => {
  const s = Object.keys(ev.acc).map((id) => stateOf(id, ev.acc[id].keys));
  return s.every((x) => x === 'all') ? 'all' : s.every((x) => x === 'none') ? 'none' : 'part';
};

// 畫面上跟已讀有關的零件各自登記一個更新函式；按「讀完了」之後一起跑一遍，不必重畫整頁
let live = [];
function refresh() {
  for (const f of live) f();
  renderBibleHome();
}

function addLog(u) {
  const at = new Date().toISOString();
  for (const r of u.ranges) prog.log.push({ at, book: u.book, from: r.from, to: r.to, title: u.title });
  if (prog.log.length > LOG_MAX) prog.log.splice(0, prog.log.length - LOG_MAX);
}

// u = { book, keys, ranges: [{from, to}], title, ref }
function toggleUnit(u) {
  const set = prog.read[u.book];
  if (stateOf(u.book, u.keys) === 'all') {
    for (const k of u.keys) set.delete(k);          // 取消只拿掉已讀的標記，紀錄留著
    toast(`已取消：${u.ref}`);
  } else {
    for (const k of u.keys) set.add(k);
    addLog(u);
    toast(`已記下：${u.ref}`);
  }
  persist();
  refresh();
}

function doneButton(u) {
  const b = btn('', 'btn btn-block bible-done', () => toggleUnit(u));
  const paint = () => {
    const all = stateOf(u.book, u.keys) === 'all';
    b.textContent = all ? '✓ 已讀' : '讀完了';
    b.classList.toggle('is-done', all);
    b.setAttribute('aria-pressed', String(all));
  };
  paint();
  live.push(paint);
  return b;
}

const sectionUnit = (book, sec) => ({
  book: book.id, keys: sec.keys, title: sec.title, ref: `${book.abbr} ${sec.label}`,
  ranges: [{ from: sec.keys[0], to: sec.keys[sec.keys.length - 1] }],
});
const accountUnit = (book, ev) => ({
  book: book.id, keys: ev.acc[book.id].keys, title: ev.title, ref: `${book.abbr} ${ev.acc[book.id].label}`,
  ranges: ev.acc[book.id].ranges.map((r) => ({ from: r.from, to: r.to })),
});

/* ── 往下讀 ───────────────────────────────────────── */
// 從上次讀到的那一章起，依書卷順序找第一段還沒讀完的小標題（讀到底就從頭繞回來）
function nextSection() {
  const all = data.secs;
  if (!all.length) return null;
  let start = 0;
  const last = prog.last;
  if (last && last.book) {
    const i = all.findIndex((s) => s.book === last.book && s.c >= last.c);
    if (i >= 0) start = i;
  }
  for (let n = 0; n < all.length; n++) {
    const s = all[(start + n) % all.length];
    if (stateOf(s.book, s.keys) !== 'all') return s;
  }
  return null;
}

// 事件：從上次看的那一件起，找第一件還有福音沒讀的
function nextEvent() {
  const list = data.events;
  if (!list || !list.length) return null;
  const at = prog.last && prog.last.ev && data.evById.get(prog.last.ev);
  const start = at ? at.n : 0;
  for (let n = 0; n < list.length; n++) {
    const ev = list[(start + n) % list.length];
    if (evState(ev) !== 'all') return ev;
  }
  return null;
}

const firstUnread = (ev) => {
  const ids = IDS.filter((id) => ev.acc[id]);
  return ids.find((id) => stateOf(id, ev.acc[id].keys) !== 'all') || ids[0];
};

/* ── 換畫面 ───────────────────────────────────────── */
let shown = null;             // 目前畫面的參數
let renderToken = 0;

// 往裡面走：加一筆歷史，手機的返回鍵就能一層一層退出來。
// replace 用在翻頁（上一章、下一個事件、換分頁），這樣返回鍵退的是「離開這一卷」。
function nav(st, replace) {
  const cur = history.state;
  if (!replace && cur && cur.bible) {
    // 記下現在捲到哪裡，退回來時才回得到同一個位置
    history.replaceState({ ...cur, bible: { ...cur.bible, y: Math.round(window.scrollY) } }, '');
  }
  const entry = { view: 'bible', bible: st };
  if (replace) history.replaceState(entry, ''); else history.pushState(entry, '');
  bibleShow(st);
}

function bibleShow(st) {
  st = st || { screen: 'hub' };
  shown = st;
  if (current !== 'bible') go('bible');
  const token = ++renderToken;
  if (data) { paint(st); return; }
  setTitle('讀經');
  bodyEl().textContent = '';
  bodyEl().append(el('p', 'empty', '載入中⋯'));
  load().then(
    () => { if (token === renderToken) paint(st); },
    () => {
      if (token !== renderToken) return;
      const host = bodyEl();
      host.textContent = '';
      host.append(el('p', 'empty', '無法載入經文檔案。'), btn('再試一次', 'btn btn-block', () => bibleShow(st)));
    },
  );
}

function paint(st) {
  const host = bodyEl();
  host.textContent = '';
  live = [];
  window.scrollTo(0, 0);
  const screens = { book: paintBook, chapter: paintChapter, event: paintEvent };
  (screens[st.screen] || paintHub)(host, st);
  if (typeof st.y === 'number') window.scrollTo(0, st.y);
}

/* ── 首頁的卡片 ───────────────────────────────────── */
function renderBibleHome() {
  const line = document.getElementById('bible-home-line');
  const fill = document.getElementById('bible-home-fill');
  if (!line || !fill || !data) return;           // 載入前維持 HTML 裡原本的說明
  const t = totals();
  line.textContent = t.read
    ? `已讀 ${fmtNum(t.read)}／${fmtNum(t.total)} 節（${pct(t.read, t.total)}%）`
    : `共 ${fmtNum(t.total)} 節，從頭慢慢讀`;
  fill.style.width = `${(t.read * 100) / (t.total || 1)}%`;
}

async function homeContinue() {
  try { await load(); } catch { toast('無法載入經文檔案'); return; }
  const s = nextSection();
  if (!s) { toast('五卷都讀完了'); return; }
  nav({ screen: 'chapter', book: s.book, c: s.c, sec: s.i });
}

/* ── 大廳：進度、四個分頁 ─────────────────────────── */
function paintHub(host) {
  setTitle('讀經');
  const tab = TABS.some(([id]) => id === settings.bibleTab) ? settings.bibleTab : 'books';
  host.append(summary(tab), tabsRow(tab));
  const panel = el('div', 'bible-panel');
  panel.id = 'bible-panel';
  host.append(panel);
  ({ books: paintBooksTab, events: paintEventsTab, themes: paintThemesTab, log: paintLogTab })[tab](panel);
  host.append(footer());
}

function summary(tab) {
  const card = el('div', 'card bible-sum');
  const t = totals();
  card.append(el('p', 'bible-sum-line', `已讀 ${fmtNum(t.read)}／${fmtNum(t.total)} 節（${pct(t.read, t.total)}%）`));
  const bar = el('div', 'bible-bar');
  const fill = el('span');
  fill.style.width = `${(t.read * 100) / (t.total || 1)}%`;
  bar.append(fill);
  card.append(bar);

  const byEvent = tab === 'events' && data.events;
  const next = byEvent ? nextEvent() : nextSection();
  const cont = btn(next ? '繼續讀' : '都讀完了', 'btn btn-primary btn-block', () => {
    if (byEvent) nav({ screen: 'event', id: next.id, book: firstUnread(next) });
    else nav({ screen: 'chapter', book: next.book, c: next.c, sec: next.i });
  });
  cont.id = 'bible-hub-continue';
  cont.disabled = !next;
  card.append(cont);
  if (next) {
    card.append(el('p', 'hint bible-next', byEvent
      ? `下一件：${next.title}`
      : `下一段：${ABBR[next.book]} ${next.label}${next.title ? `　${next.title}` : ''}`));
  }
  return card;
}

function tabsRow(tab) {
  const row = el('div', 'bible-tabs');
  row.setAttribute('role', 'tablist');
  for (const [id, label] of TABS) {
    const b = btn(label, 'bible-tab', () => {
      if (settings.bibleTab === id) return;
      settings.bibleTab = id;
      saveSettings();
      paint({ screen: 'hub', y: Math.round(window.scrollY) });
    });
    b.dataset.tab = id;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(id === tab));
    row.append(b);
  }
  return row;
}

const noEvents = () => el('p', 'hint bible-noevents', NO_EVENTS);

/* 書卷 */
function paintBooksTab(panel) {
  for (const b of data.books) {
    const n = countRead(b.id, b.keys);
    const item = btn('', 'bible-book', () => nav({ screen: 'book', book: b.id }));
    item.dataset.book = b.id;
    const top = el('span', 'bb-top');
    top.append(el('span', 'bb-name', b.title), el('span', 'bb-pct', `${pct(n, b.keys.length)}%`));
    const bar = el('span', 'bible-bar');
    const fill = el('span');
    fill.style.width = `${(n * 100) / (b.keys.length || 1)}%`;
    bar.append(fill);
    item.append(top, bar, el('span', 'bb-sub', `${b.nch} 章 · ${fmtNum(n)}／${fmtNum(b.keys.length)} 節`));
    panel.append(item);
  }
  panel.append(searchBox());
}

/* 搜尋：經文與小標題都找；至少兩個字，最多列一百處 */
let lastQuery = '';
function searchBox() {
  const wrap = el('div', 'bible-search');
  const label = el('label', 'field');
  label.append(el('span', 'field-label', '搜尋經文'));
  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'bible-search';
  input.value = lastQuery;
  input.placeholder = '至少輸入兩個字';
  input.autocomplete = 'off';
  input.setAttribute('enterkeyhint', 'search');
  label.append(input);
  const out = el('div', 'bible-results');
  out.id = 'bible-results';
  wrap.append(label, out);

  let timer;
  const run = () => { lastQuery = input.value.trim(); showResults(out, lastQuery); };
  input.addEventListener('input', (e) => {
    if (e.isComposing) return;                      // 注音、拼音還在組字時先不找
    clearTimeout(timer);
    timer = setTimeout(run, 180);
  });
  input.addEventListener('compositionend', () => { clearTimeout(timer); timer = setTimeout(run, 60); });
  run();
  return wrap;
}

function snippet(text, at, len) {
  const from = Math.max(0, at - 12);
  const to = Math.min(text.length, at + len + 26);
  const frag = document.createDocumentFragment();
  frag.append(`${from > 0 ? '…' : ''}${text.slice(from, at)}`);
  frag.append(el('mark', null, text.slice(at, at + len)));
  frag.append(`${text.slice(at + len, to)}${to < text.length ? '…' : ''}`);
  return frag;
}

function showResults(out, q) {
  out.textContent = '';
  if (!q) return;
  if ([...q].length < 2) { out.append(el('p', 'hint', '至少輸入兩個字。')); return; }
  const items = [];
  let total = 0;
  const hit = (item) => { total++; if (items.length < 100) items.push(item); };
  for (const b of data.books) {
    for (const s of b.secs) {
      const text = [...s.parts, s.title].find((t) => t.includes(q));
      if (text) hit({ b, c: s.c, v: s.v, text, at: text.indexOf(q), heading: true });
    }
  }
  for (const b of data.books) {
    for (const e of b.entries) {
      const at = e.t.indexOf(q);
      if (at >= 0) hit({ b, c: e.c, v: e.v, text: e.t, at, heading: false });
    }
  }
  if (!total) { out.append(el('p', 'hint', '找不到。')); return; }
  out.append(el('p', 'hint bible-count', total > items.length ? `共 ${fmtNum(total)} 處，列出前 ${items.length} 處` : `共 ${fmtNum(total)} 處`));
  for (const r of items) {
    const row = btn('', 'bible-result', () => nav({ screen: 'chapter', book: r.b.id, c: r.c, v: r.v }));
    row.append(el('span', 'br-ref', `${r.b.abbr} ${r.c}:${r.v}`));
    const text = el('span', 'br-text');
    if (r.heading) text.append(el('span', 'br-tag', '小標題'));
    text.append(snippet(r.text, r.at, q.length));
    row.append(text);
    out.append(row);
  }
}

/* 事件：依時間排的時間軸 */
const badges = (ev) => {
  const row = el('span', 'tl-meta');
  for (const id of IDS) {
    if (!ev.acc[id]) continue;
    const s = stateOf(id, ev.acc[id].keys);
    row.append(el('span', `bdg${s === 'all' ? ' done' : s === 'part' ? ' part' : ''}`, ABBR[id]));
  }
  if (Object.keys(ev.acc).length === 1) row.append(el('span', 'uniq', '獨有'));
  return row;
};

// 時期可以收起來；第一次打開時只展開「繼續讀」會讀到的那一期
let phaseOpen = null;
function paintEventsTab(panel) {
  if (!data.events) { panel.append(noEvents()); return; }
  const open = (e) => {
    const node = e.target.closest('[data-ev]');
    if (node) nav({ screen: 'event', id: node.dataset.ev, book: firstUnread(data.evById.get(node.dataset.ev)) });
  };
  if (!phaseOpen) {
    const next = nextEvent();
    phaseOpen = new Set(next ? [next.phase] : []);
  }
  const count = new Map();                          // 每個時期讀完幾件
  for (const ev of data.events) {
    const c = count.get(ev.phase) || [0, 0];
    c[1]++;
    if (evState(ev) === 'all') c[0]++;
    count.set(ev.phase, c);
  }

  const groups = [];
  const all = btn('', 'btn btn-tiny tl-all', () => {
    const opening = groups.some((d) => !d.open);
    for (const d of groups) d.open = opening;
  });
  const label = () => { all.textContent = groups.every((d) => d.open) ? '全部收起' : '全部展開'; };
  panel.append(el('div', 'tl-tools'));
  panel.lastChild.append(all);

  let list = null, phase = null;
  for (const ev of data.events) {
    if (!list || ev.phase !== phase) {
      phase = ev.phase;
      const d = document.createElement('details');
      d.className = 'th-group tl-group';
      d.open = phaseOpen.has(phase);
      const id = phase;
      d.addEventListener('toggle', () => { if (d.open) phaseOpen.add(id); else phaseOpen.delete(id); label(); });
      const head = document.createElement('summary');
      head.className = 'tl-phase';
      const c = count.get(phase);
      head.append(el('span', null, data.phases.get(phase) || '其他'), el('small', null, `${c[0]}／${c[1]}`));
      list = el('ol', 'tl');
      list.addEventListener('click', open);
      d.append(head, list);
      groups.push(d);
      panel.append(d);
    }
    const li = el('li', 'tl-item');
    li.dataset.state = evState(ev);
    const node = btn('', 'tl-node');
    node.dataset.ev = ev.id;
    node.append(el('span', 'tl-title', ev.title), badges(ev));
    li.append(node);
    list.append(li);
  }
  label();
}

/* 主題：奇蹟（治病、驅魔、自然、復活死人）、比喻、講道 */
const themeOpen = new Set(['奇蹟']);
function quoteOf(ev) {
  const k = ev.keyRef;
  if (!k) return null;
  const book = data.byId[k.book];
  const o = ordOf(k.key);
  // 外面會再加一對「」，經文自己頭尾的引號先拿掉，免得變成「「⋯」」
  const text = entriesIn(book, o, o).map((e) => e.t).join('').replace(/^[「『]+/, '').replace(/[」』]+$/, '');
  if (!text) return null;
  return { text: text.length > 40 ? `${text.slice(0, 40)}…` : text, ref: `${book.abbr} ${k.key}` };
}

function themeItem(ev) {
  const b = btn('', 'th-item', () => nav({ screen: 'event', id: ev.id, book: firstUnread(ev) }));
  b.dataset.ev = ev.id;
  b.dataset.state = evState(ev);
  b.append(el('span', 'th-title', ev.title));
  const q = quoteOf(ev);
  if (q) {
    const line = el('span', 'th-quote', `「${q.text}」`);
    line.append(el('span', 'th-ref', ` ${q.ref}`));
    b.append(line);
  }
  b.append(badges(ev));
  return b;
}

function themeGroup(name, count, fill) {
  const d = document.createElement('details');
  d.className = 'th-group';
  d.open = themeOpen.has(name);
  d.addEventListener('toggle', () => { if (d.open) themeOpen.add(name); else themeOpen.delete(name); });
  const s = document.createElement('summary');
  s.append(name, el('small', null, ` ${count}`));
  d.append(s);
  fill(d);
  return d;
}

// 幾部福音共同記載的排在前面，只有一部記載的（獨有）在後；同樣多的照時間先後
const GOSPELS = ['mat', 'mrk', 'luk', 'jhn'];
const tellers = (ev) => GOSPELS.filter((id) => ev.acc[id]).length;
const commonFirst = (list) => list.map((ev, i) => [ev, i])
  .sort((a, b) => tellers(b[0]) - tellers(a[0]) || a[1] - b[1]).map(([ev]) => ev);

function paintThemesTab(panel) {
  if (!data.events) { panel.append(noEvents()); return; }
  const evs = commonFirst(data.events);
  const miracles = evs.filter((ev) => ev.tags.includes('奇蹟'));
  // 一件奇蹟有好幾個細類時（雅依洛的女兒：治病、復活），只放在排第一的那個底下
  const subOf = (ev) => (ev.tags.map((t) => MIRACLES.find(([tag]) => tag === t)).find(Boolean) || [null, '其他'])[1];
  panel.append(themeGroup('奇蹟', miracles.length, (d) => {
    for (const [, label] of [...MIRACLES, [null, '其他']]) {
      const items = miracles.filter((ev) => subOf(ev) === label);
      if (!items.length) continue;
      d.append(el('h4', 'th-sub', label));
      for (const ev of items) d.append(themeItem(ev));
    }
  }));
  for (const tag of ['比喻', '講道']) {
    const items = evs.filter((ev) => ev.tags.includes(tag));
    panel.append(themeGroup(tag, items.length, (d) => { for (const ev of items) d.append(themeItem(ev)); }));
  }
}

/* 紀錄：依日期分組，新的在前 */
const DOW = '日一二三四五六';
const dayTitle = (d) => `${d.getFullYear() === new Date().getFullYear() ? '' : `${d.getFullYear()}年`}${d.getMonth() + 1}月${d.getDate()}日（星期${DOW[d.getDay()]}）`;
let logShown = 120;

function paintLogTab(panel) {
  const now = new Date();
  const days = new Set(prog.log.map((r) => new Date(r.at)).filter((d) => d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()).map(dayKey));
  panel.append(el('p', 'bible-log-sum', `本月讀經 ${days.size} 天 · 累計讀完 ${fmtNum(prog.log.length)} 段`));
  if (!prog.log.length) {
    panel.append(el('p', 'empty', '還沒有紀錄。讀完一段，按「讀完了」，這裡就會留下記號。'));
    return;
  }
  const recent = prog.log.slice(-logShown).reverse();
  let day = null;
  for (const r of recent) {
    const d = new Date(r.at);
    const k = dayKey(d);
    if (k !== day) { day = k; panel.append(el('h3', 'bl-day', dayTitle(d))); }
    const row = btn('', 'bl-row', () => {
      const [c, v] = r.from.split(':');
      nav({ screen: 'chapter', book: r.book, c: +c, v: +v });
    });
    row.append(el('span', 'bl-ref', `${ABBR[r.book]} ${labelRange(r.from, r.to)}`), el('span', 'bl-title', r.title));
    panel.append(row);
  }
  if (prog.log.length > logShown) {
    panel.append(btn('顯示更早的', 'btn btn-block', () => { logShown += 120; paint({ screen: 'hub', y: Math.round(window.scrollY) }); }));
  }
}

/* 頁尾：經文出處 */
function noticeNodes(text) {
  const out = [];
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const s = line.trim();
    if (!s) continue;
    if (s === '---') { out.push(document.createElement('hr')); continue; }
    const clean = s.replace(/\*\*|`/g, '').replace(/<(https?:[^>]+)>/g, '$1').replace(/^[-*]\s+/, '・').replace(/^#+\s*/, '');
    out.push(el(/^#/.test(s) ? 'h3' : 'p', null, clean));
  }
  return out;
}

async function noticeText() {
  const packed = inline('data-bible');
  if (packed && typeof packed.readme === 'string') return packed.readme;
  const r = await fetch('bible/README.md');
  if (!r.ok) throw new Error('README');
  return r.text();
}

// 點連結先在原地展開出處與授權；README.md 本身手機會當成下載檔，不如直接讀給人看
function wireNotice(link, box) {
  link.addEventListener('click', async (e) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    box.hidden = !box.hidden;
    if (box.hidden || box.dataset.ready) return;
    const inner = box.querySelector('.bible-notice');
    inner.textContent = '載入中⋯';
    try {
      inner.replaceChildren(...noticeNodes(await noticeText()));
      box.dataset.ready = '1';
    } catch {
      inner.textContent = '無法載入，請見 bible/README.md。';
    }
  });
}

function footer() {
  const wrap = el('div', 'bible-foot');
  const p = el('p', 'hint', '經文：思高聖經譯本 · ');
  const link = el('a', 'bible-notice-link', '出處與授權');
  link.href = 'bible/README.md';
  link.target = '_blank';
  link.rel = 'noopener';
  p.append(link);
  const box = el('div', 'bible-credit');
  box.hidden = true;
  box.append(el('div', 'bible-notice'));
  wireNotice(link, box);
  wrap.append(p, box);
  return wrap;
}

/* ── 書卷：章的格子 ───────────────────────────────── */
function paintBook(host, st) {
  const book = data.byId[st.book];
  if (!book) { paintHub(host); return; }
  setTitle(book.title);
  const n = countRead(book.id, book.keys);
  const head = el('div', 'card bible-sum');
  head.append(el('p', 'bible-sum-line', `已讀 ${fmtNum(n)}／${fmtNum(book.keys.length)} 節（${pct(n, book.keys.length)}%）`));
  const bar = el('div', 'bible-bar');
  const fill = el('span');
  fill.style.width = `${(n * 100) / (book.keys.length || 1)}%`;
  bar.append(fill);
  head.append(bar);
  host.append(head);

  const grid = el('div', 'ch-grid');
  for (let c = 1; c <= book.nch; c++) {
    const keys = book.chKeys[c];
    const r = countRead(book.id, keys);
    const s = r === 0 ? 'none' : r === keys.length ? 'all' : 'part';
    const b = btn('', 'ch-btn', () => nav({ screen: 'chapter', book: book.id, c }));
    b.dataset.c = c;
    b.dataset.state = s;
    b.style.setProperty('--p', `${keys.length ? (r * 100) / keys.length : 0}%`);
    b.append(el('span', null, String(c)));
    b.setAttribute('aria-label', `第${cnNum(c)}章，${s === 'all' ? '已讀完' : s === 'part' ? '讀了一部分' : '還沒讀'}`);
    grid.append(b);
  }
  host.append(grid);
}

/* ── 章：經文、對照、讀完了 ───────────────────────── */
function verseEl(e) {
  const s = el('span', 'v');
  s.dataset.key = `${e.c}:${e.v}`;
  s.append(el('sup', e.cont ? 'vn vn-cont' : 'vn', e.cont ? '下' : e.to ? `${e.v}-${e.to}` : String(e.v)), e.t);
  return s;
}

// 這一段經文跟哪些事件重疊；別卷的記載做成可以點的小標籤
function parallelsEl(book, lo, hi) {
  const evs = [];
  for (const r of book.ranges) if (r.hi >= lo && r.lo <= hi && !evs.includes(r.ev)) evs.push(r.ev);
  if (!evs.length) return null;
  evs.sort((a, b) => a.n - b.n);
  const wrap = el('div', 'bible-par');
  for (const ev of evs) {
    const row = el('div', 'bible-par-row');
    const others = IDS.filter((id) => id !== book.id && ev.acc[id]);
    if (evs.length > 1) row.append(el('span', 'bible-par-title', ev.title));
    else if (others.length) row.append(el('span', 'bible-par-label', '對照'));
    if (!others.length) {
      const only = btn('獨有', 'bible-uniq', () => nav({ screen: 'event', id: ev.id, book: book.id }));
      only.setAttribute('aria-label', `${ev.title}：只有${SHORT[book.id]}記載`);
      row.append(only);
    }
    for (const id of others) {
      const chip = btn('', 'chip bible-chip', () => nav({ screen: 'event', id: ev.id, book: id }));
      chip.dataset.book = id;
      const text = `${ABBR[id]} ${ev.acc[id].label}`;
      const paint = () => { chip.textContent = stateOf(id, ev.acc[id].keys) === 'all' ? `✓ ${text}` : text; };
      paint();
      live.push(paint);
      row.append(chip);
    }
    wrap.append(row);
    if (ev.note) wrap.append(el('p', 'hint bible-note', ev.note));
  }
  return wrap;
}

function paintChapter(host, st) {
  const book = data.byId[st.book];
  if (!book) { paintHub(host); return; }
  const c = Math.min(Math.max(Number(st.c) || 1, 1), book.nch);
  setTitle(`${book.title} 第${cnNum(c)}章`);
  prog.last = { ...(prog.last || {}), book: book.id, c };
  persist();

  // 同一小段的連續經文歸成一塊。跨章的小段在它開始的那一章完整出現，
  // 下一章開頭那幾節則放在「（續）」底下，「讀完了」在整段的最後一塊。
  const blocks = [];
  for (const e of book.chapters[c] || []) {
    const b = blocks[blocks.length - 1];
    if (b && b.sec === e.sec) b.ents.push(e); else blocks.push({ sec: e.sec, ents: [e] });
  }
  const verses = new Map();
  const secNodes = new Map();
  for (const blk of blocks) {
    const sec = book.secs[blk.sec];
    const isStart = blk.ents[0].i === sec.a;
    const isEnd = blk.ents[blk.ents.length - 1].i === sec.z - 1;
    const node = el('section', 'bible-sec');
    node.dataset.sec = sec.i;
    if (isStart) for (const part of sec.parts) node.append(el('h3', 'bible-part', part));
    if (sec.title || !isStart) {
      const h = el('h4', 'bible-sec-title');
      h.append(el('span', null, isStart ? sec.title : `（續）${sec.title}`), el('span', 'bible-sec-ref', sec.label));
      node.append(h);
    }
    const text = el('div', 'bible-text');
    for (const e of blk.ents) {
      const v = verseEl(e);
      text.append(v);
      for (let n = e.v; n <= (e.to || e.v); n++) if (!e.cont || !verses.has(`${c}:${n}`)) verses.set(`${c}:${n}`, v);
    }
    node.append(text);
    if (!isEnd) {
      const next = book.entries[blk.ents[blk.ents.length - 1].i + 1];
      node.append(el('p', 'bible-more', `（下接第${cnNum(next.c)}章）`));
    }
    const par = parallelsEl(book, blk.ents[0].ord0, blk.ents[blk.ents.length - 1].ord1);
    if (par) node.append(par);
    if (isEnd) {
      node.append(doneButton(sectionUnit(book, sec)));
      live.push(() => node.classList.toggle('is-read', stateOf(book.id, sec.keys) === 'all'));
      live[live.length - 1]();
    }
    secNodes.set(sec.i, node);
    host.append(node);
  }
  if (!data.events) host.append(noEvents());

  const pager = el('div', 'bible-pager');
  const prev = btn('‹ 上一章', 'btn', () => nav({ screen: 'chapter', book: book.id, c: c - 1 }, true));
  const next = btn('下一章 ›', 'btn', () => nav({ screen: 'chapter', book: book.id, c: c + 1 }, true));
  prev.disabled = c <= 1;
  next.disabled = c >= book.nch;
  pager.append(prev, next);
  host.append(pager);

  if (typeof st.y === 'number') return;             // 從上一層退回來：位置由 paint 還原
  const target = st.v != null ? verses.get(`${c}:${st.v}`) : null;
  if (target) {
    target.scrollIntoView({ block: 'center' });
    target.classList.add('hl');
    setTimeout(() => target.classList.remove('hl'), 2400);
  } else if (st.sec != null && secNodes.get(st.sec)) {
    secNodes.get(st.sec).scrollIntoView({ block: 'start' });
  }
}

/* ── 事件：一件事在各福音裡的記載 ─────────────────── */
function paintEvent(host, st) {
  const ev = data.evById && data.evById.get(st.id);
  if (!ev) { paintHub(host); return; }
  setTitle('福音事件');
  const ids = IDS.filter((id) => ev.acc[id]);
  const cur = ids.includes(st.book) ? st.book : firstUnread(ev);
  prog.last = { ...(prog.last || {}), ev: ev.id };
  persist();

  host.append(el('h2', 'bible-ev-title', ev.title));
  const meta = el('div', 'bible-ev-meta');
  if (data.phases.get(ev.phase)) meta.append(el('span', 'bible-ev-phase', data.phases.get(ev.phase)));
  for (const t of ev.tags) meta.append(el('span', 'bible-tag', t));
  host.append(meta);
  if (ev.note) host.append(el('p', 'hint bible-note', ev.note));

  const see = ev.see.map((id) => data.evById.get(id)).filter(Boolean);
  if (see.length) {
    const row = el('div', 'bible-see');
    row.append(el('span', 'bible-par-label', '相關'));
    for (const o of see) row.append(btn(o.title, 'chip', () => nav({ screen: 'event', id: o.id, book: firstUnread(o) })));
    host.append(row);
  }

  const tabs = el('div', 'bible-etabs');
  tabs.setAttribute('role', 'tablist');
  for (const id of ids) {
    const b = btn('', 'bible-etab', () => { if (id !== cur) nav({ screen: 'event', id: ev.id, book: id }, true); });
    b.dataset.book = id;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(id === cur));
    const paint = () => { b.textContent = `${ABBR[id]}${stateOf(id, ev.acc[id].keys) === 'all' ? ' ✓' : ''}`; };
    paint();
    live.push(paint);
    tabs.append(b);
  }
  host.append(tabs);

  const book = data.byId[cur];
  const acc = ev.acc[cur];

  // 別卷已經讀過的話，提醒一聲（不重讀是這個功能的重點）
  const seen = el('p', 'bible-seen');
  const paintSeen = () => {
    const done = ids.filter((id) => id !== cur && stateOf(id, ev.acc[id].keys) === 'all');
    const show = done.length > 0 && stateOf(cur, acc.keys) !== 'all';
    seen.hidden = !show;
    if (show) seen.textContent = `這件事你已在 ${done.map((id) => ABBR[id]).join('、')} 讀過。這裡是 ${SHORT[cur]} 的記載。`;
  };
  paintSeen();
  live.push(paintSeen);
  host.append(seen);

  const key = ev.keyRef && ev.keyRef.book === cur ? ordOf(ev.keyRef.key) : null;
  let lastChapter = null;
  for (const r of acc.ranges) {
    host.append(el('p', 'bible-range', `${book.title} ${r.label}`));
    let flow = null;
    for (const e of entriesIn(book, r.lo, r.hi)) {
      if (lastChapter !== null && e.c !== lastChapter) { flow = null; host.append(el('p', 'bible-sub', `第${cnNum(e.c)}章`)); }
      lastChapter = e.c;
      const sec = book.secs[e.sec];
      if (sec.a === e.i && sec.title) { flow = null; host.append(el('p', 'bible-sub', sec.title)); }
      if (!flow) { flow = el('div', 'bible-text'); host.append(flow); }
      const v = verseEl(e);
      if (key !== null && key >= e.ord0 && key <= e.ord1) v.classList.add('key');
      flow.append(v);
    }
    lastChapter = null;
  }
  host.append(doneButton(accountUnit(book, ev)));

  // 上一個、下一個事件（時間順序）。翻頁用取代，返回鍵不必一個個退
  const pager = el('div', 'bible-pager');
  const jump = (n) => () => { const o = data.events[n]; nav({ screen: 'event', id: o.id, book: firstUnread(o) }, true); };
  const prev = btn('‹ 上一個事件', 'btn', jump(ev.n - 1));
  const next = btn('下一個事件 ›', 'btn', jump(ev.n + 1));
  prev.disabled = ev.n <= 0;
  next.disabled = ev.n >= data.events.length - 1;
  pager.append(prev, next);
  host.append(pager);
}

/* ── 啟動 ─────────────────────────────────────────── */
function start() {
  document.getElementById('bible-open').addEventListener('click', () => nav({ screen: 'hub' }));
  document.getElementById('bible-continue').addEventListener('click', homeContinue);
  document.getElementById('bible-back').addEventListener('click', () => history.back());
  for (const link of document.querySelectorAll('.bible-notice-link')) {
    const box = link.closest('.card') && link.closest('.card').querySelector('.bible-credit');
    if (box) wireNotice(link, box);
  }
  renderBibleHome();
  // app.js 若已經啟動完，由這裡接手回到重新載入前的那一層；否則由 app.js 在啟動後呼叫
  if (history.state && history.state.bible && typeof current !== 'undefined' && !document.getElementById('app').hidden) bibleShow(history.state.bible);
  // 稍等一下再載入經文，不跟剛開啟的畫面搶；首頁的進度讀完就會出現
  setTimeout(() => load().then(renderBibleHome, () => {}), 300);
}

Object.assign(window, { bibleShow, renderBibleHome, bibleExport, bibleImport });
start();
})();
