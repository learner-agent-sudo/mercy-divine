/* 修和聖事：辦告解前的準備（步驟）、告解室裡照著念的次序（告明時），
   以及上次告解的日期。內容在 data/confession.json，日期只存在本機（mercy.confession.v1）。
   與祈禱、讀經各自獨立。整份包在函式裡，只把 app.js 會呼叫的幾個名稱放到全域。 */
(() => {
'use strict';

const K_CONF = 'mercy.confession.v1';
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 864e5;
const TABS = [['steps', '步驟'], ['rite', '告明時']];
const WHO = { penitent: '懺悔者', priest: '神父', both: '一起' };

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
// 距今多久：不到兩週說幾天，不到九週說幾週，其餘說幾個月
function ago(key) {
  const days = Math.round((utcOf(todayKey()) - utcOf(key)) / DAY_MS);
  if (days <= 0) return '今天';
  if (days < 14) return `${days} 天前`;
  if (days < 63) return `${Math.floor(days / 7)} 週前`;
  return `${Math.floor(days / 30.44)} 個月前`;
}
const sinceText = (last) => {
  const t = ago(last);
  return `上次告解：${fullDate(last)}，${t === '今天' ? t : `約 ${t}`}`;
};
function btn(text, cls, fn) {
  const b = el('button', cls, text);
  b.type = 'button';
  if (fn) b.addEventListener('click', fn);
  return b;
}
const bodyEl = () => document.getElementById('confession-body');

/* ── 日期（localStorage） ─────────────────────────── */
// 只收格式對、真有那一天、不是未來的日期；排序、不重複
function readDates() {
  const raw = store.read(K_CONF, null);
  const list = raw && Array.isArray(raw.dates) ? raw.dates.filter(isDay) : [];
  return [...new Set(list)].sort();
}
let dates = readDates();
const persist = () => store.write(K_CONF, { dates });
const lastDate = () => (dates.length ? dates[dates.length - 1] : null);

// 備份：有日期才交出去
function confessionExport() {
  return dates.length ? { dates: [...dates] } : null;
}

// 備份檔裡的日期併進來：逐筆檢查，已有的不重複加
function confessionImport(raw) {
  const added = { dates: 0 };
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.dates)) return added;
  const have = new Set(dates);
  for (const d of raw.dates.slice(0, 5000)) {
    if (!isDay(d) || have.has(d)) continue;
    have.add(d);
    added.dates++;
  }
  if (added.dates) { dates = [...have].sort(); persist(); refresh(); }
  return added;
}

/* ── 首頁的卡片 ───────────────────────────────────── */
function renderConfessionHome() {
  const line = document.getElementById('confession-home-line');
  if (!line) return;
  const last = lastDate();
  line.textContent = last ? `上次告解：${shortDate(last)}（${ago(last)}）` : '辦告解前的準備與步驟';
}

// 日期有變：首頁的一行字一定更新；正在看這一頁的話，重畫一次（捲動位置不變）
function refresh() {
  renderConfessionHome();
  if (current === 'confession' && shown && data) paint(shown, true);
}

/* ── 載入 ─────────────────────────────────────────── */
let data = null;              // 載入後的 { steps, rite, acts }
let loadPromise = null;

// 單檔預覽版把資料嵌在頁面裡；正式版用 fetch 讀 data/confession.json
async function fetchData() {
  let packed = null;
  try { packed = inlineJSON('data-confession'); } catch { packed = null; }
  if (packed) return packed;
  const r = await fetch('data/confession.json');
  if (!r.ok) throw new Error('data/confession.json');
  return r.json();
}

function build(raw) {
  if (!raw || !Array.isArray(raw.steps) || !Array.isArray(raw.rite)) throw new Error('修和聖事資料格式不符');
  data = {
    steps: raw.steps,
    rite: raw.rite,
    acts: Array.isArray(raw.acts) ? raw.acts.filter((a) => a && typeof a.text === 'string') : [],
  };
  return data;
}

function load() {
  if (!loadPromise) {
    loadPromise = fetchData().then(build).catch((e) => { loadPromise = null; throw e; });
  }
  return loadPromise;
}

/* ── 換畫面 ───────────────────────────────────────── */
let shown = null;             // 目前畫面的參數 { tab }
let renderToken = 0;

// 往裡走：加一筆歷史，返回鍵就能退出來。換分頁用 replace，返回鍵直接退回首頁。
function nav(st, replace) {
  const entry = { view: 'confession', confession: st };
  if (replace) history.replaceState(entry, ''); else history.pushState(entry, '');
  confessionShow(st);
}

function confessionShow(st) {
  const tab = st && TABS.some(([id]) => id === st.tab) ? st.tab : 'steps';
  shown = { tab };
  if (current !== 'confession') go('confession');
  const token = ++renderToken;
  if (data) { paint(shown); return; }
  const host = bodyEl();
  host.textContent = '';
  host.append(el('p', 'empty', '載入中⋯'));
  load().then(
    () => { if (token === renderToken) paint(shown); },
    () => {
      if (token !== renderToken) return;
      host.textContent = '';
      host.append(el('p', 'empty', '無法載入修和聖事的資料檔案。'), btn('再試一次', 'btn btn-block', () => confessionShow(shown)));
    },
  );
}

function paint(st, keepY) {
  const y = keepY ? window.scrollY : 0;
  const host = bodyEl();
  host.textContent = '';
  host.append(tabsRow(st.tab));
  const panel = el('div', 'conf-panel');
  host.append(panel);
  if (st.tab === 'rite') paintRite(panel); else paintSteps(panel);
  window.scrollTo(0, y);
}

function tabsRow(tab) {
  const row = el('div', 'conf-tabs');
  row.setAttribute('role', 'tablist');
  for (const [id, label] of TABS) {
    const b = btn(label, 'conf-tab', () => { if (shown.tab !== id) nav({ tab: id }, true); });
    b.dataset.tab = id;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(id === tab));
    row.append(b);
  }
  return row;
}

/* 步驟：六張卡片，一開始都收起來 */
function paintSteps(panel) {
  panel.append(el('p', 'hint', '點開每一步，看要點。告解室裡照著念的，在「告明時」。'));
  data.steps.forEach((s, i) => {
    const d = document.createElement('details');
    d.className = 'th-group tl-group conf-step';
    d.dataset.step = s.id;
    const sum = document.createElement('summary');
    sum.className = 'tl-phase conf-sum';
    const head = el('span', 'conf-head');
    head.append(el('span', 'conf-name', `${i + 1} ${s.name}`));
    if (s.lead) head.append(el('span', 'conf-lead', s.lead));
    sum.append(head);
    const body = el('div', 'conf-body');
    if (s.points && s.points.length) {
      const ul = el('ul', 'conf-points');
      for (const p of s.points) ul.append(el('li', null, p));
      body.append(ul);
    }
    if (s.rite) body.append(btn('告明時的步驟', 'btn btn-tiny conf-go', () => nav({ tab: 'rite' }, true)));
    d.append(sum, body);
    panel.append(d);
  });
}

/* 告明時：十個步驟照次序念。懺悔者的話有金線，神父的話是一般的字。 */
function paintRite(panel) {
  panel.append(el('p', 'hint', '在告解室裡照著念。有金線的是懺悔者要說的話；神父的話是一般的字。'));
  const ol = el('ol', 'conf-rite');
  for (const r of data.rite) {
    const li = el('li', 'conf-line');
    li.dataset.who = r.who;
    li.append(el('span', `conf-role conf-role-${r.who}`, WHO[r.who] || ''));
    li.append(el('p', 'conf-do', r.do));
    if (r.say) {
      const q = el('blockquote', r.who === 'penitent' ? 'conf-quote key' : 'conf-quote', r.say);
      q.dataset.who = r.who;
      li.append(q);
    }
    const last = lastDate();
    if (r.fill === 'since' && last) li.append(el('p', 'conf-fill', sinceText(last)));
    if (r.prayer === 'act' && data.acts.length) li.append(actBlock());
    ol.append(li);
  }
  panel.append(ol, recordBlock());
}

function actIndex() {
  const n = settings.actOfContrition;
  return Number.isInteger(n) && n >= 0 && n < data.acts.length ? n : 0;
}

// 痛悔經：只有一式時直接顯示；有好幾式就列出按鈕，選的那一式記在設定裡
function actBlock() {
  const wrap = el('div', 'conf-act-wrap');
  const idx = actIndex();
  if (data.acts.length > 1) {
    const row = el('div', 'conf-acts');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', '選一式痛悔經');
    data.acts.forEach((a, n) => {
      const b = btn(a.title || `第${n + 1}式`, 'conf-act-btn', () => {
        settings.actOfContrition = n;
        saveSettings();
        paint(shown, true);
      });
      b.setAttribute('aria-pressed', String(n === idx));
      row.append(b);
    });
    wrap.append(row);
  }
  const act = data.acts[idx];
  wrap.append(el('p', 'conf-act-title', act.title || '痛悔經'));
  const q = el('blockquote', 'conf-quote key', act.text);
  q.dataset.who = 'penitent';
  wrap.append(q);
  return wrap;
}

// 最下面：記下今天，以及已記下的日期（可移除）
function recordBlock() {
  const box = el('div', 'conf-record');
  const today = btn('今天已辦告解', 'btn btn-primary btn-block', recordToday);
  today.id = 'conf-today';
  box.append(today);
  const line = el('p', 'conf-dates');
  if (!dates.length) {
    line.textContent = '還沒有記下過告解。';
  } else {
    line.append('已記下：');
    [...dates].reverse().forEach((d, n) => {
      if (n) line.append('、');
      line.append(el('span', null, fullDate(d)));
      const rm = btn('移除', 'conf-rm', () => removeDate(d));
      rm.setAttribute('aria-label', `移除 ${fullDate(d)}`);
      line.append(' ', rm);
    });
  }
  box.append(line);
  return box;
}

function recordToday() {
  const today = todayKey();
  if (dates.includes(today)) { toast('今天已記下過了'); return; }
  if (!confirm('記下今天辦了告解？')) return;
  dates = [...dates, today].sort();
  persist();
  refresh();
  toast('已記下今天的告解');
}

function removeDate(d) {
  if (!confirm(`移除 ${fullDate(d)} 的記錄？`)) return;
  dates = dates.filter((x) => x !== d);
  persist();
  refresh();
  toast('已移除');
}

/* ── 啟動 ─────────────────────────────────────────── */
function start() {
  document.getElementById('confession-steps').addEventListener('click', () => nav({ tab: 'steps' }, false));
  document.getElementById('confession-rite').addEventListener('click', () => nav({ tab: 'rite' }, false));
  document.getElementById('confession-back').addEventListener('click', () => history.back());
  renderConfessionHome();
  // 重新載入時歷史紀錄停在這裡：app.js 的 init 會接手；若 init 比這裡先跑完，就等 app 顯示後再接手
  if (history.state && history.state.confession) {
    const wait = () => {
      if (document.getElementById('app').hidden) setTimeout(wait, 50);
      else confessionShow(history.state.confession);
    };
    wait();
  }
}

Object.assign(window, { confessionShow, renderConfessionHome, confessionExport, confessionImport });
start();
})();
