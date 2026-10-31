// 檢查 data/people.json（人物：誰說了什麼）：每個出處都存在，金句在出處範圍內，互相參照的 id 都找得到。
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

const verses = {};               // 書卷 → Map('c:v' → 順序)
const text = {};                 // 書卷 → Map('c:v' → 經文)
for (const b of BIBLE_BOOKS) {
  const book = parseBook(readFileSync(`${root}${b.file}`, 'utf8'));
  const set = new Map(), t = new Map();
  book.chapters.forEach((list, c) => (list || []).forEach((v) => {
    for (let n = v.v; n <= (v.to || v.v); n++) {
      const k = `${c}:${n}`;
      if (!v.cont) set.set(k, set.size);
      t.set(k, (t.get(k) || '') + v.t);
    }
  }));
  verses[b.id] = set;
  text[b.id] = t;
}
const abbr = Object.fromEntries(BIBLE_BOOKS.map((b) => [b.id, b.abbr]));

const RANGE = /^(\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$/;
function expand(book, range) {
  const m = String(range).match(RANGE);
  if (!m || !verses[book]) return null;
  const c1 = +m[1], v1 = +m[2];
  const c2 = m[3] ? +m[3] : c1, v2 = m[4] ? +m[4] : v1;
  const set = verses[book];
  const a = set.get(`${c1}:${v1}`), z = set.get(`${c2}:${v2}`);
  if (a == null || z == null || z < a) return null;
  return [...set.keys()].slice(a, z + 1);
}
// refs 物件 → { book: ['c:v', …] }；有錯就記下
function checkRefs(tag, what, refs) {
  const out = {};
  if (!refs || typeof refs !== 'object' || !Object.keys(refs).length) { fail(`${tag}: ${what} 是空的`); return out; }
  for (const [book, list] of Object.entries(refs)) {
    if (!verses[book]) { fail(`${tag}: ${what} 有不認得的書卷 ${book}`); continue; }
    if (!Array.isArray(list) || !list.length) { fail(`${tag}: ${what}.${book} 要是非空陣列`); continue; }
    out[book] = [];
    for (const r of list) {
      const got = expand(book, r);
      if (!got) fail(`${tag}: ${what} ${abbr[book]} ${r} 不存在或寫法不對`);
      else out[book].push(...got);
    }
  }
  return out;
}

let data;
try { data = JSON.parse(readFileSync(`${root}data/people.json`, 'utf8')); }
catch (e) { console.log('✗ data/people.json 讀不到或不是 JSON:', e.message); process.exit(1); }

const groups = new Set((data.groups || []).map((g) => g.id));
if (!groups.size) fail('groups 是空的');
for (const g of data.groups || []) if (!g.id || !g.title) fail(`group 缺 id 或 title: ${JSON.stringify(g)}`);

const ID = /^[a-z0-9-]+$/;
const personIds = new Set();
const sayingIds = new Set();
const all = [];
for (const p of data.people || []) {
  const tag = p.id || JSON.stringify(p).slice(0, 40);
  if (!ID.test(p.id || '')) fail(`${tag}: 人物 id 只能用小寫英文、數字、連字號`);
  if (personIds.has(p.id)) fail(`${tag}: 人物 id 重複`);
  personIds.add(p.id);
  if (!p.name || p.name.length > 12) fail(`${tag}: name 要有，且不超過 12 字`);
  if (p.aka && (!Array.isArray(p.aka) || p.aka.some((a) => typeof a !== 'string' || !a))) fail(`${tag}: aka 要是字串陣列`);
  if (!groups.has(p.group)) fail(`${tag}: group「${p.group}」不在 groups 裡`);
  if (!p.intro || p.intro.length > 60) fail(`${tag}: intro 要有，且不超過 60 字`);
  if (!Array.isArray(p.stages) || !p.stages.length) { fail(`${tag}: 沒有 stages`); continue; }
  const seen = new Map();           // 同一個人，同一節不要出現在兩段話裡
  for (const st of p.stages) {
    if (!st.title || st.title.length > 10) fail(`${tag}: stage title 要有，且不超過 10 字`);
    if (!Array.isArray(st.sayings) || !st.sayings.length) { fail(`${tag}: stage「${st.title}」沒有 sayings`); continue; }
    for (const s of st.sayings) {
      const stag = `${tag}/${s.id || '?'}`;
      if (!ID.test(s.id || '')) fail(`${stag}: id 只能用小寫英文、數字、連字號`);
      if (sayingIds.has(s.id) || personIds.has(s.id)) fail(`${stag}: id 重複`);
      sayingIds.add(s.id);
      all.push(s);
      if (!s.title || s.title.length > 16) fail(`${stag}: title 要有，且不超過 16 字`);
      if (!s.to || s.to.length > 12) fail(`${stag}: to（對誰說）要有，且不超過 12 字`);
      const keys = checkRefs(stag, 'refs', s.refs);
      for (const [book, list] of Object.entries(keys)) for (const k of list) {
        const at = `${book} ${k}`;
        if (seen.has(at)) warn.push(`${stag}: ${abbr[book]} ${k} 也在 ${seen.get(at)} 裡`);
        else seen.set(at, s.id);
      }
      const m = String(s.key || '').match(/^([a-z]{3}) (\d+:\d+)$/);
      if (!m || !(keys[m[1]] || []).includes(m[2])) fail(`${stag}: key「${s.key}」要是 refs 範圍內的一節，寫成「mat 5:3」`);
      if (s.reply) {
        checkRefs(stag, 'reply', s.reply);
        if (!s.replyBy || s.replyBy.length > 8) fail(`${stag}: 有 reply 就要有 replyBy（誰回答），不超過 8 字`);
      } else if (s.replyBy) fail(`${stag}: 有 replyBy 卻沒有 reply`);
      if (s.note != null && (typeof s.note !== 'string' || !s.note || s.note.length > 90)) fail(`${stag}: note 不超過 90 字`);
      // 說話的那幾節裡，至少要有一節帶引號（長篇講辭的中間幾節可以沒有）
      const quoted = Object.entries(keys).some(([book, list]) => list.some((k) => /[「」]/.test(text[book].get(k) || '')));
      if (Object.keys(keys).length && !quoted) warn.push(`${stag}: 出處裡找不到「」，確定是他說的話嗎？`);
    }
  }
}
for (const s of all) for (const id of s.see || []) {
  if (!sayingIds.has(id)) fail(`${s.id}: see 指向不存在的 ${id}`);
  if (id === s.id) fail(`${s.id}: see 指向自己`);
}

const count = (data.people || []).map((p) => `${p.name} ${p.stages.reduce((n, st) => n + (st.sayings || []).length, 0)}`).join('、');
console.log(`人物 ${personIds.size} 位，話 ${sayingIds.size} 段：${count}`);
for (const w of warn) console.log('  ! ' + w);
if (errors.length) {
  for (const e of errors.slice(0, 60)) console.log('  ✗ ' + e);
  if (errors.length > 60) console.log(`  ⋯ 還有 ${errors.length - 60} 個`);
  console.log(`✗ ${errors.length} 個問題`);
  process.exit(1);
}
console.log('  ✓ 每個出處都存在，金句都在範圍內，參照都找得到');
