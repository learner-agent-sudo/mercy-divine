/* 九日敬禮：連續九天念同一組祈禱。內容在 data/novenas.json；進度、為誰祈禱與完成的紀錄
   存在 mercy.novena.v1，只在本機，並且放進備份檔。與修和聖事、讀經各自獨立。
   整份包在函式裡，只把 app.js 會呼叫的幾個名稱放到全域。 */
(() => {
'use strict';

const K_NOV = 'mercy.novena.v1';
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 864e5;
const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const ID_RE = /^[\w-]{1,40}$/;
const MAX_TEXT = 100;      // 為誰祈禱最多幾字
const MAX_DONE = 1000;     // 讀取與匯入時最多看幾筆完成紀錄
const MAX_LIST = 100;      // runs、intent 最多看幾項

/* ── 小工具 ───────────────────────────────────────── */
const pad = (n) => String(n).padStart(2, '0');
// 本地時間的日期，例如 2026-11-09（不用 toISOString，那是 UTC，半夜會差一天）
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayKey = () => dayKey(new Date());
// 日期換成 UTC 的毫秒數，相減就是相差幾天，不受夏令時間影響
const utcOf = (key) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d); };
// 真的存在的日期，而且不是未來
function isDay(s) {
  if (typeof s !== 'string' || !DAY_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d && s <= todayKey();
}
const fullDate = (key) => { const [y, m, d] = key.split('-').map(Number); return `${y}年${m}月${d}日`; };
// 今年的日期省略年份，例如「10月1日」
const shortDate = (key) => (key.slice(0, 4) === String(new Date().getFullYear())
  ? fullDate(key).replace(/^\d{4}年/, '') : fullDate(key));
const validId = (s) => typeof s === 'string' && ID_RE.test(s);
const str = (v) => (typeof v === 'string' ? v : '');
const strs = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []);
const cleanText = (s, max) => (typeof s === 'string' ? s.trim().slice(0, max) : '');
function btn(text, cls, fn) {
  const b = el('button', cls, text);
  b.type = 'button';
  if (fn) b.addEventListener('click', fn);
  return b;
}
const bodyEl = () => document.getElementById('novena-body');

/* ── 儲存（localStorage） ─────────────────────────── */
// 讀取時逐項檢查，壞掉的項目直接丟掉；永遠回傳形狀正確的物件
// runs:   { "<id>": { start, days: { "1": 日期, … } } }   進行中的念誦
// done:   [ { id, start, end, for } ]                        念完的紀錄，依完成日排序
// intent: { "<id>": "為誰祈禱" }                              跨次念誦保留
function cleanRun(id, r) {
  if (!validId(id) || !r || typeof r !== 'object' || !isDay(r.start) || !r.days || typeof r.days !== 'object') return null;
  const days = {};
  for (const [k, v] of Object.entries(r.days)) {
    if (/^[1-9]$/.test(k) && isDay(v) && v >= r.start) days[k] = v;
  }
  const n = Object.keys(days).length;
  // 一天都沒有，或九天都念過（應已記入完成），都不是進行中的念誦
  if (!n || n >= 9) return null;
  return { start: r.start, days };
}
function cleanDone(e) {
  if (!e || typeof e !== 'object' || !validId(e.id) || !isDay(e.start) || !isDay(e.end) || e.start > e.end) return null;
  return { id: e.id, start: e.start, end: e.end, for: cleanText(e.for, MAX_TEXT) };
}
const byEnd = (a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : a.start < b.start ? -1 : a.start > b.start ? 1 : 0);

function readStore() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(K_NOV) || 'null'); } catch { raw = null; }
  const s = { runs: {}, done: [], intent: {} };
  if (!raw || typeof raw !== 'object') return s;
  if (raw.runs && typeof raw.runs === 'object' && !Array.isArray(raw.runs)) {
    for (const [id, r] of Object.entries(raw.runs).slice(0, MAX_LIST)) {
      const run = cleanRun(id, r);
      if (run) s.runs[id] = run;
    }
  }
  if (Array.isArray(raw.done)) s.done = raw.done.slice(0, MAX_DONE).map(cleanDone).filter(Boolean).sort(byEnd);
  if (raw.intent && typeof raw.intent === 'object' && !Array.isArray(raw.intent)) {
    for (const [id, t] of Object.entries(raw.intent).slice(0, MAX_LIST)) {
      const text = cleanText(t, MAX_TEXT);
      if (validId(id) && text) s.intent[id] = text;
    }
  }
  return s;
}
// 寫進 localStorage；失敗時 store.write 會顯示提示，回傳 false
const writeStore = (s) => store.write(K_NOV, s);

/* ── 內容（data/novenas.json） ────────────────────── */
let data = null;              // 載入後的 { novenas: [ { id, name, sub, question, days, close } ] }
let loadPromise = null;

// 單檔預覽版把資料嵌在頁面裡；正式版用 fetch 讀 data/novenas.json
async function fetchData() {
  let packed = null;
  try { packed = inlineJSON('data-novenas'); } catch { packed = null; }
  if (packed) return packed;
  const r = await fetch('data/novenas.json');
  if (!r.ok) throw new Error('data/novenas.json');
  return r.json();
}

function build(raw) {
  if (!raw || !Array.isArray(raw.novenas)) throw new Error('九日敬禮資料格式不符');
  const novenas = raw.novenas
    .filter((n) => n && validId(n.id) && typeof n.name === 'string' && Array.isArray(n.days) && n.days.length === 9)
    .map((n) => ({
      id: n.id,
      name: n.name,
      sub: str(n.sub),
      question: str(n.question),
      days: n.days.map((d) => ({ theme: str(d && d.theme), answer: strs(d && d.answer), appeal: strs(d && d.appeal) })),
      close: Array.isArray(n.close) ? n.close.filter((c) => c && typeof c === 'object' && typeof c.kind === 'string') : [],
    }));
  data = { novenas };
  return data;
}

function load() {
  if (!loadPromise) {
    loadPromise = fetchData().then(build).catch((e) => { loadPromise = null; throw e; });
  }
  return loadPromise;
}

const findNovena = (id) => (data ? data.novenas.find((n) => n.id === id) || null : null);

// 經文：依序在 SETS 裡找第一套有這一篇的（天主經、聖母經），找不到就回傳 null
function findPrayer(id) {
  for (const set of SETS) {
    const p = set && set.prayers && set.prayers[id];
    if (p && typeof p.text === 'string' && p.text) return p;
  }
  return null;
}

/* ── 進度的計算 ───────────────────────────────────── */
// 下一天：1 到 9 之中還沒念的最小一天；沒有進行中的念誦就是第一天
function nextDay(run) {
  if (!run) return 1;
  for (let n = 1; n <= 9; n++) if (!run.days[String(n)]) return n;
  return null;
}
const doneCount = (run) => Object.keys(run.days).length;
const lastMarked = (run) => Object.values(run.days).reduce((a, b) => (b > a ? b : a));
// 距今幾天（今天是 0，昨天是 1）
const gapDays = (last) => Math.round((utcOf(todayKey()) - utcOf(last)) / DAY_MS);

/* ── 寫入動作 ─────────────────────────────────────── */
// 念完某一天：沒有念誦就開始一個，start 是今天；九天都念完就記入完成，念誦清除
function markDay(id, n) {
  const nov = findNovena(id);
  if (!nov) return;
  const s = readStore();
  const today = todayKey();
  const run = s.runs[id] || { start: today, days: {} };
  run.days[String(n)] = today;
  let finished = false;
  if (doneCount(run) === 9) {
    s.done.push({ id, start: run.start, end: today, for: s.intent[id] || '' });
    s.done.sort(byEnd);
    delete s.runs[id];
    finished = true;
  } else {
    s.runs[id] = run;
  }
  if (!writeStore(s)) return;
  // 念完了也留在這一天的畫面（改成「九天都念完了」），不另換畫面，返回鍵才不會多出一層
  toast(finished ? `${nov.name}念完了` : `第${CN[n - 1]}天念完了`);
  paint(true);
}

// 取消某一天的紀錄；這天沒有了，念誦裡就沒有任何一天，整個念誦清除
function undoDay(id, n) {
  if (!confirm(`取消第${CN[n - 1]}天的紀錄？`)) return;
  const s = readStore();
  const run = s.runs[id];
  if (!run || !run.days[String(n)]) return;
  delete run.days[String(n)];
  if (!doneCount(run)) delete s.runs[id];
  if (!writeStore(s)) return;
  toast('已取消');
  paint(true);
}

function restart(id) {
  const s = readStore();
  const run = s.runs[id];
  const k = run ? doneCount(run) : 0;
  if (!confirm(`重新開始？已念的 ${k} 天紀錄會清除。`)) return;
  delete s.runs[id];
  if (!writeStore(s)) return;
  toast('已重新開始');
  paint();
}

// 為誰祈禱：打字時就存，不重畫（否則輸入的焦點會跑掉）
function saveIntent(id, value) {
  const s = readStore();
  const text = value.slice(0, MAX_TEXT);
  if (text.trim()) s.intent[id] = text; else delete s.intent[id];
  writeStore(s);
}

/* ── 備份 ─────────────────────────────────────────── */
// 備份：完成的紀錄、進行中的念誦與為誰祈禱；都沒有就是 null
function novenaExport() {
  const s = readStore();
  if (!s.done.length && !Object.keys(s.runs).length && !Object.keys(s.intent).length) return null;
  return { runs: s.runs, done: s.done, intent: s.intent };
}

// 備份檔的內容一律逐項檢查，不照單全收。完成的紀錄以 id|start|end 去重；
// 進行中的念誦只在本機沒有時才接受；為誰祈禱只在本機沒有時才填入。
function novenaImport(raw) {
  const added = { done: 0, runs: 0 };
  if (!raw || typeof raw !== 'object') return added;
  const s = readStore();
  const before = JSON.stringify(s);
  const keyOf = (e) => `${e.id}|${e.start}|${e.end}`;

  const have = new Set(s.done.map(keyOf));
  const incoming = Array.isArray(raw.done) ? raw.done.slice(0, MAX_DONE).map(cleanDone).filter(Boolean) : [];
  for (const e of incoming) {
    if (have.has(keyOf(e))) continue;
    have.add(keyOf(e));
    s.done.push(e);
    added.done++;
  }
  s.done.sort(byEnd);

  const finished = new Set(s.done.map((e) => `${e.id}|${e.start}`));
  if (raw.runs && typeof raw.runs === 'object' && !Array.isArray(raw.runs)) {
    for (const [id, r] of Object.entries(raw.runs).slice(0, MAX_LIST)) {
      if (s.runs[id]) continue;
      const run = cleanRun(id, r);
      if (!run || finished.has(`${id}|${run.start}`)) continue;
      s.runs[id] = run;
      added.runs++;
    }
  }

  if (raw.intent && typeof raw.intent === 'object' && !Array.isArray(raw.intent)) {
    for (const [id, t] of Object.entries(raw.intent).slice(0, MAX_LIST)) {
      const text = cleanText(t, MAX_TEXT);
      if (validId(id) && text && !s.intent[id]) s.intent[id] = text;
    }
  }

  if (JSON.stringify(s) === before) return added;
  if (!writeStore(s)) return { done: 0, runs: 0 };
  renderNovenaHome();
  if (current === 'novena' && shown) paint(true);
  return added;
}

/* ── 首頁的卡片 ───────────────────────────────────── */
// 第一個有進行中念誦的（依資料的次序）
function activeRun() {
  if (!data) return null;
  const s = readStore();
  for (const nov of data.novenas) {
    const run = s.runs[nov.id];
    if (run) return { nov, run };
  }
  return null;
}

function renderNovenaHome() {
  const line = document.getElementById('novena-home-line');
  const cont = document.getElementById('novena-continue');
  const open = document.getElementById('novena-open');
  if (!line || !cont || !open) return;
  // 資料可能還沒載入：載入後再畫一次
  if (!data) { load().then(() => renderNovenaHome(), () => {}); return; }
  const act = activeRun();
  if (act) {
    line.textContent = `${act.nov.name}：已念 ${doneCount(act.run)} / 9 天`;
    cont.hidden = false;
    cont.textContent = `念第${CN[nextDay(act.run) - 1]}天`;
    return;
  }
  cont.hidden = true;
  const s = readStore();
  const last = s.done[s.done.length - 1];
  if (last) {
    const nov = findNovena(last.id);
    line.textContent = `上次念完：${nov ? nov.name : last.id}，${shortDate(last.end)}`;
  } else {
    line.textContent = '連續九天的祈禱';
  }
}

/* ── 換畫面 ───────────────────────────────────────── */
let shown = null;             // 目前畫面：{ screen: 'list' | 'novena' | 'day', id, n }
let renderToken = 0;

// 往裡走：加一筆歷史，返回鍵就能退出來。同一層換天用 replace，返回鍵不會一天一天倒退。
function nav(st, replace) {
  const entry = { view: 'novena', novena: st };
  if (replace) history.replaceState(entry, ''); else history.pushState(entry, '');
  novenaShow(st);
}

// 參數不認得（沒有這個代號、天數不在 1 到 9）就回到列表
function resolve(st) {
  const id = st && typeof st === 'object' ? st.id : null;
  const nov = validId(id) ? findNovena(id) : null;
  if (st && st.screen === 'novena' && nov) return { screen: 'novena', id: nov.id };
  if (st && st.screen === 'day' && nov && Number.isInteger(st.n) && st.n >= 1 && st.n <= 9) {
    return { screen: 'day', id: nov.id, n: st.n };
  }
  return { screen: 'list' };
}

// 只畫出畫面，不加歷史紀錄（返回鍵與重新載入時用）
function novenaShow(st) {
  if (current !== 'novena') go('novena');
  const token = ++renderToken;
  if (data) { shown = resolve(st); paint(); return; }
  const host = bodyEl();
  host.textContent = '';
  host.append(el('p', 'empty', '載入中⋯'));
  load().then(
    () => { if (token === renderToken) { shown = resolve(st); paint(); } },
    () => {
      if (token !== renderToken) return;
      host.textContent = '';
      host.append(el('p', 'empty', '無法載入九日敬禮的資料檔案。'), btn('再試一次', 'btn btn-block', () => novenaShow(st)));
    },
  );
}

// keepY：重畫時保留捲動位置（同一頁內的操作）；換頁時回到頂端
function paint(keepY) {
  if (!shown || !data) return;
  const y = keepY ? window.scrollY : 0;
  const host = bodyEl();
  host.textContent = '';
  if (shown.screen === 'list') paintList(host);
  else if (shown.screen === 'novena') paintNovena(host, findNovena(shown.id));
  else paintDay(host, findNovena(shown.id), shown.n);
  window.scrollTo(0, y);
}

/* 列表：每個九日敬禮一張卡片 */
function paintList(host) {
  if (!data.novenas.length) { host.append(el('p', 'empty', '目前沒有九日敬禮的內容。')); return; }
  const s = readStore();
  const list = el('div', 'nov-list');
  for (const nov of data.novenas) {
    const run = s.runs[nov.id];
    const c = s.done.filter((e) => e.id === nov.id).length;
    const status = run ? `已念 ${doneCount(run)} / 9 天` : c ? `念完 ${c} 次` : '還沒念過';
    const b = btn('', 'nov-card', () => nav({ screen: 'novena', id: nov.id }, false));
    b.dataset.id = nov.id;
    b.append(el('span', 'nov-card-name', nov.name), el('span', 'nov-card-sub', nov.sub), el('span', 'nov-card-status', status));
    list.append(b);
  }
  host.append(list);
}

/* 一個九日敬禮：進度、為誰祈禱、九天的目錄、完成的紀錄 */
function paintNovena(host, nov) {
  const s = readStore();
  const run = s.runs[nov.id] || null;
  host.append(el('h2', 'nov-title', nov.name), el('p', 'nov-sub', nov.sub));

  if (run) {
    const status = el('div', 'nov-status');
    status.append(el('p', 'nov-progress', `已念 ${doneCount(run)} / 9 天 · ${shortDate(run.start)}開始`));
    const dots = el('div', 'nov-dots');
    dots.setAttribute('aria-hidden', 'true');
    for (let n = 1; n <= 9; n++) dots.append(el('span', run.days[String(n)] ? 'nov-dot on' : 'nov-dot'));
    status.append(dots);
    const today = todayKey();
    const last = lastMarked(run);
    const next = nextDay(run);
    if (last === today) {
      // 今天念過的最後一天，以及明天要念的那一天
      let todayN = 0;
      for (let n = 1; n <= 9; n++) if (run.days[String(n)] === today) todayN = n;
      status.append(el('p', 'nov-hint', `今天已念第${CN[todayN - 1]}天，明天念第${CN[next - 1]}天`));
    } else if (gapDays(last) >= 2) {
      status.append(el('p', 'nov-hint', `上次念是 ${shortDate(last)}，已隔 ${gapDays(last) - 1} 天。可以接著念，也可以重新開始。`));
    }
    host.append(status);
  }

  const label = el('label', 'nov-intent');
  label.append(el('span', 'nov-intent-label', '為誰祈禱（可留空）'));
  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'nov-intent';
  input.maxLength = MAX_TEXT;
  input.placeholder = '例如：亡父 若瑟';
  input.autocomplete = 'off';
  input.value = s.intent[nov.id] || '';
  input.addEventListener('input', () => saveIntent(nov.id, input.value));
  label.append(input);
  host.append(label);

  const next = nextDay(run);
  const goBtn = btn(run ? `念第${CN[next - 1]}天` : '開始：念第一天', 'btn btn-primary btn-block nov-go',
    () => nav({ screen: 'day', id: nov.id, n: next }, false));
  goBtn.id = 'nov-go';
  host.append(goBtn);

  const rows = el('div', 'nov-days');
  nov.days.forEach((d, i) => {
    const n = i + 1;
    const doneOn = run ? run.days[String(n)] : null;
    const b = btn('', 'nov-day', () => nav({ screen: 'day', id: nov.id, n }, false));
    b.dataset.n = String(n);
    b.append(el('span', 'nov-day-n', `第${CN[i]}天`), el('span', 'nov-day-theme', d.theme),
      el('span', 'nov-day-date', doneOn ? shortDate(doneOn) : ''));
    rows.append(b);
  });
  host.append(rows);

  if (run) {
    const r = btn('重新開始', 'btn btn-quiet btn-block', () => restart(nov.id));
    r.id = 'nov-restart';
    host.append(r);
  }

  const mine = s.done.filter((e) => e.id === nov.id).reverse();
  if (mine.length) {
    const sec = el('section', 'nov-records');
    sec.append(el('h3', 'nov-records-title', '念完的紀錄'));
    const ul = el('ul', 'nov-record-list');
    for (const e of mine) {
      const li = el('li', null, `${fullDate(e.end)}念完（${shortDate(e.start)}開始）`);
      if (e.for) li.append(el('span', 'nov-record-for', `· 為：${e.for}`));
      ul.append(li);
    }
    sec.append(ul);
    host.append(sec);
  }
}

/* 某一天：主題、問題、煉靈的回答與懇求、結尾的祈禱，以及念完的按鈕 */
function paintDay(host, nov, n) {
  const s = readStore();
  const run = s.runs[nov.id] || null;
  const day = nov.days[n - 1];
  const doneOn = run ? run.days[String(n)] : null;
  const intent = s.intent[nov.id] || '';

  host.append(el('p', 'nov-crumb', nov.name));
  host.append(el('h2', 'nov-day-title', `第${CN[n - 1]}天`), el('p', 'nov-theme', day.theme));
  if (intent) host.append(el('p', 'nov-for', `為：${intent}`));
  if (nov.question) host.append(el('p', 'nov-q', nov.question));

  const ans = el('div', 'nov-answer');
  for (const t of day.answer) ans.append(el('p', null, t));
  host.append(ans);

  if (day.appeal.length) {
    const ap = el('div', 'nov-appeal');
    for (const t of day.appeal) ap.append(el('p', null, t));
    host.append(ap);
  }

  for (const c of nov.close) for (const node of closeEl(c)) host.append(node);

  const bottom = el('div', 'nov-bottom');
  // 今天剛念完九天：每一天都顯示「九天都念完了」，不再出現念完的按鈕（明天起才可再開始）
  const finished = !run ? s.done.filter((e) => e.id === nov.id && e.end === todayKey()).pop() : null;
  if (finished) {
    bottom.append(el('p', 'nov-done nov-finished', `九天都念完了（${shortDate(finished.start)}開始）`));
    const rec = btn('看念完的紀錄', 'btn btn-block', () => nav({ screen: 'novena', id: nov.id }, false));
    rec.id = 'nov-records-go';
    bottom.append(rec);
  } else if (!doneOn) {
    const mark = btn(`念完第${CN[n - 1]}天`, 'btn btn-primary btn-block', () => markDay(nov.id, n));
    mark.id = 'nov-mark';
    bottom.append(mark);
  } else {
    bottom.append(el('p', 'nov-done', `已於 ${shortDate(doneOn)}念完`));
    const undo = btn('取消這天的紀錄', 'btn btn-quiet btn-block', () => undoDay(nov.id, n));
    undo.id = 'nov-undo';
    bottom.append(undo);
    const after = nextDay(run);
    if (after) {
      const see = btn(`看第${CN[after - 1]}天`, 'btn btn-block', () => nav({ screen: 'day', id: nov.id, n: after }, false));
      see.id = 'nov-see';
      bottom.append(see);
    }
  }
  host.append(bottom);

  const pn = el('div', 'nov-pn');
  if (n > 1) {
    const prev = btn(`‹ 第${CN[n - 2]}天`, 'btn btn-quiet nov-prev', () => nav({ screen: 'day', id: nov.id, n: n - 1 }, true));
    prev.id = 'nov-prev';
    pn.append(prev);
  }
  if (n < 9) {
    const next = btn(`第${CN[n]}天 ›`, 'btn btn-quiet nov-next', () => nav({ screen: 'day', id: nov.id, n: n + 1 }, true));
    next.id = 'nov-next';
    pn.append(next);
  }
  if (pn.childElementCount) host.append(pn);
}

// 結尾的每一項：祈禱（金框）、一句短句、或要念的經（可展開看經文）
function closeEl(c) {
  if (c.kind === 'prayer') {
    const q = el('blockquote', 'nov-prayer');
    if (c.label) q.append(el('span', 'nov-prayer-label', c.label));
    q.append(el('p', null, str(c.text)));
    return [q];
  }
  if (c.kind === 'line') return [el('p', 'nov-line', str(c.text))];
  if (c.kind === 'count') {
    const out = [el('p', 'nov-line', str(c.text))];
    for (const id of Array.isArray(c.prayers) ? c.prayers : []) {
      const p = findPrayer(id);
      if (!p) continue;
      const d = document.createElement('details');
      d.className = 'nov-pr';
      const sum = document.createElement('summary');
      sum.textContent = p.name;
      d.append(sum, el('div', 'nov-pr-body', p.text));
      out.push(d);
    }
    return out;
  }
  return [];
}

/* ── 啟動 ─────────────────────────────────────────── */
function start() {
  document.getElementById('novena-continue').addEventListener('click', () => {
    load().then(() => {
      const act = activeRun();
      if (act) nav({ screen: 'day', id: act.nov.id, n: nextDay(act.run) }, false);
    }).catch(() => toast('無法載入九日敬禮的資料'));
  });
  document.getElementById('novena-open').addEventListener('click', () => nav({ screen: 'list' }, false));
  document.getElementById('novena-back').addEventListener('click', () => history.back());
  renderNovenaHome();
  // 重新載入時歷史紀錄停在這裡：app.js 的 init 會接手；若 init 比這裡先跑完，就等 app 顯示後再接手
  if (history.state && history.state.novena) {
    const wait = () => {
      if (document.getElementById('app').hidden) setTimeout(wait, 50);
      else novenaShow(history.state.novena);
    };
    wait();
  }
}

Object.assign(window, { novenaShow, renderNovenaHome, novenaExport, novenaImport });
start();
})();
