/* 修和聖事：辦告解前的準備（步驟、省察）、告解室裡照著念的次序（告明時），
   以及上次告解的日期。內容在 data/confession.json；日期存在 mercy.confession.v1，
   省察的勾選與自己寫的內容存在 mercy.examen.v1。兩者都只在本機，不放進備份。
   與祈禱、讀經各自獨立。整份包在函式裡，只把 app.js 會呼叫的幾個名稱放到全域。 */
(() => {
'use strict';

const K_CONF = 'mercy.confession.v1';
const K_EXAM = 'mercy.examen.v1';
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 864e5;
const TABS = [['steps', '步驟'], ['exam', '省察'], ['rite', '告明時']];
const WHO = { penitent: '懺悔者', priest: '神父', both: '一起' };
const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const EXAM_NOTE = '三式從不同角度查考，可只用一式，也可混用；勾選的項目會在告明時第 3 步列出。勾選只存在這部手機，不放進備份。';
const TICK_KEY = /^[\w-]{1,40}\/[\w-]{1,60}\/\d{1,3}$/;

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
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(K_CONF) || 'null'); } catch { raw = null; }
  const list = raw && Array.isArray(raw.dates) ? raw.dates.filter(isDay) : [];
  return [...new Set(list)].sort();
}
let dates = readDates();
const persist = () => store.write(K_CONF, { dates });
const lastDate = () => (dates.length ? dates[dates.length - 1] : null);

/* ── 省察的勾選（localStorage） ───────────────────── */
// ticks: { "<examId>/<sectionId>/<index>": 次數 1..99 }；讀寫都包在 try 裡，壞掉就當作沒有
function readExamen() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(K_EXAM) || 'null'); } catch { raw = null; }
  const ticks = {};
  if (raw && raw.ticks && typeof raw.ticks === 'object') {
    for (const [k, v] of Object.entries(raw.ticks)) {
      if (TICK_KEY.test(k) && Number.isInteger(v) && v >= 1 && v <= 99) ticks[k] = v;
    }
  }
  const note = raw && typeof raw.note === 'string' ? raw.note.slice(0, 2000) : '';
  return { ticks, note };
}
let examen = readExamen();
function saveExamen() {
  try {
    localStorage.setItem(K_EXAM, JSON.stringify(examen));
    return true;
  } catch {
    toast('無法儲存，手機儲存空間可能已滿');
    return false;
  }
}
const hasExamen = () => Object.keys(examen.ticks).length > 0 || examen.note.length > 0;
function clearExamen() {
  examen = { ticks: {}, note: '' };
  saveExamen();
}
const keyOf = (ex, sec, i) => `${ex.id}/${sec.id}/${i}`;

// 三式各自的展開狀態，重畫時保留（重新載入後回到全部收起）
const secOpen = new Set();
let decOpen = false;

/* ── 備份 ─────────────────────────────────────────── */
// 備份：只有日期，省察的勾選不在備份裡
function confessionExport() {
  return dates.length ? { dates: [...dates] } : null;
}

// 備份檔裡的日期併進來：逐筆檢查，已有的不重複加；不碰省察的勾選
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

// 有變動：首頁的一行字一定更新；正在看這一頁的話，重畫一次（捲動位置不變）
function refresh() {
  renderConfessionHome();
  if (current === 'confession' && shown && data) paint(shown, true);
}

/* ── 載入 ─────────────────────────────────────────── */
let data = null;              // 載入後的 { steps, rite, acts, actDefault, exams, decalogue }
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
    actDefault: Number.isInteger(raw.actDefault) ? raw.actDefault : 0,
    exams: Array.isArray(raw.exams) ? raw.exams.filter((e) => e && Array.isArray(e.parts)) : [],
    decalogue: raw.decalogue && Array.isArray(raw.decalogue.groups) ? raw.decalogue : null,
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

// focusSel：重畫後要回到焦點的元素（勾選或加減次數之後，手指不會失去位置）
function paint(st, keepY, focusSel) {
  const y = keepY ? window.scrollY : 0;
  const host = bodyEl();
  host.textContent = '';
  host.append(tabsRow(st.tab));
  const panel = el('div', 'conf-panel');
  host.append(panel);
  if (st.tab === 'rite') paintRite(panel);
  else if (st.tab === 'exam') paintExam(panel);
  else paintSteps(panel);
  window.scrollTo(0, y);
  if (focusSel) {
    const n = host.querySelector(focusSel);
    if (n) n.focus({ preventScroll: true });
  }
}

function tabsRow(tab) {
  const row = el('div', 'conf-tabs');
  row.setAttribute('role', 'tablist');
  row.style.setProperty('--n', TABS.length);
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
    if (s.id === 'examine') body.append(btn('開始省察', 'btn btn-tiny conf-go', () => nav({ tab: 'exam' }, true)));
    if (s.rite) body.append(btn('告明時的步驟', 'btn btn-tiny conf-go', () => nav({ tab: 'rite' }, true)));
    d.append(sum, body);
    panel.append(d);
  });
}

/* ── 省察 ─────────────────────────────────────────── */
// 三式之中選哪一式，記在設定裡（settings.examForm）；沒有或找不到就用第一式
function formId() {
  const ids = data.exams.map((e) => e.id);
  return ids.includes(settings.examForm) ? settings.examForm : ids[0];
}

function paintExam(panel) {
  if (!data.exams.length) { panel.append(el('p', 'empty', '省察的內容尚未載入。')); return; }
  const cur = data.exams.find((e) => e.id === formId()) || data.exams[0];

  const row = el('div', 'cx-forms');
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', '選一式省察');
  for (const ex of data.exams) {
    const b = btn('', 'cx-form', () => {
      settings.examForm = ex.id;
      saveSettings();
      paint(shown, true);
    });
    b.append(el('span', 'cx-form-name', ex.name), el('span', 'cx-form-sub', ex.sub || ''));
    b.setAttribute('aria-pressed', String(ex.id === cur.id));
    row.append(b);
  }
  panel.append(row);
  if (cur.angle) panel.append(el('p', 'cx-angle', cur.angle));
  panel.append(el('p', 'hint cx-explain', EXAM_NOTE));
  for (const t of cur.intro || []) panel.append(el('p', 'cx-intro', t));
  if (cur.id === 'one' && data.decalogue) panel.append(decalogueEl());
  for (const part of cur.parts) panel.append(partEl(cur, part));
  panel.append(noteEl(), clearBtn());
}

// 天主十誡：參考用，兩組的條文連續編號 1–10
function decalogueEl() {
  const d = document.createElement('details');
  d.className = 'th-group cx-dec';
  d.open = decOpen;
  d.addEventListener('toggle', () => { decOpen = d.open; });
  const sum = document.createElement('summary');
  sum.append(data.decalogue.title || '天主十誡');
  d.append(sum);
  const body = el('div', 'cx-dec-body');
  let n = 0;
  for (const g of data.decalogue.groups) {
    body.append(el('p', 'cx-dec-head', g.head));
    const ol = el('ol', 'cx-dec-lines');
    ol.start = n + 1;
    for (const line of g.lines) { ol.append(el('li', null, line)); n++; }
    body.append(ol);
  }
  if (data.decalogue.end) body.append(el('p', 'cx-dec-end', data.decalogue.end));
  d.append(body);
  return d;
}

function partEl(ex, part) {
  const wrap = el('section', 'cx-part');
  wrap.append(el('h3', 'cx-part-title', part.title));
  for (const sec of part.sections) wrap.append(sectionEl(ex, part, sec));
  if (part.end) wrap.append(el('p', 'cx-part-end', part.end));
  return wrap;
}

// 款目：卡片（與步驟同樣式），摘要是題目加法律條文，有勾的話顯示已勾幾項
function sectionEl(ex, part, sec) {
  const frag = el('div', 'cx-sec-wrap');
  if (sec.before) frag.append(el('p', 'cx-before', sec.before));
  const id = `${ex.id}/${sec.id}`;
  const d = document.createElement('details');
  d.className = 'th-group cx-sec';
  d.dataset.sec = id;
  d.open = secOpen.has(id);
  d.addEventListener('toggle', () => { if (d.open) secOpen.add(id); else secOpen.delete(id); });
  const sum = document.createElement('summary');
  sum.className = 'cx-sum';
  const head = el('span', 'cx-sum-head');
  head.append(el('span', 'cx-sum-title', sec.title));
  if (sec.law) head.append(el('span', 'cx-sum-law', `　${sec.law}`));
  sum.append(head);
  const items = sec.items || [];
  const ticked = items.filter((_, i) => examen.ticks[keyOf(ex, sec, i)]).length;
  if (ticked) sum.append(el('small', 'cx-count', `已勾 ${ticked}`));
  d.append(sum);
  const ul = el('ul', 'cx-items');
  items.forEach((text, i) => ul.append(itemEl(ex, sec, text, i)));
  d.append(ul);
  frag.append(d);
  return frag;
}

// 一條款目：勾選鈕（role=checkbox）；勾了之後出現 − n + 的次數
function itemEl(ex, sec, text, i) {
  const key = keyOf(ex, sec, i);
  const n = examen.ticks[key] || 0;
  const li = el('li', 'cx-row');
  const cb = document.createElement('button');
  cb.type = 'button';
  cb.className = 'cx-check';
  cb.setAttribute('role', 'checkbox');
  cb.setAttribute('aria-checked', String(n > 0));
  cb.dataset.key = key;
  cb.append(el('span', 'cx-box', n ? '✓' : ''), el('span', 'cx-text', text));
  if (n > 1) cb.append(el('span', 'cx-x', `×${n}`));
  cb.addEventListener('click', () => tick(key));
  li.append(cb);
  if (n) {
    const st = el('span', 'cx-step');
    st.setAttribute('role', 'group');
    st.setAttribute('aria-label', '次數');
    const minus = btn('−', 'cx-minus', () => bump(key, -1));
    minus.dataset.key = key;
    minus.dataset.act = 'minus';
    minus.setAttribute('aria-label', '減一次');
    const plus = btn('+', 'cx-plus', () => bump(key, 1));
    plus.dataset.key = key;
    plus.dataset.act = 'plus';
    plus.setAttribute('aria-label', '加一次');
    st.append(minus, el('span', 'cx-n', String(n)), plus);
    li.append(st);
  }
  return li;
}

function tick(key) {
  if (examen.ticks[key]) delete examen.ticks[key]; else examen.ticks[key] = 1;
  saveExamen();
  paint(shown, true, `[role="checkbox"][data-key="${key}"]`);
}

// 次數 1..99；減到 1 就不再減（要拿掉請點勾選）
function bump(key, d) {
  const n = examen.ticks[key];
  if (!n) return;
  const next = Math.min(99, Math.max(1, n + d));
  if (next === n) return;
  examen.ticks[key] = next;
  saveExamen();
  paint(shown, true, `[data-key="${key}"][data-act="${d > 0 ? 'plus' : 'minus'}"]`);
}

function noteEl() {
  const box = el('div', 'cx-note');
  const label = el('label', 'cx-note-label');
  label.append(el('span', 'cx-note-title', '其他（自己寫）'));
  const ta = document.createElement('textarea');
  ta.id = 'cx-note';
  ta.rows = 4;
  ta.maxLength = 2000;
  ta.value = examen.note;
  ta.addEventListener('input', () => { examen.note = ta.value; saveExamen(); });
  label.append(ta);
  box.append(label);
  return box;
}

function clearBtn() {
  const b = btn('清除勾選', 'btn btn-quiet btn-block', () => {
    if (!confirm('清除所有勾選和自己寫的內容？')) return;
    clearExamen();
    refresh();
    toast('已清除');
  });
  b.id = 'cx-clear';
  return b;
}

// 所有勾選，依三式、款目、條目的次序；來源如「第一式 · 第一誡」
function ticked() {
  const out = [];
  for (const ex of data.exams) {
    for (const part of ex.parts) {
      for (const sec of part.sections) {
        (sec.items || []).forEach((text, i) => {
          const n = examen.ticks[keyOf(ex, sec, i)];
          if (!n) return;
          const sub = /^（/.test(sec.title) ? `${part.title} ${sec.title}` : sec.title;
          out.push({ text, n, src: `${ex.name} · ${sub}` });
        });
      }
    }
  }
  return out;
}

// 告明時第 3 步下面的「我的省察」；什麼都沒有就不顯示
function mineEl() {
  const items = ticked();
  const note = examen.note.trim() ? examen.note : '';
  if (!items.length && !note) return null;
  const box = el('div', 'cx-mine');
  box.append(el('p', 'cx-mine-title', '我的省察'));
  if (items.length) {
    const ul = el('ul', 'cx-mine-list');
    for (const t of items) {
      const li = el('li', 'cx-mine-item');
      li.append(el('span', 'cx-mine-text', t.text));
      if (t.n > 1) li.append(el('span', 'cx-mine-x', `×${t.n}`));
      li.append(el('span', 'cx-mine-src', t.src));
      ul.append(li);
    }
    box.append(ul);
  }
  if (note) box.append(el('p', 'cx-mine-note', note));
  box.append(btn('去省察', 'conf-link', () => nav({ tab: 'exam' }, true)));
  return box;
}

/* ── 告明時 ───────────────────────────────────────── */
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
    if (r.fill === 'since') {
      if (last) li.append(el('p', 'conf-fill', sinceText(last)));
      const mine = mineEl();
      if (mine) li.append(mine);
    }
    if (r.prayer === 'act' && data.acts.length) li.append(actBlock());
    ol.append(li);
  }
  panel.append(ol, recordBlock());
}

function actIndex() {
  const n = settings.actOfContrition;
  if (Number.isInteger(n) && n >= 0 && n < data.acts.length) return n;
  const d = data.actDefault;
  return Number.isInteger(d) && d >= 0 && d < data.acts.length ? d : 0;
}

// 痛悔經：有好幾式就列出一至六的小按鈕，預設用 actDefault；每一行各自成段
function actBlock() {
  const wrap = el('div', 'conf-act-wrap');
  const idx = actIndex();
  if (data.acts.length > 1) {
    const row = el('div', 'conf-acts');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', '選一式痛悔經');
    data.acts.forEach((a, n) => {
      const b = btn(CN[n] || String(n + 1), 'conf-act-btn', () => {
        settings.actOfContrition = n;
        saveSettings();
        paint(shown, true);
      });
      b.setAttribute('aria-label', a.title || `第${n + 1}式`);
      b.setAttribute('aria-pressed', String(n === idx));
      row.append(b);
    });
    wrap.append(row);
  }
  const act = data.acts[idx];
  wrap.append(el('p', 'conf-act-title', act.title || '痛悔經'));
  const q = el('blockquote', 'conf-quote key');
  q.dataset.who = 'penitent';
  for (const line of act.text.split('\n')) if (line.trim()) q.append(el('p', null, line));
  wrap.append(q);
  return wrap;
}

// 最下面：今天已辦告解，以及已記下的日期（可移除）
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
  if (dates.includes(today)) {
    toast('今天已記下過了');
    // 日期已記過，但若還有勾選或自己寫的內容，仍可在此清除
    if (hasExamen() && confirm('清除所有勾選和自己寫的內容？')) {
      clearExamen();
      refresh();
      toast('已清除');
    }
    return;
  }
  if (!confirm('記下今天辦了告解？省察的勾選和自己寫的內容會一併清除。')) return;
  dates = [...dates, today].sort();
  persist();
  clearExamen();
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
