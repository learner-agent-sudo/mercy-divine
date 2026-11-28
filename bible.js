/* 讀經：瑪竇、馬爾谷、路加、若望福音與宗徒大事錄。
   經文在 bible/，拆章節的程式在 bible-parse.js，事件對照在 data/gospel-events.json，
   「誰說了什麼」在 data/people.json。
   讀過哪幾節只存在本機（mercy.bible.v1）。與祈禱各自獨立。
   整份包在函式裡，只把 app.js 會呼叫的幾個名稱放到全域。 */
(() => {
'use strict';

const K_BIBLE = 'mercy.bible.v1';
const LOG_MAX = 3000;
const IDS = BIBLE_BOOKS.map((b) => b.id);
const ABBR = Object.fromEntries(BIBLE_BOOKS.map((b) => [b.id, b.abbr]));
const SHORT = { mat: '瑪竇', mrk: '馬爾谷', luk: '路加', jhn: '若望', act: '宗徒大事錄' };
const TABS = [['books', '書卷'], ['events', '事件'], ['themes', '主題'], ['people', '人物'], ['log', '紀錄']];
const LONG_PASSAGE = 5;       // 一段話超過這麼多節，先只放金句，其餘按了才展開
const KEY_RE = /^\d{1,3}:\d{1,3}$/;
const ID_RE = /^[\w-]{1,60}$/;
const RANGE_RE = /^(\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAYS_MAX = 4000;        // 每日福音的勾：約十年
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

// 每日福音的勾：日期 → 那次按「讀完了」才新加的節（取消時只拿掉這些，之前讀過的不動）
function cleanDays(raw, keepAdded) {
  const out = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [d, v] of Object.entries(raw).slice(-DAYS_MAX)) {
    if (!DAY_RE.test(d)) continue;
    const added = keepAdded && Array.isArray(v) ? v.filter((k) => typeof k === 'string' && KEY_RE.test(k)).slice(0, 400) : [];
    out.push([d, added]);
  }
  return out;
}

function readProgress() {
  const raw = store.read(K_BIBLE, null);
  const p = { read: {}, log: [], last: null, days: new Map() };
  for (const id of IDS) {
    const arr = raw && raw.read && Array.isArray(raw.read[id]) ? raw.read[id] : [];
    p.read[id] = new Set(arr.filter((k) => typeof k === 'string' && KEY_RE.test(k)));
  }
  if (raw && Array.isArray(raw.log)) p.log = raw.log.map(cleanLog).filter(Boolean).slice(-LOG_MAX);
  if (raw) p.last = cleanLast(raw.last);
  if (raw) p.days = new Map(cleanDays(raw.days, true));
  return p;
}

const prog = readProgress();

function snapshot() {
  const read = {};
  for (const id of IDS) read[id] = [...prog.read[id]].sort(keyCmp);
  const days = {};
  for (const d of [...prog.days.keys()].sort().slice(-DAYS_MAX)) days[d] = prog.days.get(d);
  return { read, log: prog.log, last: prog.last, days };
}
const persist = () => store.write(K_BIBLE, snapshot());

const hasProgress = () => IDS.some((id) => prog.read[id].size) || prog.log.length > 0 || prog.days.size > 0;

// 備份：有進度才交出去
function bibleExport() {
  return hasProgress() ? snapshot() : null;
}

// 備份檔裡的讀經進度：已讀的節取聯集，紀錄去掉重複，一律逐項檢查
function bibleImport(raw) {
  const added = { verses: 0, logs: 0, days: 0 };
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
  // 每日福音的勾取聯集；別台裝置「新加了哪幾節」不帶過來，這裡的節已經照上面合併了
  for (const [d] of cleanDays(raw.days, false)) {
    if (prog.days.has(d)) continue;
    prog.days.set(d, []);
    added.days++;
  }
  const last = cleanLast(raw.last);
  if (last && !prog.last) prog.last = last;
  if (added.verses || added.logs || added.days || (last && prog.last === last)) { persist(); refresh(); }
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
  if (packed) return { raws: packed, events: inline('data-events'), people: inline('data-people') };
  const raws = {};
  const books = Promise.all(BIBLE_BOOKS.map(async (b) => {
    const r = await fetch(b.file);
    if (!r.ok) throw new Error(b.file);
    raws[b.id] = await r.text();
  }));
  // 沒有對照資料、沒有人物資料也能讀經，所以這兩份失敗不算失敗
  const optional = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const events = optional('data/gospel-events.json');
  const people = optional('data/people.json');
  await books;
  return { raws, events: await events, people: await people };
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
    entries: [], keys: [], ords: [], keyIdx: new Map(), e1: [], secs: [], chKeys: [null], ranges: [], sayRanges: [],
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

// 一卷書裡的幾段出處（'5:3'、'5:1-12'、'8:34-9:1'）→ 範圍；寫錯的、書裡沒有的略過
function rangesOf(book, list) {
  const ranges = [];
  for (const r of list) {
    const m = RANGE_RE.exec(String(r));
    if (!m) continue;
    const lo = m[1] * 1000 + +m[2];
    const hi = (m[3] || m[1]) * 1000 + +(m[4] || m[2]);
    const a = lower(book.ords, lo), z = upper(book.ords, hi);
    if (hi < lo || z <= a) continue;
    const keys = book.keys.slice(a, z);
    ranges.push({ lo, hi, label: String(r), keys, from: keys[0], to: keys[keys.length - 1] });
  }
  return ranges;
}
const accOf = (ranges) => ({ ranges, keys: [...new Set(ranges.flatMap((r) => r.keys))], label: ranges.map((r) => r.label).join('、') });

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
      const ranges = rangesOf(book, e.refs[id]);
      if (!ranges.length) continue;
      ev.acc[id] = accOf(ranges);
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

/* 人物：誰說了什麼。資料來自 data/people.json，這裡逐項檢查：
   出處不存在的話、沒有任何一段話的階段與人物都略過；金句不在出處裡就當作沒有金句。 */
const clip = (x, max) => (typeof x === 'string' ? x.trim().slice(0, max) : '');
const clipList = (x) => (Array.isArray(x) ? x.map((t) => clip(t, 40)).filter(Boolean).slice(0, 8) : []);

// 一段 refs（{書卷: [範圍]}）整理成每卷的 acc；一卷都對不上就是 null
function refsAcc(raw, byId) {
  if (!raw || typeof raw !== 'object') return null;
  const acc = {};
  for (const id of IDS) {
    if (!Array.isArray(raw[id])) continue;
    const ranges = rangesOf(byId[id], raw[id]);
    if (ranges.length) acc[id] = accOf(ranges);
  }
  const books = IDS.filter((id) => acc[id]);
  return books.length ? { acc, books } : null;
}

function makeSaying(s, byId) {
  if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !ID_RE.test(s.id)) return null;
  const title = clip(s.title, 60);
  const refs = refsAcc(s.refs, byId);
  if (!title || !refs) return null;
  const k = /^(\w+) (\d+:\d+)$/.exec(String(s.key || ''));
  const keyRef = k && refs.acc[k[1]] && refs.acc[k[1]].keys.includes(k[2]) ? { book: k[1], key: k[2] } : null;
  const reply = refsAcc(s.reply, byId);
  return {
    id: s.id, title, to: clip(s.to, 20), acc: refs.acc, books: refs.books,
    keyRef,
    anchor: keyRef || { book: refs.books[0], key: refs.acc[refs.books[0]].keys[0] },   // 沒有金句就用第一節
    reply: reply ? reply.acc : null, replyBooks: reply ? reply.books : [], replyBy: clip(s.replyBy, 20),
    note: clip(s.note, 200), see: Array.isArray(s.see) ? s.see.filter((x) => typeof x === 'string') : [],
    person: null, stage: 0,
  };
}

function makePeople(raw, byId) {
  if (!raw || !Array.isArray(raw.groups) || !Array.isArray(raw.people)) return null;
  const groups = [];
  for (const g of raw.groups) {
    if (g && typeof g.id === 'string' && ID_RE.test(g.id) && clip(g.title, 40) && !groups.some((x) => x.id === g.id)) groups.push({ id: g.id, title: clip(g.title, 40) });
  }
  const list = [], sayings = [];
  const personById = new Map(), sayById = new Map();
  const index = Object.fromEntries(IDS.map((id) => [id, []]));          // 每卷：哪些話落在哪些節
  for (const p of raw.people) {
    if (!p || typeof p.id !== 'string' || !ID_RE.test(p.id) || personById.has(p.id)) continue;
    const name = clip(p.name, 40);
    if (!name || !groups.some((g) => g.id === p.group)) continue;
    const person = { id: p.id, name, aka: clipList(p.aka), group: p.group, intro: clip(p.intro, 200), stages: [], sayings: [] };
    for (const st of Array.isArray(p.stages) ? p.stages : []) {
      const stage = { i: person.stages.length, title: clip(st && st.title, 40), sayings: [] };
      for (const item of Array.isArray(st && st.sayings) ? st.sayings : []) {
        const s = makeSaying(item, byId);
        if (!s || sayById.has(s.id)) continue;
        s.person = person;
        s.stage = stage.i;
        sayById.set(s.id, s);
        stage.sayings.push(s);
        person.sayings.push(s);
      }
      if (stage.sayings.length) person.stages.push(stage);
    }
    if (!person.sayings.length) continue;
    personById.set(person.id, person);
    list.push(person);
    for (const s of person.sayings) {
      sayings.push(s);
      for (const id of s.books) for (const r of s.acc[id].ranges) index[id].push({ say: s, lo: r.lo, hi: r.hi });
    }
  }
  if (!list.length) return null;
  for (const id of IDS) byId[id].sayRanges = index[id];
  return { groups, list, byId: personById, sayById, sayings };
}

function build({ raws, events, people }) {
  const books = BIBLE_BOOKS.map((meta) => {
    if (typeof raws[meta.id] !== 'string') throw new Error(`缺少 ${meta.file}`);
    return makeBook(meta, parseBook(raws[meta.id]));
  });
  const byId = Object.fromEntries(books.map((b) => [b.id, b]));
  let ev = null;
  try { ev = makeEvents(events, byId); } catch { ev = null; }
  let pe = null;
  try { pe = makePeople(people, byId); } catch { pe = null; }
  data = {
    books, byId, secs: books.flatMap((b) => b.secs),
    events: ev ? ev.events : null, evById: ev ? ev.evById : null, phases: ev ? ev.phases : null,
    people: pe,
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

// labels：[還沒讀完時, 都讀過時] 的字；cls：按鈕的 class（預設是每一段結尾的「讀完了」）
function doneButton(u, labels = ['讀完了', '✓ 已讀'], cls = 'btn btn-block bible-done') {
  const b = btn('', cls, () => toggleUnit(u));
  const paint = () => {
    const all = stateOf(u.book, u.keys) === 'all';
    b.textContent = all ? labels[1] : labels[0];
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

// 一串經文（同一卷、照順序）裡的每一節
function keysOfEntries(list) {
  const out = [];
  for (const e of list) for (let n = e.v; n <= (e.to || e.v); n++) { const k = `${e.c}:${n}`; if (!out.includes(k)) out.push(k); }
  return out;
}
// 幾筆經文 → 一個可以標記的單位；不連續的地方分成幾段，紀錄才寫得對
function entriesUnit(book, ents, title) {
  const keys = keysOfEntries(ents);
  const ranges = [];
  for (const k of keys) {
    const r = ranges[ranges.length - 1];
    if (r && book.keyIdx.get(k) === book.keyIdx.get(r.to) + 1) r.to = k; else ranges.push({ from: k, to: k });
  }
  return { book: book.id, keys, title, ranges, ref: `${book.abbr} ${ranges.map((r) => labelRange(r.from, r.to)).join('、')}` };
}
const chapterUnit = (book, c) => entriesUnit(book, book.chapters[c] || [], `第${cnNum(c)}章`);

/* 點經節來選一段：點一節，再點另一節，中間這一段就選起來，下面出現「標為已讀」。
   只算畫面上看得到的經節（每日福音有時跳過幾節）。 */
function selectable(host, book) {
  let anchor = null, lo = null, hi = null;     // 經文的序號（book.entries 裡的位置）
  const bar = el('div', 'bible-selbar');
  bar.hidden = true;
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', '選取的經文');
  const label = el('span', 'bible-sel-label');
  const spans = () => host.querySelectorAll('.v[data-i]');
  const picked = () => [...new Set([...spans()].map((v) => +v.dataset.i).filter((i) => i >= lo && i <= hi))]
    .sort((a, b) => a - b).map((i) => book.entries[i]);
  const unit = () => { const ents = picked(); return entriesUnit(book, ents, book.secs[ents[0].sec].title || ''); };
  const paintSel = () => {
    for (const v of spans()) { const i = +v.dataset.i; v.classList.toggle('sel', lo !== null && i >= lo && i <= hi); }
    bar.hidden = lo === null;
    if (lo === null) return;
    const u = unit();
    label.textContent = `${u.ref}（${u.keys.length} 節）`;
    mark.textContent = stateOf(book.id, u.keys) === 'all' ? '取消已讀' : '標為已讀';
  };
  const clear = () => { anchor = lo = hi = null; paintSel(); };
  const mark = btn('標為已讀', 'btn btn-primary bible-sel-mark', () => { toggleUnit(unit()); clear(); });
  const close = btn('✕', 'icon-btn bible-sel-x', clear);
  close.setAttribute('aria-label', '取消選取');
  bar.append(label, mark, close);
  host.append(bar);
  host.addEventListener('click', (e) => {
    const v = e.target.closest('.v[data-i]');
    if (!v || !host.contains(v) || e.target.closest('button, a')) return;
    const i = +v.dataset.i;
    if (anchor === null || lo !== hi) anchor = lo = hi = i;          // 開始選
    else if (i === anchor) { clear(); return; }                       // 再點同一節：取消
    else { lo = Math.min(anchor, i); hi = Math.max(anchor, i); }      // 點另一節：選到那裡
    if (!settings.bibleSelSeen) { settings.bibleSelSeen = true; saveSettings(); }
    paintSel();
  });
  live.push(() => { if (lo !== null) paintSel(); });
}

// 讀過的經節，節號變成一個小金點底，看得出哪幾節標過
function readMarks(host, book) {
  const paintMarks = () => {
    for (const v of host.querySelectorAll('.v[data-i]')) {
      const e = book.entries[+v.dataset.i];
      let all = true;
      for (let n = e.v; n <= (e.to || e.v); n++) if (!prog.read[book.id].has(`${e.c}:${n}`)) { all = false; break; }
      v.classList.toggle('is-read', all);
    }
  };
  paintMarks();
  live.push(paintMarks);
}

const selHint = () => (settings.bibleSelSeen ? null
  : el('p', 'hint bible-sel-hint', '讀了其中幾節？點第一節，再點最後一節，就能把這一段標為已讀。'));

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
  const screens = { book: paintBook, chapter: paintChapter, event: paintEvent, person: paintPerson, today: paintToday };
  (screens[st.screen] || paintHub)(host, st);
  if (typeof st.y === 'number') window.scrollTo(0, st.y);
}

/* ── 首頁的卡片 ───────────────────────────────────── */
// 首頁卡片上的「今日福音」一列：出處不必等經文載入；讀過沒有要等
function renderTodayRow() {
  const row = document.getElementById('bible-today');
  if (!row || typeof lectionaryDay !== 'function') return;
  let day;
  try { day = lectionaryDay(todayKey()); } catch { return; }
  const done = dayRead(todayKey());
  // 首頁日期下面那一行：今天的禮儀日
  const lit = document.getElementById('home-lit');
  if (lit) {
    document.getElementById('home-lit-dot').dataset.color = day.color;
    document.getElementById('home-lit-name').textContent = day.name;
    lit.hidden = false;
  }
  document.getElementById('bible-today-dot').dataset.color = day.color;
  document.getElementById('bible-today-ref').textContent = `${day.gospel.label}${done ? ' ✓' : ''}`;
  row.setAttribute('aria-label', `今日福音：${day.name}，${day.gospel.label}${done ? '，已讀' : ''}`);
  row.hidden = false;
}

function renderBibleHome() {
  renderTodayRow();
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
  const tab = tabsOf().some(([id]) => id === settings.bibleTab) ? settings.bibleTab : 'books';
  const today = todayCard();
  if (today) host.append(today);
  host.append(summary(tab), tabsRow(tab));
  const panel = el('div', 'bible-panel');
  panel.id = 'bible-panel';
  host.append(panel);
  ({ books: paintBooksTab, events: paintEventsTab, themes: paintThemesTab, people: paintPeopleTab, log: paintLogTab })[tab](panel);
  host.append(footer());
}

/* ── 進度窗：五卷書是五扇彩色玻璃窗，每一章一塊玻璃 ─────────
   讀了一章裡的幾節，那一塊就亮一點；整章讀完，那一塊就全亮。
   一卷讀完，窗頂的圓窗也亮起來。點一扇窗就到那一卷。 */
const GLASS = {
  mat: ['#c63b2e', '#a52b22'], mrk: ['#3070b8', '#24579a'], luk: ['#2f925c', '#237447'],
  jhn: ['#e4a72a', '#c88a16'], act: ['#9049b3', '#753996'],
};
const SVGNS = 'http://www.w3.org/2000/svg';
function sv(tag, attrs) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, typeof v === 'number' ? +v.toFixed(2) : v);
  return n;
}

function glassWindow() {
  const W = 300, H = 214, pad = 8, gap = 7, n = data.books.length;
  const lw = (W - 2 * pad - (n - 1) * gap) / n;
  const arch = lw * 0.866;                    // 等邊尖拱的高度
  const top = pad + arch;                     // 窗身的頂端
  const bottom = H - pad - 6;                 // 窗台的上緣
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'glass', role: 'img' });
  const title = sv('title');
  title.textContent = `讀經進度：${data.books.map((b) => `${b.title} ${pct(countRead(b.id, b.keys), b.keys.length)}%`).join('，')}`;
  svg.append(title);
  const defs = sv('defs');
  const sheen = sv('linearGradient', { id: 'glass-sheen', x1: 0, y1: 0, x2: 1, y2: 1 });
  for (const [o, a] of [[0, 0.26], [0.45, 0.04], [1, 0.1]]) sheen.append(sv('stop', { offset: o, 'stop-color': '#ffffff', 'stop-opacity': a }));
  const halo = sv('radialGradient', { id: 'glass-halo' });
  for (const [o, a] of [[0, 0.95], [0.6, 0.5], [1, 0]]) halo.append(sv('stop', { offset: o, 'stop-color': '#ffe7a3', 'stop-opacity': a }));
  defs.append(sheen, halo);
  svg.append(defs);

  data.books.forEach((b, i) => {
    const x = pad + i * (lw + gap);
    const outline = `M${x} ${bottom}L${x} ${top}A${lw} ${lw} 0 0 1 ${x + lw / 2} ${top - arch}`
      + `A${lw} ${lw} 0 0 1 ${x + lw} ${top}L${x + lw} ${bottom}Z`;
    const g = sv('g', { class: 'glass-lancet', 'data-book': b.id });
    const label = sv('title');
    label.textContent = `${b.title}：讀了 ${pct(countRead(b.id, b.keys), b.keys.length)}%`;
    g.append(label);
    g.append(sv('path', { d: outline, class: 'glass-dark' }));
    g.append(sv('path', { d: outline, fill: GLASS[b.id][0], opacity: 0.2 }));    // 沒亮的玻璃也帶一點顏色

    // 窗身：每一章一塊，兩塊一排；章數是單數時最後一塊佔滿一排
    const ix = x + 2, iy = top + 2, iw = lw - 4, ih = bottom - top - 4;
    const rows = Math.ceil(b.nch / 2);
    const ph = ih / rows;
    const leads = [];
    for (let c = 1; c <= b.nch; c++) {
      const r = Math.floor((c - 1) / 2), col = (c - 1) % 2;
      const wide = c === b.nch && b.nch % 2 === 1;
      const px = ix + (wide ? 0 : col * (iw / 2)), pw = wide ? iw : iw / 2, py = iy + r * ph;
      const keys = b.chKeys[c];
      const f = keys.length ? countRead(b.id, keys) / keys.length : 0;
      if (f > 0) {
        g.append(sv('rect', { x: px, y: py, width: pw, height: ph, fill: GLASS[b.id][(r + col) % 2],
                              opacity: f >= 1 ? 1 : 0.3 + 0.5 * f, class: f >= 1 ? 'glass-lit' : 'glass-part', 'data-c': c }));
      }
      leads.push(sv('rect', { x: px, y: py, width: pw, height: ph, class: 'glass-lead' }));
    }
    for (const l of leads) g.append(l);

    // 窗頂的圓窗：寫著書卷的簡稱，一卷讀完就亮
    const full = b.keys.length && countRead(b.id, b.keys) === b.keys.length;
    const cx = x + lw / 2, cy = top - arch * 0.4, rr = lw * 0.27;
    if (full) g.append(sv('circle', { cx, cy, r: rr * 1.7, fill: 'url(#glass-halo)' }));
    g.append(sv('circle', { cx, cy, r: rr, class: full ? 'glass-seal is-full' : 'glass-seal' }));
    const t = sv('text', { x: cx, y: cy, class: full ? 'glass-abbr is-full' : 'glass-abbr', 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    t.textContent = b.abbr;
    g.append(t);
    g.append(sv('path', { d: outline, fill: 'url(#glass-sheen)', 'pointer-events': 'none' }));
    g.append(sv('path', { d: outline, class: 'glass-frame' }));
    g.append(sv('line', { x1: x, y1: top, x2: x + lw, y2: top, class: 'glass-frame' }));
    svg.append(g);
  });
  svg.append(sv('rect', { x: pad - 4, y: bottom, width: W - 2 * pad + 8, height: 6, rx: 1.5, class: 'glass-sill' }));
  svg.addEventListener('click', (e) => {
    const g = e.target.closest('.glass-lancet');
    if (g) nav({ screen: 'book', book: g.dataset.book });
  });
  return svg;
}

function summary(tab) {
  const card = el('div', 'card bible-sum');
  const t = totals();
  const win = el('figure', 'glass-wrap');
  win.append(glassWindow(), el('figcaption', 'glass-cap', '每讀完一章，窗上就亮起一塊玻璃；一卷讀完，窗頂的圓窗也亮起來。'));
  card.append(win);
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

// 沒有人物資料就沒有「人物」這一頁
const tabsOf = () => TABS.filter(([id]) => id !== 'people' || data.people);

function tabsRow(tab) {
  const row = el('div', 'bible-tabs');
  row.setAttribute('role', 'tablist');
  const list = tabsOf();
  row.style.setProperty('--n', list.length);
  for (const [id, label] of list) {
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
    label();     // 標籤立刻跟上；details 的 toggle 事件是稍後才觸發的
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

/* 人物：依群組列出，點進去看他說過的話 */
const sayRead = (s) => s.books.every((id) => stateOf(id, s.acc[id].keys) === 'all');

function paintPeopleTab(panel) {
  for (const g of data.people.groups) {
    const members = data.people.list.filter((p) => p.group === g.id);
    if (!members.length) continue;
    panel.append(el('h3', 'pp-group', g.title));
    for (const p of members) {
      const item = btn('', 'pp-item', () => nav({ screen: 'person', id: p.id }));
      item.dataset.person = p.id;
      const top = el('span', 'pp-top');
      top.append(el('span', 'pp-name', p.name));
      if (p.aka.length) top.append(el('small', 'pp-aka', `又名 ${p.aka.join('、')}`));
      item.append(top, el('span', 'pp-intro', p.intro),
        el('span', 'pp-meta', `${p.sayings.length} 段話 · 讀過 ${p.sayings.filter(sayRead).length}`));
      panel.append(item);
    }
  }
}

/* 紀錄：依日期分組，新的在前 */
const DOW = '日一二三四五六';
const dayTitle = (d) => `${d.getFullYear() === new Date().getFullYear() ? '' : `${d.getFullYear()}年`}${d.getMonth() + 1}月${d.getDate()}日（星期${DOW[d.getDay()]}）`;
let logShown = 120;

// 在彌撒、紙本聖經讀過的，也可以記下：選書卷、章、從第幾節到第幾節
function addLogForm() {
  const box = el('details', 'bible-addlog');
  box.append(el('summary', null, '記下在別處讀的經文'));
  const form = el('div', 'bible-addlog-form');
  const select = (label, cls) => {
    const sel = document.createElement('select');
    sel.className = cls;
    sel.setAttribute('aria-label', label);
    const wrap = el('label', 'bal-field');
    wrap.append(el('span', 'bal-k', label), sel);
    return [wrap, sel];
  };
  const fill = (sel, list, value) => {
    sel.textContent = '';
    for (const [v, text] of list) {
      const o = document.createElement('option');
      o.value = String(v);
      o.textContent = text;
      sel.append(o);
    }
    sel.value = String(value);
  };
  const [bookW, bookSel] = select('書卷', 'bal-book');
  const [chW, chSel] = select('章', 'bal-ch');
  const [fromW, fromSel] = select('從第幾節', 'bal-from');
  const [toW, toSel] = select('到第幾節', 'bal-to');
  fill(bookSel, data.books.map((b) => [b.id, b.title]), data.books[0].id);
  const verses = () => data.byId[bookSel.value].chKeys[+chSel.value].map((k) => +k.split(':')[1]);
  const syncVerses = () => {
    const vs = verses();
    fill(fromSel, vs.map((v) => [v, String(v)]), vs[0]);
    fill(toSel, vs.map((v) => [v, String(v)]), vs[vs.length - 1]);
  };
  const syncChapters = () => {
    const b = data.byId[bookSel.value];
    fill(chSel, Array.from({ length: b.nch }, (_, i) => [i + 1, `第${cnNum(i + 1)}章`]), 1);
    syncVerses();
  };
  syncChapters();
  bookSel.addEventListener('change', syncChapters);
  chSel.addEventListener('change', syncVerses);
  fromSel.addEventListener('change', () => { if (+toSel.value < +fromSel.value) toSel.value = fromSel.value; });
  toSel.addEventListener('change', () => { if (+toSel.value < +fromSel.value) fromSel.value = toSel.value; });
  const row = el('div', 'bal-row');
  row.append(fromW, toW);
  const save = btn('記下這一段', 'btn btn-primary btn-block bal-save', () => {
    const b = data.byId[bookSel.value];
    const c = +chSel.value;
    const lo = +fromSel.value, hi = +toSel.value;
    const keys = b.chKeys[c].filter((k) => { const v = +k.split(':')[1]; return v >= lo && v <= hi; });
    if (!keys.length) return;
    const sec = b.secs.find((x) => x.keys.includes(keys[0]));
    const u = { book: b.id, keys, title: sec && sec.title ? sec.title : '', ref: `${b.abbr} ${labelRange(keys[0], keys[keys.length - 1])}`,
                ranges: [{ from: keys[0], to: keys[keys.length - 1] }] };
    if (stateOf(b.id, keys) === 'all') { toast(`${u.ref} 已經標為已讀`); return; }
    toggleUnit(u);
    paint({ screen: 'hub', y: Math.round(window.scrollY) });
  });
  form.append(bookW, chW, row, save);
  box.append(form);
  return box;
}

function paintLogTab(panel) {
  panel.append(addLogForm());
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
  s.dataset.i = e.i;
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
  const hint = selHint();
  if (hint) host.append(hint);
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
      // 這一段到下一章才完；只讀到這一章結尾的，也有地方標
      node.append(doneButton(entriesUnit(book, blk.ents, sec.title), ['這一章的部分讀完了', '✓ 這一章的部分已讀'],
        'btn btn-block bible-part-done'));
    }
    const lo = blk.ents[0].ord0, hi = blk.ents[blk.ents.length - 1].ord1;
    const par = parallelsEl(book, lo, hi);
    if (par) node.append(par);
    // 宗徒大事錄沒有事件可對照；金句落在這一段的話，在段尾連到那個人
    if (book.id === 'act') {
      const who = speakersEl(sayingsAnchoredIn(book.id, lo, hi));
      if (who) node.append(who);
    }
    if (isEnd) {
      node.append(doneButton(sectionUnit(book, sec)));
      live.push(() => node.classList.toggle('is-read', stateOf(book.id, sec.keys) === 'all'));
      live[live.length - 1]();
    }
    secNodes.set(sec.i, node);
    host.append(node);
  }
  if (!data.events) host.append(noEvents());

  // 整章一起標
  host.append(doneButton(chapterUnit(book, c), [`第${cnNum(c)}章整章讀完了`, `✓ 第${cnNum(c)}章都讀過了`],
    'btn btn-block bible-ch-done'));
  readMarks(host, book);
  selectable(host, book);

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
  const who = speakersEl(sayingsOverlapping(book, acc));
  if (who) host.append(who);
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

/* ── 每日福音 ─────────────────────────────────────── */
// 某一天（'YYYY-MM-DD'）彌撒的福音：禮儀日、出處，以及這一卷裡對應的經文
const LIT_COLOR = { green: '綠色', purple: '紫色', white: '白色', red: '紅色', rose: '玫瑰色' };
const todayKey = () => dayKey(new Date());
const keyDate = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
const shiftKey = (key, n) => { const t = keyDate(key); t.setDate(t.getDate() + n); return dayKey(t); };

function dailyOf(key) {
  if (typeof lectionaryDay !== 'function') return null;
  let day;
  try { day = lectionaryDay(key); } catch { return null; }
  const book = data && data.byId[day.gospel.book];
  const acc = book ? accOf(rangesOf(book, day.gospel.refs)) : null;
  return { day, book, acc: acc && acc.keys.length ? acc : null };
}
const dailyUnit = (x) => ({
  book: x.book.id, keys: x.acc.keys, title: x.day.name, ref: x.day.gospel.label,
  ranges: x.acc.ranges.map((r) => ({ from: r.from, to: r.to })),
});
const dayRead = (key) => prog.days.has(key);

/* 每日福音的「讀完了」是每天各自一個勾：預設沒勾，勾了只算那一天。
   勾的時候這幾節也算進讀經進度；取消時只拿掉那一下才新加的節，之前就讀過的照舊。 */
function toggleDay(x, key) {
  const u = dailyUnit(x);
  const set = prog.read[u.book];
  if (dayRead(key)) {
    for (const k of prog.days.get(key)) set.delete(k);
    prog.days.delete(key);
    toast(`已取消：${u.ref}`);
  } else {
    const added = u.keys.filter((k) => !set.has(k));
    for (const k of added) set.add(k);
    prog.days.set(key, added);
    addLog(u);
    toast(`已記下：${dayTitle(keyDate(key))}的福音`);
  }
  persist();
  refresh();
}

function dayButton(x, key) {
  const b = btn('', 'btn btn-block bible-done bible-day-done', () => toggleDay(x, key));
  const paint = () => {
    const done = dayRead(key);
    b.textContent = done ? '✓ 這天的福音讀過了' : '讀完了';
    b.classList.toggle('is-done', done);
    b.setAttribute('aria-pressed', String(done));
  };
  paint();
  live.push(paint);
  return b;
}

// 今日福音頁最上面的一週：日到六，讀過的那天有勾，點一天就換到那天
function weekStrip(key) {
  const start = shiftKey(key, -keyDate(key).getDay());
  const today = todayKey();
  const go = (d) => () => nav({ screen: 'today', d }, true);
  const wrap = el('nav', 'bible-week');
  wrap.setAttribute('aria-label', '這一週的福音');
  const prev = btn('‹', 'bible-week-nav', go(shiftKey(key, -7)));
  prev.setAttribute('aria-label', '上一週');
  const next = btn('›', 'bible-week-nav', go(shiftKey(key, 7)));
  next.setAttribute('aria-label', '下一週');
  const days = el('div', 'bible-week-days');
  const cells = [];
  for (let i = 0; i < 7; i++) {
    const k = shiftKey(start, i);
    const d = keyDate(k);
    const b = btn('', 'bible-week-day', go(k));
    b.dataset.d = k;
    let color = '';
    try { color = lectionaryDay(k).color; } catch { /* 算不出來就不畫顏色 */ }
    if (color) b.dataset.color = color;
    if (k === key) b.setAttribute('aria-current', 'date');
    if (k === today) b.classList.add('is-today');
    b.append(el('span', 'bwd-w', DOW[i]), el('span', 'bwd-n', String(d.getDate())), el('span', 'bwd-mark'));
    cells.push([b, k, `${d.getMonth() + 1}月${d.getDate()}日 星期${DOW[i]}${k === today ? '（今天）' : ''}`]);
    days.append(b);
  }
  const paint = () => {
    for (const [b, k, label] of cells) {
      b.classList.toggle('is-read', dayRead(k));
      b.setAttribute('aria-label', `${label}${dayRead(k) ? '，已讀' : ''}`);
    }
  };
  paint();
  live.push(paint);
  wrap.append(prev, days, next);
  return wrap;
}
const litDot = (color) => {
  const d = el('span', 'lit-dot');
  d.dataset.color = color;
  d.setAttribute('aria-hidden', 'true');
  return d;
};

// 讀經大廳最上面：今天的福音
function todayCard() {
  const key = todayKey();
  const x = dailyOf(key);
  if (!x) return null;
  const card = btn('', 'card bible-today-card', () => nav({ screen: 'today', d: key }));
  card.id = 'bible-today-card';
  card.dataset.color = x.day.color;
  const top = el('span', 'btc-top');
  top.append(litDot(x.day.color), el('span', 'btc-kicker', '今日福音'), el('span', 'btc-date', dayTitle(keyDate(key))));
  const ref = el('span', 'btc-ref', x.day.gospel.label);
  const state = el('span', 'btc-state');
  const paintState = () => {
    const done = dayRead(key);
    state.textContent = done ? '✓ 今天讀過了' : '讀 ›';
    card.classList.toggle('is-read', done);
  };
  paintState();
  live.push(paintState);
  const row = el('span', 'btc-row');
  row.append(ref, state);
  card.append(top, el('span', 'btc-name', x.day.name), row);
  return card;
}

// 跟這段福音同一件事、別卷福音的記載：每件事一列，事件名稱可以點，後面是各卷的出處
function relatedEl(book, acc) {
  const evs = [];
  for (const r of acc.ranges) {
    for (const x of book.ranges) if (x.hi >= r.lo && x.lo <= r.hi && !evs.includes(x.ev)) evs.push(x.ev);
  }
  if (!evs.length) return null;
  evs.sort((a, b) => a.n - b.n);
  const wrap = el('div', 'bible-related');
  for (const ev of evs) {
    const row = el('div', 'bible-rel-row');
    const title = btn(ev.title, 'bible-rel-title', () => nav({ screen: 'event', id: ev.id, book: book.id }));
    row.append(title);
    const chips = el('div', 'bible-par-row');
    const others = IDS.filter((id) => id !== book.id && ev.acc[id]);
    if (!others.length) chips.append(el('span', 'bible-par-label', `只有${SHORT[book.id]}記載`));
    for (const id of others) {
      const chip = btn('', 'chip bible-chip', () => nav({ screen: 'event', id: ev.id, book: id }));
      chip.dataset.book = id;
      const text = `${ABBR[id]} ${ev.acc[id].label}`;
      const paintChip = () => { chip.textContent = stateOf(id, ev.acc[id].keys) === 'all' ? `✓ ${text}` : text; };
      paintChip();
      live.push(paintChip);
      chips.append(chip);
    }
    row.append(chips);
    if (ev.note) row.append(el('p', 'hint bible-note', ev.note));
    wrap.append(row);
  }
  return wrap;
}

function paintToday(host, st) {
  const key = st.d && DAY_RE.test(st.d) ? st.d : todayKey();
  const isToday = key === todayKey();
  setTitle(isToday ? '今日福音' : '每日福音');
  const x = dailyOf(key);
  if (!x) { host.append(el('p', 'empty', '無法算出這一天的福音。')); return; }
  const { day, book, acc } = x;
  host.append(weekStrip(key));

  const head = el('div', 'bible-day-head');
  head.dataset.color = day.color;
  const when = el('p', 'bible-day-date');
  when.append(litDot(day.color), document.createTextNode(`${dayTitle(keyDate(key))}${isToday ? ' · 今天' : ''}`));
  head.append(when, el('h2', 'bible-day-name', day.name), el('p', 'bible-day-ref', day.gospel.label));
  head.append(el('p', 'hint bible-day-meta',
    `${day.sunday ? `主日${day.cycle}年` : `${day.cycle}年 · 平日第${day.ferial === 'I' ? '一' : '二'}年`} · 祭衣${LIT_COLOR[day.color] || ''}`));
  host.append(head);

  if (!book || !acc) { host.append(el('p', 'empty', '這一段經文不在本程式的經文裡。')); return; }
  const hint = selHint();
  if (hint) host.append(hint);

  // 經文：照出處一段一段排，小標題、換章都標出來
  const text = el('div', 'bible-day-text');
  for (const r of acc.ranges) {
    let flow = null, lastC = null, lastSec = null;
    if (acc.ranges.length > 1) text.append(el('p', 'bible-range', `${book.title} ${r.label}`));
    for (const e of entriesIn(book, r.lo, r.hi)) {
      if (lastC !== null && e.c !== lastC) { flow = null; text.append(el('p', 'bible-sub', `第${cnNum(e.c)}章`)); }
      lastC = e.c;
      if (e.sec !== lastSec) {                       // 每一個小標題只出現一次
        lastSec = e.sec;
        const t = book.secs[e.sec].title;
        if (t) { flow = null; text.append(el('p', 'bible-sub', t)); }
      }
      if (!flow) { flow = el('div', 'bible-text'); text.append(flow); }
      flow.append(verseEl(e));
    }
  }
  host.append(text);
  host.append(dayButton(x, key));

  // 相關：同一件事在別卷福音、這裡說話的人、到整章去讀
  const rel = el('section', 'bible-day-rel');
  rel.append(el('h3', 'bible-rel-h', '相關的經文'));
  const evs = relatedEl(book, acc);
  if (evs) {
    rel.append(el('p', 'bible-rel-k', '同一件事，其他福音怎麼記'));
    rel.append(evs);
  } else if (!data.events) rel.append(noEvents());
  const who = speakersEl(sayingsOverlapping(book, acc));
  if (who) rel.append(who);
  const [c0, v0] = acc.ranges[0].from.split(':');
  rel.append(btn(`在${book.title}第${cnNum(+c0)}章裡讀前後文 ›`, 'btn btn-block bible-day-ctx',
    () => nav({ screen: 'chapter', book: book.id, c: +c0, v: +v0 })));
  host.append(rel);
  readMarks(text, book);
  selectable(host, book);

  // 前一天、今天、後一天：換天用取代，返回鍵直接退出
  const pager = el('div', 'bible-pager');
  pager.append(
    btn('‹ 前一天', 'btn', () => nav({ screen: 'today', d: shiftKey(key, -1) }, true)),
    btn('今天', 'btn', () => nav({ screen: 'today', d: todayKey() }, true)),
    btn('後一天 ›', 'btn', () => nav({ screen: 'today', d: shiftKey(key, 1) }, true)),
  );
  pager.children[1].disabled = isToday;
  host.append(pager);
  host.append(el('p', 'hint bible-day-note',
    '依羅馬禮的讀經表推算，跟香港教區：主顯節、耶穌升天節移至主日。地方的節日（例如農曆新年）未計算在內。'));
}

/* ── 人物：他說過的話 ─────────────────────────────── */
// 落在這幾段經文裡的話（事件頁用）：每一段話只算一次，照在經文裡出現的先後排
function sayingsOverlapping(book, acc) {
  const found = new Map();
  for (const x of book.sayRanges) {
    for (const r of acc.ranges) {
      if (x.hi < r.lo || x.lo > r.hi) continue;
      const at = Math.max(x.lo, r.lo);
      if (!found.has(x.say) || found.get(x.say) > at) found.set(x.say, at);
    }
  }
  return [...found].sort((a, b) => a[1] - b[1]).map(([say]) => say);
}

// 金句落在 lo～hi 之間的話（章的畫面用）
function sayingsAnchoredIn(id, lo, hi) {
  if (!data.people) return [];
  return data.people.sayings.filter((s) => {
    if (s.anchor.book !== id) return false;
    const o = ordOf(s.anchor.key);
    return o >= lo && o <= hi;
  });
}

// 「這裡說話的人：」一排小標籤，點了到那個人、那一段話
function speakersEl(sayings) {
  if (!sayings.length) return null;
  const row = el('div', 'bible-see bible-who');
  row.append(el('span', 'bible-par-label', '這裡說話的人：'));
  for (const s of sayings) {
    const chip = btn(`${s.person.name}：${s.title}`, 'chip', () => nav({ screen: 'person', id: s.person.id, at: s.id }));
    chip.dataset.say = s.id;
    row.append(chip);
  }
  return row;
}

// 看上下文：福音就到那一件事（開在這一卷的分頁），沒有事件可去的（宗徒大事錄）就到那一章、那一節
function sayContext(s, id) {
  const first = s.acc[id].ranges[0].from;
  const o = ordOf(first);
  const hit = data.byId[id].ranges.find((x) => x.lo <= o && o <= x.hi);
  if (hit) { nav({ screen: 'event', id: hit.ev.id, book: id }); return; }
  const [c, v] = first.split(':');
  nav({ screen: 'chapter', book: id, c: +c, v: +v });
}

const peopleOpen = new Map();   // 人物 id → 展開著的階段；這次開啟期間記住，退回來時還在
const sayTab = new Map();       // 話 id → 手動切到的書卷
const sayWide = new Set();      // 已展開全段的經文（話 id、書卷、哪一塊）

// 一段經文。超過 LONG_PASSAGE 節時先只放一節（金句，沒有就第一節），按了才展開全段
function passageEl(acc, id, keyOrd, tag, redraw) {
  const book = data.byId[id];
  const wrap = el('div', 'say-pass');
  wrap.append(el('p', 'bible-range', `${book.title} ${acc.label}`));
  const entries = [];
  for (const r of acc.ranges) for (const e of entriesIn(book, r.lo, r.hi)) if (!entries.includes(e)) entries.push(e);

  const long = acc.keys.length > LONG_PASSAGE;
  const wide = sayWide.has(tag);
  let shown = entries;
  if (long && !wide) {
    const has = (o) => entries.filter((e) => o >= e.ord0 && o <= e.ord1);
    shown = (keyOrd != null && has(keyOrd).length ? has(keyOrd) : has(entries[0].ord0));
  }
  let flow = null, prev = null;
  for (const e of shown) {
    if (prev && e.c !== prev.c) { flow = null; wrap.append(el('p', 'bible-sub', `第${cnNum(e.c)}章`)); }
    if (!flow || (prev && e.i !== prev.i + 1)) { flow = el('div', 'bible-text'); wrap.append(flow); }
    const v = verseEl(e);
    if (keyOrd != null && keyOrd >= e.ord0 && keyOrd <= e.ord1) v.classList.add('key');
    flow.append(v);
    prev = e;
  }
  if (long) {
    wrap.append(btn(wide ? '收合' : `展開全段（${acc.keys.length} 節）`, 'btn btn-tiny say-more', () => {
      if (wide) sayWide.delete(tag); else sayWide.add(tag);
      redraw();
    }));
  }
  return wrap;
}

function sayingCard(s, person) {
  const card = el('article', 'say');
  card.dataset.say = s.id;
  const read = sayRead(s);
  card.classList.toggle('is-read', read);

  const title = el('h3', 'say-title');
  if (read) {
    const ok = el('span', 'say-ok', '✓');
    ok.setAttribute('role', 'img');
    ok.setAttribute('aria-label', '已讀');
    title.append(ok, ' ');
  }
  title.append(`「${s.title}」`);
  card.append(title);

  const sub = el('div', 'say-sub');
  if (s.to) sub.append(el('span', 'say-to', `對 ${s.to} 說`));
  const badge = el('span', 'tl-meta');
  for (const id of s.books) {
    const st = stateOf(id, s.acc[id].keys);
    badge.append(el('span', `bdg${st === 'all' ? ' done' : st === 'part' ? ' part' : ''}`, ABBR[id]));
  }
  sub.append(badge);
  card.append(sub);

  // 預設開在第一個還沒讀完的書卷
  let cur = sayTab.get(s.id);
  if (!s.books.includes(cur)) cur = s.books.find((id) => stateOf(id, s.acc[id].keys) !== 'all') || s.books[0];

  const body = el('div', 'say-body');
  const tabs = [];
  const show = () => {
    for (const b of tabs) b.setAttribute('aria-selected', String(b.dataset.book === cur));
    body.textContent = '';
    const keyOrd = s.keyRef && s.keyRef.book === cur ? ordOf(s.keyRef.key) : null;   // 金句不在這一卷就不標
    body.append(passageEl(s.acc[cur], cur, keyOrd, `${s.id}|${cur}`, show));
    if (s.reply) {
      const rid = s.reply[cur] ? cur : s.replyBooks[0];
      const box = el('div', 'say-reply');
      box.append(el('p', 'say-reply-label', `${s.replyBy}回答`), passageEl(s.reply[rid], rid, null, `${s.id}|r|${rid}`, show));
      body.append(box);
    }
  };
  if (s.books.length > 1) {
    const row = el('div', 'bible-etabs say-tabs');
    row.setAttribute('role', 'tablist');
    for (const id of s.books) {
      const b = btn(`${ABBR[id]}${stateOf(id, s.acc[id].keys) === 'all' ? ' ✓' : ''}`, 'bible-etab', () => {
        if (id === cur) return;
        cur = id;
        sayTab.set(s.id, id);
        show();
      });
      b.dataset.book = id;
      b.setAttribute('role', 'tab');
      tabs.push(b);
      row.append(b);
    }
    card.append(row);
  }
  card.append(body);
  show();

  if (s.note) card.append(el('p', 'hint bible-note', s.note));

  const others = s.see.map((id) => data.people.sayById.get(id)).filter((o) => o && o !== s);
  if (others.length) {
    const row = el('div', 'bible-see say-see');
    for (const o of others) {
      const label = o.person === person ? o.title : `${o.person.name} · ${o.title}`;
      const chip = btn(`對照：${label}`, 'chip', () => nav({ screen: 'person', id: o.person.id, at: o.id }));
      chip.dataset.say = o.id;
      row.append(chip);
    }
    card.append(row);
  }
  card.append(btn('看上下文', 'btn btn-tiny say-ctx', () => sayContext(s, cur)));
  return card;
}

function paintPerson(host, st) {
  const person = data.people && data.people.byId.get(st.id);
  if (!person) { paintHub(host); return; }
  setTitle(person.name);

  const done = person.sayings.filter(sayRead).length;
  const head = el('div', 'card bible-sum pe-head');
  if (person.aka.length) head.append(el('p', 'pe-aka', `又名 ${person.aka.join('、')}`));
  if (person.intro) head.append(el('p', 'pe-intro', person.intro));
  head.append(el('p', 'bible-sum-line pe-line', `讀完 ${done}／${person.sayings.length} 段話`));
  const bar = el('div', 'bible-bar');
  const fill = el('span');
  fill.style.width = `${(done * 100) / (person.sayings.length || 1)}%`;
  bar.append(fill);
  head.append(bar);
  host.append(head);

  // 階段是可以收起來的卡片；第一次打開只展開有第一段沒讀的話的那一個（全讀過就全展開）
  let open = peopleOpen.get(person.id);
  if (!open) {
    const first = person.stages.find((g) => !g.sayings.every(sayRead));
    open = new Set(first ? [first.i] : person.stages.map((g) => g.i));
    peopleOpen.set(person.id, open);
  }
  const target = st.at && data.people.sayById.get(st.at);
  const goal = target && target.person === person ? target : null;
  if (goal) open.add(goal.stage);

  const groups = [];
  const all = btn('', 'btn btn-tiny tl-all', () => {
    const opening = groups.some((d) => !d.open);
    for (const d of groups) d.open = opening;
    label();     // 標籤立刻跟上；details 的 toggle 事件是稍後才觸發的
  });
  const label = () => { all.textContent = groups.every((d) => d.open) ? '全部收起' : '全部展開'; };
  const tools = el('div', 'tl-tools');
  tools.append(all);
  host.append(tools);

  const cards = new Map();
  for (const stage of person.stages) {
    const d = document.createElement('details');
    d.className = 'th-group tl-group pe-stage';
    d.dataset.stage = stage.i;
    d.open = open.has(stage.i);
    d.addEventListener('toggle', () => { if (d.open) open.add(stage.i); else open.delete(stage.i); label(); });
    const head1 = document.createElement('summary');
    head1.className = 'tl-phase';
    head1.append(el('span', null, stage.title), el('small', null, `${stage.sayings.filter(sayRead).length}／${stage.sayings.length}`));
    const list = el('div', 'pe-list');
    for (const s of stage.sayings) {
      const card = sayingCard(s, person);
      cards.set(s.id, card);
      list.append(card);
    }
    d.append(head1, list);
    groups.push(d);
    host.append(d);
  }
  label();

  // 從別處（對照的小標籤、這裡說話的人）跳來：捲到那一段並閃一下。從上一層退回來時位置由 paint 還原
  const card = goal && cards.get(goal.id);
  if (card && typeof st.y !== 'number') {
    card.scrollIntoView({ block: 'start' });
    card.classList.add('hl');
    setTimeout(() => card.classList.remove('hl'), 2400);
  }
}

/* ── 啟動 ─────────────────────────────────────────── */
function start() {
  document.getElementById('bible-open').addEventListener('click', () => nav({ screen: 'hub' }));
  document.getElementById('bible-continue').addEventListener('click', homeContinue);
  const todayRow = document.getElementById('bible-today');
  if (todayRow) todayRow.addEventListener('click', () => nav({ screen: 'today', d: todayKey() }));
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
