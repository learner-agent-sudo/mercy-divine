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
let data = null;              // 載入後的 { novenas: [ { id, name, sub, track, picture, question, open, days, close } ]；track 是 'candles'（蠟燭）或 'dots'（點點）；picture 是 { file, caption } 或 null，days 每天另有 text }
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

// 區塊（開始或結尾的每一項）：只留有 kind 字串的物件
const blocks = (a) => (Array.isArray(a) ? a.filter((c) => c && typeof c === 'object' && typeof c.kind === 'string') : []);
// 插圖：只收 images/ 底下的圖檔路徑（單檔預覽版改成內嵌的 data: 圖）；不合格就沒有插圖
const picKey = (nov) => `novena:${nov.id}`;
const PIC_RE = /^images\/[\w.-]+\.(svg|jpe?g|png|webp)$/;
const PIC_DATA = /^data:image\/(svg\+xml|png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const picture = (p) => (p && typeof p === 'object' && typeof p.file === 'string' && (PIC_RE.test(p.file) || PIC_DATA.test(p.file))
  ? { file: p.file, caption: str(p.caption) } : null);

function build(raw) {
  if (!raw || !Array.isArray(raw.novenas)) throw new Error('九日敬禮資料格式不符');
  const novenas = raw.novenas
    .filter((n) => n && validId(n.id) && typeof n.name === 'string' && Array.isArray(n.days) && n.days.length === 9)
    .map((n) => ({
      id: n.id,
      name: n.name,
      sub: str(n.sub),
      track: n.track === 'candles' ? 'candles' : 'dots',
      picture: picture(n.picture),
      question: str(n.question),
      open: blocks(n.open),
      days: n.days.map((d) => ({
        theme: str(d && d.theme), answer: strs(d && d.answer), appeal: strs(d && d.appeal), text: strs(d && d.text),
      })),
      close: blocks(n.close),
    }));
  data = { novenas };
  // 每個九日敬禮一個聖像位置，和念經時的聖像同一套設定（設定 → 聖像，或圖下面的「換圖」）
  if (typeof registerPictureSlots === 'function') {
    registerPictureSlots('九日敬禮', novenas.map((n) => [picKey(n), n.name]),
      novenas.filter((n) => n.picture).map((n) => ({
        id: picKey(n), file: n.picture.file, caption: n.picture.caption, for: [picKey(n)],
      })));
  }
  return data;
}

function load() {
  if (!loadPromise) {
    loadPromise = fetchData().then(build).catch((e) => { loadPromise = null; throw e; });
  }
  return loadPromise;
}
// 匯入備份前等資料載入（聖像位置登記好才認得）；載入失敗也照樣往下
const novenaReady = () => load().then(() => {}, () => {});

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

/* ── 蠟燭（煉靈九日敬禮：進度是九支蠟燭，念完一天點亮一支） ───── */
const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, String(v));
  return e;
};
let candleSeq = 0;            // 每支蠟燭的漸層 id 都不同，同一頁好幾排也不會撞
// 一支蠟燭：蠟身、燭芯、一滴蠟；點亮的才有火焰與光暈。火焰的搖晃由 CSS 負責，這裡只錯開相位
function candleSvg(n, lit) {
  const id = ++candleSeq;
  const svg = svgEl('svg', { viewBox: '0 0 24 56', 'aria-hidden': 'true', focusable: 'false' });
  const defs = svgEl('defs');
  const grad = (tag, gid, attrs, stops) => {
    const g = svgEl(tag, { id: `${gid}-${id}`, ...attrs });
    for (const [off, color, op] of stops) g.append(svgEl('stop', { offset: off, 'stop-color': color, 'stop-opacity': op ?? 1 }));
    defs.append(g);
    return `url(#${gid}-${id})`;
  };
  // 蠟身：左邊亮、右邊暗；沒點亮的蠟身稍微灰一點
  const waxFill = lit
    ? grad('linearGradient', 'cw', { x1: 0, y1: 0, x2: 1, y2: 0 }, [[0, '#fffbf1'], [0.35, '#f4e8cb'], [1, '#d8c59c']])
    : grad('linearGradient', 'cw', { x1: 0, y1: 0, x2: 1, y2: 0 }, [[0, '#e7e2d8'], [0.35, '#d3cbba'], [1, '#b2a78f']]);
  svg.append(defs);
  if (lit) {
    const glow = svgEl('circle', { class: 'nov-candle-glow', cx: 12, cy: 11, r: 10, fill: grad('radialGradient', 'cg',
      { cx: 0.5, cy: 0.5, r: 0.5 }, [[0, '#ffd98a', 0.75], [0.5, '#ffc857', 0.3], [1, '#ffc857', 0]]) });
    svg.append(glow);
  }
  svg.append(svgEl('rect', { x: 7.5, y: 20, width: 9, height: 31, rx: 1.6, fill: waxFill, stroke: '#b9a57c', 'stroke-width': 0.5 }));
  // 點亮的蠟燭，燭芯下的蠟融成一小圈亮光
  if (lit) svg.append(svgEl('ellipse', { cx: 12, cy: 20.8, rx: 4, ry: 1.3, fill: '#fff3cf', opacity: 0.9 }));
  // 銅燭台：一個小碟子
  const brass = grad('linearGradient', 'cb', { x1: 0, y1: 0, x2: 1, y2: 0 }, [[0, '#e6c778'], [0.5, '#b88d36'], [1, '#7d5c1f']]);
  svg.append(svgEl('path', { d: 'M2.5 50.6H21.5L19.2 54.6H4.8Z', fill: brass, stroke: '#6b4e19', 'stroke-width': 0.4, 'stroke-linejoin': 'round' }));
  svg.append(svgEl('ellipse', { cx: 12, cy: 50.6, rx: 9.5, ry: 1.4, fill: '#ecd38d', stroke: '#8a6a26', 'stroke-width': 0.35 }));
  svg.append(svgEl('path', { d: 'M15.2 21C15.2 21 16.3 22.6 16.3 23.6C16.3 24.5 15.8 25 15.2 25C14.6 25 14.1 24.5 14.1 23.6C14.1 22.6 15.2 21 15.2 21Z',
    fill: '#efe4c8', stroke: '#b9a57c', 'stroke-width': 0.4 }));
  svg.append(svgEl('rect', { x: 11.3, y: 15.5, width: 1.4, height: 4.6, rx: 0.5, fill: '#5b4a3a' }));
  if (lit) {
    const flame = svgEl('g', { class: 'nov-candle-flame' });
    flame.style.animationDelay = `${-(n * 0.37).toFixed(2)}s`;
    const outer = grad('linearGradient', 'cf', { x1: 0, y1: 0, x2: 0, y2: 1 }, [[0, '#ffe08a'], [0.55, '#f8a52a'], [1, '#e8701a']]);
    flame.append(svgEl('path', { d: 'M12 2C14.6 6.2 17 9.4 17 12.6C17 15.2 14.8 17 12 17C9.2 17 7 15.2 7 12.6C7 9.4 9.4 6.2 12 2Z', fill: outer }));
    flame.append(svgEl('path', { d: 'M12 8.5C13.4 10.6 14.4 12.2 14.4 13.9C14.4 15.3 13.3 16.3 12 16.3C10.7 16.3 9.6 15.3 9.6 13.9C9.6 12.2 10.6 10.6 12 8.5Z',
      fill: '#fff6c4', opacity: 0.95 }));
    svg.append(flame);
  }
  return svg;
}

// 九支蠟燭的一排：run 為 null 就是九支都沒點亮。aria-label 說明點亮了幾支
function candleRow(run) {
  const k = run ? doneCount(run) : 0;
  const row = el('div', 'nov-candles');
  row.setAttribute('role', 'img');
  row.setAttribute('aria-label', `已點亮 ${k} / 9 支蠟燭`);
  for (let n = 1; n <= 9; n++) {
    const lit = !!(run && run.days[String(n)]);
    const c = el('span', lit ? 'nov-candle lit' : 'nov-candle');
    c.dataset.n = String(n);
    c.append(candleSvg(n, lit));
    row.append(c);
  }
  return row;
}

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
  const candles = nov.track === 'candles';
  toast(finished ? `${nov.name}念完了`
    : candles ? `第${CN[n - 1]}天念完了，點亮了第${CN[n - 1]}支蠟燭` : `第${CN[n - 1]}天念完了`);
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
// 所有進行中的念誦，依資料的次序：{ nov, run }
function activeRuns() {
  if (!data) return [];
  const s = readStore();
  const out = [];
  for (const nov of data.novenas) {
    const run = s.runs[nov.id];
    if (run) out.push({ nov, run });
  }
  return out;
}

// 「某某九日敬禮：已念 k / 9 天」；名字長時只在冒號後換行，「已念 k / 9 天」不拆開
const runLine = (act) => [`${act.nov.name}：`, el('span', 'nov-home-n', `已念 ${doneCount(act.run)} / 9 天`)];

function renderNovenaHome() {
  const line = document.getElementById('novena-home-line');
  const cont = document.getElementById('novena-continue');
  const open = document.getElementById('novena-open');
  if (!line || !cont || !open) return;
  // 資料可能還沒載入：載入後再畫一次
  if (!data) { load().then(() => renderNovenaHome(), () => {}); return; }
  const acts = activeRuns();
  if (acts.length === 1) {
    const [act] = acts;
    line.textContent = '';
    line.append(...runLine(act));
    cont.hidden = false;
    cont.textContent = `念第${CN[nextDay(act.run) - 1]}天`;
    return;
  }
  // 兩個以上：每一個各一行，按鈕改成去目錄選
  if (acts.length > 1) {
    line.textContent = '';
    for (const act of acts) {
      const row = el('span', 'nov-home-run');
      row.append(...runLine(act));
      line.append(row);
    }
    cont.hidden = false;
    cont.textContent = '繼續念';
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
  // 念某一天時螢幕不熄（照設定裡「祈禱時保持螢幕不熄」）；回到目錄或列表就放掉
  if (shown.screen === 'day') requestWake(); else releaseWake();
}

/* 插圖：和念經時的聖像同一套。自訂的優先（可以好幾張），選了「不用」就沒有圖，
   沒設定就是內建的那張。app.js 不在時（不會發生，以防萬一）只用內建的。 */
function picsFor(nov) {
  if (typeof slotPick === 'function') return slotPick(picKey(nov));
  const list = nov.picture ? [{ file: nov.picture.file, caption: nov.picture.caption }] : [];
  return { list, all: list };
}

// 小圖（列表的卡片、每一天的標題旁）：好幾張時第 i 張，九天就輪流用；圖檔讀不到就拿掉
function picImg(nov, cls, i = 0) {
  const { list } = picsFor(nov);
  if (!list.length) return null;
  const p = list[i % list.length];
  const img = document.createElement('img');
  img.className = cls;
  img.src = p.file;
  img.alt = '';
  img.decoding = 'async';
  img.addEventListener('error', () => img.remove());
  return img;
}

// 大圖（九日敬禮的頁面頂端）：好幾張就輪播，下面有「換圖」，和念經時一樣
let hero = null;              // { img, cap }：換了圖時就地更新，不整頁重畫
function paintHero(host, nov) {
  const plate = el('figure', 'plate nov-plate');
  const car = el('div', 'car');
  const slide = el('div', 'slide');
  const img = document.createElement('img');
  img.alt = '';
  slide.append(img);
  car.append(slide);
  const cap = el('figcaption');
  plate.append(car, cap);
  host.append(plate);
  hero = { img, cap };
  if (typeof showPictures === 'function') { showPictures(img, cap, picsFor(nov)); return; }
  const { list } = picsFor(nov);
  if (!list.length) { plate.hidden = true; return; }
  img.src = list[0].file;
  img.addEventListener('error', () => plate.remove());
  cap.textContent = list[0].caption || '';
}

// 圖換了（加圖、不用、還原、換組、固定一張）：看得見的那幾張跟著換
function novenaPictures() {
  if (!shown || !data) return;
  const nov = shown.screen === 'list' ? null : findNovena(shown.id);
  if (nov && shown.screen === 'novena' && hero && hero.img.isConnected && typeof showPictures === 'function') {
    showPictures(hero.img, hero.cap, picsFor(nov));
  } else {
    paint(true);
  }
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
    const text = el('span', 'nov-card-text');
    text.append(el('span', 'nov-card-name', nov.name), el('span', 'nov-card-sub', nov.sub), el('span', 'nov-card-status', status));
    const pic = picImg(nov, 'nov-card-pic');
    if (pic) b.append(pic);
    b.append(text);
    list.append(b);
  }
  host.append(list);
}

/* 一個九日敬禮：進度、為誰祈禱、九天的目錄、完成的紀錄 */
function paintNovena(host, nov) {
  const s = readStore();
  const run = s.runs[nov.id] || null;
  paintHero(host, nov);
  host.append(el('h2', 'nov-title', nov.name), el('p', 'nov-sub', nov.sub));

  if (run) {
    const status = el('div', 'nov-status');
    status.append(el('p', 'nov-progress', `已念 ${doneCount(run)} / 9 天 · ${shortDate(run.start)}開始`));
    if (nov.track === 'candles') {
      status.append(candleRow(run));
    } else {
      const dots = el('div', 'nov-dots');
      dots.setAttribute('aria-hidden', 'true');
      for (let n = 1; n <= 9; n++) dots.append(el('span', run.days[String(n)] ? 'nov-dot on' : 'nov-dot'));
      status.append(dots);
    }
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

  // 還沒開始的蠟燭：九支都沒點亮，就在「開始」的上面
  if (!run && nov.track === 'candles') {
    host.append(candleRow(null), el('p', 'nov-candle-hint', '每念完一天，點亮一支蠟燭'));
  }

  const next = nextDay(run);
  const goBtn = btn(run ?`念第${CN[next - 1]}天` : '開始：念第一天', 'btn btn-primary btn-block nov-go',
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

/* 某一天：主題、每天開始的共同部分、今天的標題、問題、煉靈的回答與懇求、今天的經文、結尾的祈禱，以及念完的按鈕 */
function paintDay(host, nov, n) {
  const s = readStore();
  const run = s.runs[nov.id] || null;
  const day = nov.days[n - 1];
  const doneOn = run ? run.days[String(n)] : null;
  const intent = s.intent[nov.id] || '';

  const head = el('div', 'nov-day-head');
  const pic = picImg(nov, 'nov-day-pic', n - 1);
  if (pic) head.append(pic);
  const headText = el('div', 'nov-day-head-text');
  headText.append(el('p', 'nov-crumb', nov.name), el('h2', 'nov-day-title', `第${CN[n - 1]}天`));
  if (day.theme) headText.append(el('p', 'nov-theme', day.theme));
  head.append(headText);
  host.append(head);
  if (intent) host.append(el('p', 'nov-for', `為：${intent}`));

  for (const c of nov.open) for (const node of blockEl(c)) host.append(node);
  // 共同的開始部分之後，標出今天自己的部分從這裡開始
  if (nov.open.length && (day.theme || day.text.length || day.answer.length)) {
    host.append(el('h3', 'nov-part nov-part-day', day.theme ? `第${CN[n - 1]}天 · ${day.theme}` : `第${CN[n - 1]}天`));
  }

  if (nov.question) host.append(el('p', 'nov-q', nov.question));

  const ans = el('div', 'nov-answer');
  for (const t of day.answer) ans.append(el('p', null, t));
  host.append(ans);

  if (day.appeal.length) {
    const ap = el('div', 'nov-appeal');
    for (const t of day.appeal) ap.append(el('p', null, t));
    host.append(ap);
  }

  if (day.text.length) {
    const tx = el('div', 'nov-text');
    for (const t of day.text) tx.append(el('p', null, t));
    host.append(tx);
  }

  for (const c of nov.close) for (const node of blockEl(c)) host.append(node);

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

// 文字可以是一段字串，也可以是多段的陣列
const paras = (v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? strs(v) : []);

// 開始與結尾的每一項：小標題、經文段落、祈禱（金框）、啟應的一句、一句短句、或要念的經（可展開看經文）
function blockEl(c) {
  if (c.kind === 'title') return [el('h3', 'nov-part', str(c.text))];
  if (c.kind === 'text') {
    const d = el('div', 'nov-text');
    for (const t of paras(c.text)) d.append(el('p', null, t));
    return [d];
  }
  if (c.kind === 'prayer') {
    const q = el('blockquote', 'nov-prayer');
    if (c.label) q.append(el('span', 'nov-prayer-label', c.label));
    for (const t of paras(c.text)) q.append(el('p', null, t));
    return [q];
  }
  if (c.kind === 'say') {
    const p = el('p', 'nov-say');
    p.append(el('span', 'nov-who', str(c.who)), el('span', 'nov-say-text', str(c.text)));
    return [p];
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
      const acts = activeRuns();
      // 只有一個就直接到那一天；有好幾個就到目錄去選
      if (acts.length === 1) nav({ screen: 'day', id: acts[0].nov.id, n: nextDay(acts[0].run) }, false);
      else if (acts.length > 1) nav({ screen: 'list' }, false);
    }).catch(() => toast('無法載入九日敬禮的資料'));
  });
  document.getElementById('novena-open').addEventListener('click', () => nav({ screen: 'list' }, false));
  document.getElementById('novena-back').addEventListener('click', () => history.back());
  // 切到別的程式再回來，系統會收回螢幕不熄：還在某一天的畫面就再要一次
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && current === 'novena' && shown && shown.screen === 'day') requestWake();
  });
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

Object.assign(window, { novenaShow, renderNovenaHome, novenaExport, novenaImport, novenaReady, novenaPictures });
start();
})();
