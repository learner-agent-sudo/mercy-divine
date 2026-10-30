// 檢查 data/gospel-events.json：每個出處都真的存在，四部福音的每一節都恰好屬於一個事件。
// 不需要瀏覽器，直接用 node 讀檔。
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url).pathname;
const ctx = { module: { exports: {} } };
vm.createContext(ctx);
vm.runInContext(readFileSync(`${root}bible-parse.js`, 'utf8'), ctx);
const { BIBLE_BOOKS, parseBook } = ctx.module.exports;

const errors = [];
const warn = [];
const fail = (msg) => errors.push(msg);

// 每卷：節號 → 存在
const verses = {};
const order = {};               // 'c:v' → 在書中的順序
for (const b of BIBLE_BOOKS) {
  const book = parseBook(readFileSync(`${root}${b.file}`, 'utf8'));
  const set = new Map();
  book.chapters.forEach((list, c) => (list || []).forEach((v) => {
    if (v.cont) return;
    for (let n = v.v; n <= (v.to || v.v); n++) set.set(`${c}:${n}`, set.size);
  }));
  verses[b.id] = set;
  order[b.id] = set;
}
const abbr = Object.fromEntries(BIBLE_BOOKS.map((b) => [b.id, b.abbr]));

const RANGE = /^(\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$/;
// 把一段出處攤開成節號；出處不合格就回傳 null
function expand(book, range) {
  const m = String(range).match(RANGE);
  if (!m) return null;
  const c1 = +m[1], v1 = +m[2];
  const c2 = m[3] ? +m[3] : c1, v2 = m[4] ? +m[4] : v1;
  const set = verses[book];
  const a = set.get(`${c1}:${v1}`), z = set.get(`${c2}:${v2}`);
  if (a == null || z == null || z < a) return null;
  return [...set.keys()].slice(a, z + 1);
}

const TAGS = new Set(['奇蹟', '治病', '驅魔', '自然', '復活', '比喻', '講道']);
let data;
try { data = JSON.parse(readFileSync(`${root}data/gospel-events.json`, 'utf8')); }
catch (e) { console.log('✗ data/gospel-events.json 讀不到或不是 JSON:', e.message); process.exit(1); }

const phases = new Map((data.phases || []).map((p, i) => [p.id, i]));
if (!phases.size) fail('phases 是空的');
for (const p of data.phases || []) if (!p.id || !p.title) fail(`phase 缺 id 或 title: ${JSON.stringify(p)}`);

const ids = new Set();
const owner = { mat: new Map(), mrk: new Map(), luk: new Map(), jhn: new Map() };
let lastPhase = -1;
for (const ev of data.events || []) {
  const tag = ev.id || JSON.stringify(ev).slice(0, 40);
  if (!/^[a-z0-9-]+$/.test(ev.id || '')) fail(`${tag}: id 只能用小寫英文、數字、連字號`);
  if (ids.has(ev.id)) fail(`${tag}: id 重複`);
  ids.add(ev.id);
  if (!ev.title || ev.title.length > 20) fail(`${tag}: title 要有，且不超過 20 字`);
  if (!phases.has(ev.phase)) fail(`${tag}: phase「${ev.phase}」不在 phases 裡`);
  else {
    if (phases.get(ev.phase) < lastPhase) fail(`${tag}: 事件要按 phase 的順序排列`);
    lastPhase = Math.max(lastPhase, phases.get(ev.phase));
  }
  const refs = ev.refs || {};
  if (!Object.keys(refs).length) fail(`${tag}: 沒有 refs`);
  for (const [book, list] of Object.entries(refs)) {
    if (!verses[book]) { fail(`${tag}: 不認得的書卷 ${book}`); continue; }
    if (!Array.isArray(list) || !list.length) { fail(`${tag}: refs.${book} 要是非空陣列`); continue; }
    for (const r of list) {
      const got = expand(book, r);
      if (!got) { fail(`${tag}: 出處 ${abbr[book]} ${r} 不存在或寫法不對`); continue; }
      if (owner[book]) for (const k of got) {
        if (owner[book].has(k)) fail(`${tag}: ${abbr[book]} ${k} 已經屬於 ${owner[book].get(k)}`);
        else owner[book].set(k, ev.id);
      }
    }
  }
  if (ev.key) {
    const m = String(ev.key).match(/^([a-z]{3}) (\d+:\d+)$/);
    const inside = m && refs[m[1]] && refs[m[1]].some((r) => (expand(m[1], r) || []).includes(m[2]));
    if (!inside) fail(`${tag}: key「${ev.key}」要是 refs 範圍內的一節，寫成「mat 5:3」`);
  } else fail(`${tag}: 缺 key（金句）`);
  for (const t of ev.tags || []) if (!TAGS.has(t)) fail(`${tag}: 不認得的 tag「${t}」`);
  if ((ev.tags || []).some((t) => ['治病', '驅魔', '自然', '復活'].includes(t)) && !(ev.tags || []).includes('奇蹟'))
    fail(`${tag}: 治病／驅魔／自然／復活 要跟「奇蹟」一起標`);
}
for (const ev of data.events || []) for (const s of ev.see || []) if (!ids.has(s)) fail(`${ev.id}: see 指向不存在的 ${s}`);

// 四部福音每一節都要有歸屬
const compact = (keys) => {
  const out = [];
  for (const k of keys) {
    const last = out[out.length - 1];
    const [c, v] = k.split(':').map(Number);
    if (last && last.c === c && last.z === v - 1) last.z = v;
    else out.push({ c, a: v, z: v });
  }
  return out.map((r) => (r.a === r.z ? `${r.c}:${r.a}` : `${r.c}:${r.a}-${r.z}`)).join(', ');
};
for (const book of Object.keys(owner)) {
  const gaps = [...verses[book].keys()].filter((k) => !owner[book].has(k));
  if (gaps.length) fail(`${abbr[book]} 沒有歸到任何事件的節：${compact(gaps)}`);
}

// 每部福音裡，事件的先後大致應跟該福音的順序一致；只提醒，不算錯
for (const book of Object.keys(owner)) {
  const starts = (data.events || []).filter((e) => e.refs && e.refs[book])
    .map((e) => ({ id: e.id, at: Math.min(...e.refs[book].map((r) => order[book].get((expand(book, r) || ['0:0'])[0]) ?? 1e9)) }));
  let inv = 0;
  for (let i = 1; i < starts.length; i++) if (starts[i].at < starts[i - 1].at) inv++;
  if (inv) warn.push(`${abbr[book]}：有 ${inv} 處事件順序跟該福音的順序不同（合參本來就會有一些，例如潔淨聖殿）`);
}

const evs = data.events || [];
const gospels = ['mat', 'mrk', 'luk', 'jhn'];
const unique = evs.filter((e) => gospels.filter((g) => e.refs && e.refs[g]).length === 1).length;
console.log(`事件 ${evs.length} 個；只有一部福音記載的 ${unique} 個；`
  + `奇蹟 ${evs.filter((e) => (e.tags || []).includes('奇蹟')).length}、比喻 ${evs.filter((e) => (e.tags || []).includes('比喻')).length}、講道 ${evs.filter((e) => (e.tags || []).includes('講道')).length}`);
for (const w of warn) console.log('  ! ' + w);
if (errors.length) {
  for (const e of errors.slice(0, 60)) console.log('  ✗ ' + e);
  if (errors.length > 60) console.log(`  ⋯ 還有 ${errors.length - 60} 個`);
  console.log(`✗ ${errors.length} 個問題`);
  process.exit(1);
}
console.log('  ✓ 每個出處都存在，四部福音的每一節都恰好屬於一個事件');
