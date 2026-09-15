/* 救主慈悲串經 — 離線誦念與紀錄
   資料只存在本機，不會上傳。經文內容見 data/prayers.json。 */
'use strict';

const K_RECORDS = 'mercy.records.v1';
const K_SETTINGS = 'mercy.settings.v1';
const CN_NUM = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/* ── 儲存 ─────────────────────────────────────────── */
const store = {
  read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  },
  write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      toast('無法儲存，手機儲存空間可能已滿');
      return false;
    }
  },
};

const DEFAULTS = { mode: 'guided', font: 100, theme: 'auto', wake: true, haptic: true, hapticStrength: 'strong', pictures: {} };

// 可在程式內指定聖像的九個位置。
const IMAGE_SLOTS = [
  ['home', '首頁'],
  ['our-father', '天主經'],
  ['hail-mary', '聖母經'],
  ['creed', '信經'],
  ['eternal-father', '大珠'],
  ['passion', '小珠'],
  ['holy-god', '結束祈禱'],
  ['jesus-king', '信賴禱詞'],
  ['done', '誦畢'],
];
let settings = { ...DEFAULTS, ...store.read(K_SETTINGS, {}) };
let records = store.read(K_RECORDS, []);

const saveSettings = () => store.write(K_SETTINGS, settings);
const saveRecords = () => store.write(K_RECORDS, records);
const newId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/* ── 日期 ─────────────────────────────────────────── */
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtFullDate = (d) =>
  d.toLocaleDateString('zh-Hant', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
const fmtTime = (d) => d.toLocaleTimeString('zh-Hant', { hour: 'numeric', minute: '2-digit' });
const fmtDuration = (s) => (s < 60 ? `${s} 秒` : `${Math.floor(s / 60)} 分${s % 60 ? ` ${s % 60} 秒` : ''}`);

function dayCounts() {
  const m = new Map();
  for (const r of records) {
    const k = dayKey(new Date(r.ts));
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

function streak() {
  const days = dayCounts();
  if (!days.size) return 0;
  const cursor = new Date();
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(cursor))) {
    n++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return n;
}

/* ── 內容 ─────────────────────────────────────────── */
let PRAYERS = null;
let IMAGES = [];
let STEPS = [];

function buildSteps(p) {
  const steps = [];
  for (const item of p.opening) {
    steps.push({ kind: 'opening', id: item.id, name: item.name, text: item.text, stage: '開始' });
  }
  const { count, large, small } = p.decades;
  for (let d = 1; d <= count; d++) {
    const stage = `第${CN_NUM[d]}端`;
    steps.push({ kind: 'large', id: large.id, name: large.name, text: large.text, stage, decade: d, bead: 0 });
    for (let b = 1; b <= small.count; b++) {
      steps.push({ kind: 'small', id: small.id, name: small.name, text: small.text, stage, decade: d, bead: b });
    }
  }
  for (const item of p.closing) {
    for (let r = 1; r <= (item.repeat || 1); r++) {
      steps.push({ kind: 'closing', id: item.id, name: item.name, text: item.text, stage: '結束',
                   rep: r, of: item.repeat || 1 });
    }
  }
  return steps;
}

const imageAt = (i) => (IMAGES.length ? IMAGES[((i % IMAGES.length) + IMAGES.length) % IMAGES.length] : null);

// data/images.json 內的 for 欄位可把某張聖像指定給某段經文，
// 例如 "for": ["hail-mary"] 就會在唸聖母經時顯示。
// 另有 home（首頁）與 done（誦畢）兩個特別名稱。
// 同一段經文可登記多張，依清單順序遞補：排前面的檔案若不存在，
// 自動改用下一張，全部都取不到才收起圖框。
let imageRoles = new Map();
function buildImageRoles() {
  imageRoles = new Map();
  for (const image of IMAGES) {
    for (const role of image.for || []) {
      if (!imageRoles.has(role)) imageRoles.set(role, []);
      imageRoles.get(role).push(image);
    }
  }
}

// 取不到的檔案記下來，同一次使用中不再重試。
const failedImages = new Set();

function setImage(imgNode, capNode, candidates) {
  const list = [].concat(candidates || []).filter(Boolean);
  const plate = imgNode.closest('.plate');
  const show = (i) => {
    while (i < list.length && failedImages.has(list[i].file)) i++;
    if (i >= list.length) { if (plate) plate.hidden = true; return; }
    if (plate) plate.hidden = false;
    imgNode.onerror = () => { failedImages.add(list[i].file); show(i + 1); };
    imgNode.src = list[i].file;
    imgNode.alt = list[i].caption || '';
    if (capNode) capNode.textContent = list[i].caption || '';
  };
  show(0);
}

// 自訂聖像排最前面，其後才是 data/images.json 列出的圖片。
const rolesFor = (role) => {
  const listed = imageRoles.get(role) || [];
  const custom = customFor(role);
  return custom ? [custom, ...listed] : listed;
};

// 先找指定給這段經文的聖像；沒有指定就沿用依端數輪流的方式。
function imageForStep(step) {
  if (!IMAGES.length) return [];
  const matched = rolesFor(step.id);
  if (matched.length) return matched;
  if (step.kind === 'large' || step.kind === 'small') return [imageAt(step.decade - 1)]; // 第一端配第一張
  if (step.kind === 'closing') return [imageAt(IMAGES.length - 1)];
  return [imageAt(0)];
}

const imageForRole = (role, fallbackIndex) => {
  const matched = rolesFor(role);
  return matched.length ? matched : [imageAt(fallbackIndex)];
};

/* ── 畫面切換 ──────────────────────────────────────── */
const VIEWS = ['home', 'prayer', 'done', 'manual', 'history', 'settings'];
let current = 'home';

function go(name) {
  current = name;
  for (const v of VIEWS) $(`#view-${v}`).classList.toggle('active', v === name);
  if (name !== 'prayer') releaseWake();
  window.scrollTo(0, 0);
  const scroll = $('#prayer-scroll');
  if (name === 'prayer' && scroll) scroll.scrollTop = 0;
}

// 一端唸畢時在畫面中央短暫顯示，與底部的一般提示區隔開來。
let flashTimer;
function flash(text) {
  const node = $('#flash');
  node.textContent = text;
  node.hidden = false;
  node.classList.remove('show');
  void node.offsetWidth;          // 重新觸發動畫
  node.classList.add('show');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { node.hidden = true; node.classList.remove('show'); }, 1600);
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

/* ── 螢幕保持 ──────────────────────────────────────── */
let wakeSentinel = null;
async function requestWake() {
  if (!settings.wake || !('wakeLock' in navigator)) return;
  try { wakeSentinel = await navigator.wakeLock.request('screen'); } catch { /* 系統拒絕時忽略 */ }
}
function releaseWake() {
  if (wakeSentinel) { wakeSentinel.release().catch(() => {}); wakeSentinel = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && current === 'prayer') requestWake();
});

/* ── 祈禱流程 ──────────────────────────────────────── */
let session = null; // { startedAt, index, mode }

function startPrayer() {
  history.pushState({ view: 'prayer' }, '');
  session = { startedAt: Date.now(), index: 0, mode: settings.mode };
  buildFullText();
  applyMode();
  go('prayer');
  requestWake();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

function applyMode() {
  const guided = session.mode === 'guided';
  $('#guided').hidden = !guided;
  $('#full').hidden = guided;
  $('#mode-toggle').textContent = guided ? '全文' : '引導';
  $('#step-prev').hidden = !guided;
  $('#step-next').textContent = guided ? '下一步' : '我已誦畢';
  if (guided) renderStep();
  else {
    $('#prayer-stage').textContent = '救主慈悲串經';
    $('#progress-fill').style.width = '100%';
    setImage($('#full-image'), null, imageForRole('home', 0));
  }
}

function renderStep() {
  const step = STEPS[session.index];
  const last = session.index === STEPS.length - 1;

  $('#prayer-stage').textContent = step.stage;
  $('#step-name').textContent = step.name;
  $('#step-text').textContent = step.text;

  // 標題列已顯示第幾端，這裡只補上該端之內的位置。
  let count = '';
  if (step.kind === 'small') count = `第 ${step.bead} 珠，共 ${PRAYERS.decades.small.count} 珠`;
  else if (step.kind === 'large') count = `第 ${step.decade} 端，共 ${PRAYERS.decades.count} 端`;
  else if (step.kind === 'closing' && step.of > 1) count = `第 ${step.rep} 遍，共 ${step.of} 遍`;
  $('#step-count').textContent = count;

  renderBeads(step);
  setImage($('#guided-image'), null, imageForStep(step));

  const pct = (session.index / (STEPS.length - 1)) * 100;
  $('#progress-fill').style.width = `${pct}%`;
  $('.progress').setAttribute('aria-valuenow', Math.round(pct));

  $('#step-prev').disabled = session.index === 0;
  $('#step-next').textContent = last ? '我已誦畢' : '下一步';
  $('#tap-hint').textContent = last ? '輕觸畫面任一處完成' : '輕觸畫面任一處繼續';
  $('#prayer-scroll').scrollTop = 0;
}

// 珠子的位置圖：一端是大珠加十顆小珠；結束禱詞則畫出三遍的進度。
function renderBeads(step) {
  const wrap = $('#beads');
  wrap.textContent = '';
  const dots = (total, current, withLarge) => {
    if (withLarge) wrap.appendChild(makeBead('bead lg' + (current === 0 ? ' now' : ' on')));
    for (let i = 1; i <= total; i++) {
      wrap.appendChild(makeBead('bead' + (i < current ? ' on' : i === current ? ' now' : '')));
    }
  };
  if (step.kind === 'large' || step.kind === 'small') dots(PRAYERS.decades.small.count, step.bead, true);
  else if (step.kind === 'closing' && step.of > 1) dots(step.of, step.rep, false);
}
const makeBead = (cls) => el('span', cls);

// 震動語彙：閉著眼睛唸經時，這是唯一能知道「數到哪裡」的訊號，
// 所以每一種節奏都要能分辨。太短的震動手機不會真的震，故最短 25 毫秒。
// 手機無法調整震動「強度」，只能給長度與節奏，所以：
// 想更明顯就拉長，想更好分辨就改變下數——人分辨「幾下」遠比分辨「多長」容易。
const BUZZ = {
  opening:    [35],                              // 開始的經文：一下輕
  bead:       [55],                              // 一顆小珠：一下
  lastBead:   [45, 70, 45],                      // 兩下 → 下一顆就是第十珠
  decade:     [70],                              // 新的一端開始：一下長
  decadeDone: [80, 90, 80, 90, 80],              // 三下 → 一端圓滿
  closing:    [55],                              // 結束禱詞的每一遍
  back:       [20],                              // 退回一步
  finish:     [100, 110, 100, 110, 100, 110, 240], // 四下 → 全部誦畢
};

// 各廠牌馬達差異很大，讓使用者自己調整倍率；只放大震動段，停頓維持原樣才不會走味。
const STRENGTH = { soft: 0.6, normal: 1, strong: 1.7 };

function buzz(pattern) {
  if (!settings.haptic || !navigator.vibrate) return;
  const k = STRENGTH[settings.hapticStrength] || 1;
  try { navigator.vibrate(pattern.map((ms, i) => (i % 2 === 0 ? Math.round(ms * k) : ms))); }
  catch { /* 系統不允許時忽略 */ }
}

// 依「剛離開哪一步」與「即將到哪一步」挑選節奏。
// 一端唸畢的訊號優先於其他，因為那是最需要察覺的轉折。
function buzzFor(prev, next) {
  if (!next) return BUZZ.finish;
  const perDecade = PRAYERS.decades.small.count;
  if (prev && prev.kind === 'small' && prev.bead === perDecade) return BUZZ.decadeDone;
  if (next.kind === 'large') return BUZZ.decade;
  if (next.kind === 'small') return next.bead === perDecade ? BUZZ.lastBead : BUZZ.bead;
  if (next.kind === 'closing') return BUZZ.closing;
  return BUZZ.opening;
}

function advance() {
  const last = session.index >= STEPS.length - 1;
  const prev = STEPS[session.index];
  buzz(buzzFor(prev, last ? null : STEPS[session.index + 1]));
  if (last) { finishPrayer(); return; }
  session.index++;
  renderStep();
  // 一端唸畢時明白顯示一下，睜眼時也看得出剛才過了一端
  if (prev.kind === 'small' && prev.bead === PRAYERS.decades.small.count) {
    flash(`${prev.stage} 圓滿`);
  }
}
function back() {
  buzz(BUZZ.back);
  if (session.index > 0) { session.index--; renderStep(); }
}

/* ── 全文模式 ──────────────────────────────────────── */
let fullBuilt = false;
function buildFullText() {
  if (fullBuilt) return;
  const body = $('#full-body');
  body.textContent = '';

  const section = (name, text, repLabel) => {
    const sec = el('div', 'full-sec');
    const h = el('h3');
    h.appendChild(document.createTextNode(name));
    if (repLabel) h.appendChild(el('span', 'rep', repLabel));
    sec.appendChild(h);
    sec.appendChild(el('p', 'prayer-text', text));
    return sec;
  };

  for (const item of PRAYERS.opening) body.appendChild(section(item.name, item.text, item.label));

  const { count, large, small } = PRAYERS.decades;
  for (let d = 1; d <= count; d++) {
    body.appendChild(el('div', 'full-divider', `✣ 第${CN_NUM[d]}端 ✣`));
    body.appendChild(section(large.name, large.text, '一遍'));
    body.appendChild(section(small.name, small.text, `${CN_NUM[small.count]}遍`));
  }

  body.appendChild(el('div', 'full-divider', '✣ 結束 ✣'));
  for (const item of PRAYERS.closing) body.appendChild(section(item.name, item.text, item.label));

  fullBuilt = true;
}

/* ── 完成 ─────────────────────────────────────────── */
let lastRecordId = null;

function finishPrayer() {
  const now = new Date();
  const secs = Math.max(1, Math.round((Date.now() - session.startedAt) / 1000));
  const record = { id: newId(), ts: now.toISOString(), mode: session.mode, secs, note: '' };
  records.push(record);
  saveRecords();
  lastRecordId = record.id;

  setImage($('#done-image'), $('#done-caption'), imageForRole('done', records.length));
  $('#done-meta').textContent = `${fmtFullDate(now)}　${fmtTime(now)}　歷時 ${fmtDuration(secs)}`;
  $('#done-note').value = '';
  session = null;
  releaseWake();
  history.replaceState({ view: 'done' }, '');
  go('done');
}

// 中途離開要先確認，避免誤觸而失去進度。
function mayLeavePrayer() {
  return !(session && session.index > 0) || confirm('尚未誦畢，確定要離開嗎？此次不會留下紀錄。');
}
function leavePrayer() {
  session = null;
  releaseWake();
  renderHome();
  go('home');
}

/* ── 首頁 ─────────────────────────────────────────── */
function renderHome() {
  const today = new Date();
  $('#home-date').textContent = fmtFullDate(today);
  setImage($('#home-image'), $('#home-caption'), imageForRole('home', records.length));

  const todayCount = dayCounts().get(dayKey(today)) || 0;
  const state = $('#today-state');
  state.textContent = todayCount ? `今日已誦念 ${todayCount} 次` : '今日尚未誦念';
  state.classList.toggle('done', todayCount > 0);

  const month = records.filter((r) => {
    const d = new Date(r.ts);
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
  }).length;

  renderStats($('#home-stats'), [
    [streak(), '連續天數'],
    [month, '本月次數'],
    [records.length, '累計次數'],
  ]);
}

function renderStats(node, pairs) {
  node.textContent = '';
  for (const [value, label] of pairs) {
    const s = el('div', 'stat');
    s.appendChild(el('b', null, String(value)));
    s.appendChild(el('span', null, label));
    node.appendChild(s);
  }
}

/* ── 補記 ─────────────────────────────────────────── */
// 用念珠或經本唸的沒有經過程式，補記讓紀錄保持完整。
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function renderManual() {
  const now = new Date();
  $('#manual-date').value = dayKey(now);
  $('#manual-date').max = dayKey(now);   // 還沒發生的祈禱記不了
  $('#manual-time').value = localTime(now);
  $('#manual-note').value = '';
  $('#manual-error').hidden = true;
  renderManualLog();
}

function renderManualLog() {
  const list = $('#manual-log');
  list.textContent = '';
  const logged = records.filter((r) => r.mode === 'offline')
    .sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 10);
  $('#manual-empty').hidden = logged.length > 0;
  for (const r of logged) list.appendChild(logRow(r, () => { renderManual(); renderHome(); }));
}

function saveManual() {
  const date = $('#manual-date').value;
  const time = $('#manual-time').value;
  const error = $('#manual-error');
  const fail = (msg) => { error.textContent = msg; error.hidden = false; };

  if (!date || !time) return fail('請填上日期與時間。');
  const when = new Date(`${date}T${time}`);
  if (Number.isNaN(when.getTime())) return fail('日期或時間不正確。');
  if (when.getTime() > Date.now() + 60000) return fail('不能補記還沒到的時間。');

  records.push({
    id: newId(),
    ts: when.toISOString(),
    mode: 'offline',
    secs: 0,
    note: $('#manual-note').value.trim(),
  });
  saveRecords();
  buzz(BUZZ.bead);
  toast(`已補記 ${when.getMonth() + 1}/${when.getDate()} 的祈禱`);
  renderManual();
  renderHome();
}

/* ── 紀錄 ─────────────────────────────────────────── */
let calMonth = new Date();

/* ── 祈禱玫瑰窗 ────────────────────────────────────── */
// 一個月畫成一扇玫瑰窗：每一天一片花瓣，誦唸過的就亮起來。
// 還沒到的日子只留淡淡輪廓，不把未來畫成缺漏。
const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
const polar = (r, deg) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [200 + r * Math.cos(a), 200 + r * Math.sin(a)];
};
// 花瓣：底部沿內圈、頂端沿外圈，兩側外鼓。
// 頂端不收成尖點而是貼著外圈的一小段弧，整體才像彩窗的玻璃片而非光芒。
// 花瓣：底窄、腰寬、頂端沿外圈收成圓弧。
// 腰部的控制點推到將近整格寬，側緣才鼓得起來，不然會變成直條。
const petalPath = (deg, half, r0, r1) => {
  const p = (r, d) => polar(r, d).map((n) => n.toFixed(1)).join(' ');
  const L = r1 - r0;
  const baseA = half * 0.28;
  const tipA = half * 0.22;
  // 兩個控制點分別落在三成與八成高度，最寬處才會在腰間而不是靠近頂端
  const lowC = [r0 + L * 0.30, half * 1.5];
  const highC = [r0 + L * 0.78, half * 0.78];
  return [
    `M${p(r0, deg - baseA)}`,
    `C${p(lowC[0], deg - lowC[1])} ${p(highC[0], deg - highC[1])} ${p(r1, deg - tipA)}`,
    `A${r1} ${r1} 0 0 1 ${p(r1, deg + tipA)}`,
    `C${p(highC[0], deg + highC[1])} ${p(lowC[0], deg + lowC[1])} ${p(r0, deg + baseA)}`,
    `A${r0} ${r0} 0 0 0 ${p(r0, deg - baseA)}`,
    'Z',
  ].join(' ');
};

// 玻璃的層次：靠近圓心淡、靠近外緣濃。
function roseDefs() {
  const defs = svgEl('defs', {});
  const ramp = [
    ['glass1', 'var(--gold)', '.32', '.72'],
    ['glass2', 'var(--gold)', '.6', '1'],
    ['glass3', 'var(--accent)', '.62', '1'],
  ];
  for (const [id, colour, from, to] of ramp) {
    const g = svgEl('radialGradient', { id, cx: '50%', cy: '50%', r: '50%',
      gradientUnits: 'userSpaceOnUse', fx: '200', fy: '200', cy: '200', cx: '200', r: '176' });
    g.appendChild(svgEl('stop', { offset: '30%', 'stop-color': colour, 'stop-opacity': from }));
    g.appendChild(svgEl('stop', { offset: '100%', 'stop-color': colour, 'stop-opacity': to }));
    defs.appendChild(g);
  }
  return defs;
}

// 一天誦唸幾次決定花瓣的顏色深淺，最多到第三階。
const litClass = (n) => (n >= 3 ? 'lit3' : n === 2 ? 'lit2' : 'lit1');

function renderRose(days) {
  const y = calMonth.getFullYear();
  const m = calMonth.getMonth();
  const total = new Date(y, m + 1, 0).getDate();
  const todayKey = dayKey(new Date());
  const now = new Date();
  const monthAhead = y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth());

  const svg = svgEl('svg', { viewBox: '0 0 400 400', role: 'img', class: 'rose-svg' });
  svg.appendChild(svgEl('title', {})).textContent = `${y} 年 ${m + 1} 月的祈禱`;
  svg.appendChild(roseDefs());

  const step = 360 / total;
  let prayedDays = 0;
  let prayedTimes = 0;

  for (let d = 1; d <= total; d++) {
    const key = dayKey(new Date(y, m, d));
    const n = days.get(key) || 0;
    if (n) { prayedDays++; prayedTimes += n; }
    const future = monthAhead || (y === now.getFullYear() && m === now.getMonth() && d > now.getDate());

    const petal = svgEl('path', {
      d: petalPath((d - 0.5) * step, step * 0.5, 78, 172),
      class: `petal ${n ? litClass(n) : future ? 'future' : 'empty'}${key === todayKey ? ' today' : ''}`,
      'data-day': d,
      style: `--i:${d}`,
    });
    petal.appendChild(svgEl('title', {})).textContent =
      n ? `${m + 1} 月 ${d} 日 · ${n} 次` : `${m + 1} 月 ${d} 日`;
    petal.addEventListener('click', () => readPetal(y, m, d, n));
    svg.appendChild(petal);
  }

  // 窗框
  svg.appendChild(svgEl('circle', { cx: 200, cy: 200, r: 182, class: 'rose-rim' }));
  svg.appendChild(svgEl('circle', { cx: 200, cy: 200, r: 188, class: 'rose-rim thin' }));

  // 中心：本月的總數
  svg.appendChild(svgEl('circle', { cx: 200, cy: 200, r: 66, class: 'rose-core' }));
  svg.appendChild(svgEl('circle', { cx: 200, cy: 200, r: 57, class: 'rose-core-in' }));
  const count = svgEl('text', { x: 200, y: 196, class: 'rose-count' });
  count.textContent = String(prayedTimes);
  svg.appendChild(count);
  const label = svgEl('text', { x: 200, y: 222, class: 'rose-label' });
  label.textContent = prayedTimes ? `${prayedDays} 天` : '尚未誦唸';
  svg.appendChild(label);

  const rose = $('#rose');
  rose.textContent = '';
  rose.appendChild(svg);
  $('#rose-read').textContent = prayedTimes
    ? `本月 ${prayedTimes} 次，共 ${prayedDays} 天。輕觸花瓣看當天。`
    : '這個月還沒有紀錄。';
}

function readPetal(y, m, d, n) {
  const key = dayKey(new Date(y, m, d));
  const notes = records
    .filter((r) => dayKey(new Date(r.ts)) === key && r.note)
    .map((r) => r.note);
  const head = `${m + 1} 月 ${d} 日 · ${n ? `${n} 次` : '未誦唸'}`;
  $('#rose-read').textContent = notes.length ? `${head} — ${notes.join('、')}` : head;
}

function renderHistory() {
  const days = dayCounts();
  renderStats($('#history-stats'), [
    [streak(), '連續天數'],
    [days.size, '誦念天數'],
    [records.length, '累計次數'],
  ]);
  renderRose(days);
  renderCalendar(days);
  renderLog();
}

function renderCalendar(days) {
  const y = calMonth.getFullYear();
  const m = calMonth.getMonth();
  $('#cal-label').textContent = `${y} 年 ${m + 1} 月`;

  const grid = $('#cal-grid');
  grid.textContent = '';
  const first = new Date(y, m, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const todayKey = dayKey(new Date());

  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = dayKey(d);
    const n = days.get(key) || 0;
    const cell = el('div', 'cal-day', String(d.getDate()));
    if (d.getMonth() === m) cell.classList.add('in');
    if (n) cell.classList.add('marked');
    if (key === todayKey) cell.classList.add('today');
    if (n > 1) cell.appendChild(el('span', 'n', String(n)));
    grid.appendChild(cell);
  }
}

// 一列紀錄。補記的沒有實際用時，改標示來源。
function logRow(r, afterDelete) {
  const d = new Date(r.ts);
  const li = document.createElement('li');

  const time = document.createElement('time');
  time.dateTime = r.ts;
  time.textContent = `${d.getMonth() + 1}/${d.getDate()} ${fmtTime(d)}`;
  li.appendChild(time);

  li.appendChild(el('span', 'note', r.note || ''));
  li.appendChild(el('span', 'meta' + (r.mode === 'offline' ? ' tag' : ''),
                    r.mode === 'offline' ? '補記' : fmtDuration(r.secs)));

  const del = el('button', null, '×');
  del.type = 'button';
  del.setAttribute('aria-label', '刪除這筆紀錄');
  del.addEventListener('click', () => {
    if (!confirm('刪除這筆紀錄？')) return;
    records = records.filter((x) => x.id !== r.id);
    saveRecords();
    afterDelete();
  });
  li.appendChild(del);
  return li;
}

function renderLog() {
  const list = $('#log');
  list.textContent = '';
  const recent = [...records].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 60);
  $('#log-empty').hidden = recent.length > 0;
  for (const r of recent) list.appendChild(logRow(r, renderHistory));
}

const renderMonth = () => { const d = dayCounts(); renderRose(d); renderCalendar(d); };

/* ── 設定 ─────────────────────────────────────────── */
function applySettings() {
  document.documentElement.style.setProperty('--fs', settings.font / 100);
  if (settings.theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', settings.theme);
}

function renderSettings() {
  renderSlots();
  $('#set-mode').value = settings.mode;
  $('#set-font').value = settings.font;
  $('#set-font-out').textContent = `${settings.font}%`;
  $('#set-theme').value = settings.theme;
  $('#set-wake').checked = settings.wake;
  $('#set-wake').disabled = !('wakeLock' in navigator);
  $('#set-haptic').checked = settings.haptic;
  $('#set-haptic').disabled = !navigator.vibrate;
  $('#set-haptic-strength').value = settings.hapticStrength;

  $('#about-text').textContent =
    `經文共 ${STEPS.length} 步，聖像 ${IMAGES.length} 張。所有紀錄只存在此裝置，不會上傳。`;

  if (navigator.storage && navigator.storage.persisted) {
    navigator.storage.persisted().then((ok) => {
      $('#storage-state').textContent = ok
        ? '此裝置已將紀錄設為常駐，系統不會自動清除。'
        : '尚未取得常駐儲存權限，請定期匯出備份。';
    }).catch(() => {});
  }
}

/* ── 自訂聖像 ──────────────────────────────────────── */
// 使用者從相簿選的圖存在 IndexedDB；settings.pictures 記錄哪個位置用哪張。
// 以內容雜湊當作鍵值，同一張圖指定給多個位置時只會存一份。
const DB_NAME = 'mercy-pictures';
const DB_STORE = 'blobs';

const openDB = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function dbOp(mode, run) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, mode);
    const req = run(tx.objectStore(DB_STORE));
    tx.oncomplete = () => { db.close(); resolve(req ? req.result : undefined); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
const putBlob = (id, blob) => dbOp('readwrite', (s) => s.put(blob, id));
const getBlob = (id) => dbOp('readonly', (s) => s.get(id));
const dropBlob = (id) => dbOp('readwrite', (s) => s.delete(id));
const allBlobIds = () => dbOp('readonly', (s) => s.getAllKeys());

// 相機照片動輒數 MB，縮到長邊 1600 像素即足夠，也讓備份檔不致過大。
async function shrink(file, max = 1600, quality = 0.82) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (bitmap.close) bitmap.close();
    return await new Promise((r) => canvas.toBlob((b) => r(b || file), 'image/jpeg', quality));
  } catch {
    return file; // 無法解碼時原樣存入，總比失敗好
  }
}

async function blobId(blob) {
  if (crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `${blob.size}-${blob.type}-${Date.now()}`;
}

const pictureUrls = new Map(); // id → object URL

async function loadPictures() {
  if (!('indexedDB' in window)) return;
  try {
    const wanted = new Set(Object.values(settings.pictures || {}));
    for (const id of wanted) {
      if (pictureUrls.has(id)) continue;
      const blob = await getBlob(id);
      if (blob) pictureUrls.set(id, URL.createObjectURL(blob));
    }
    // 清掉已無位置引用的圖檔，避免佔空間
    for (const id of (await allBlobIds()) || []) if (!wanted.has(id)) await dropBlob(id);
  } catch { /* 無法使用 IndexedDB 時就只用內建聖像 */ }
}

function customFor(role) {
  const id = (settings.pictures || {})[role];
  const url = id && pictureUrls.get(id);
  if (!url) return null;
  const listed = imageRoles.get(role) || [];
  return { file: url, caption: listed.length ? listed[0].caption : '' };
}

async function assignPicture(role, file) {
  try {
    const blob = await shrink(file);
    const id = await blobId(blob);
    await putBlob(id, blob);
    settings.pictures = { ...(settings.pictures || {}), [role]: id };
    saveSettings();
    if (!pictureUrls.has(id)) pictureUrls.set(id, URL.createObjectURL(blob));
    await loadPictures();
    renderSlots();
    renderHome();
    toast(`已設定「${(IMAGE_SLOTS.find((s) => s[0] === role) || [, role])[1]}」的聖像`);
  } catch {
    toast('無法儲存圖片，可能是空間不足');
  }
}

async function clearPicture(role) {
  const pictures = { ...(settings.pictures || {}) };
  delete pictures[role];
  settings.pictures = pictures;
  saveSettings();
  await loadPictures();
  renderSlots();
  renderHome();
}

let slotTarget = null;
function renderSlots() {
  const list = $('#slots');
  list.textContent = '';
  for (const [role, label] of IMAGE_SLOTS) {
    const custom = customFor(role);
    const listed = imageRoles.get(role) || [];
    const li = el('li', 'slot');

    const thumb = document.createElement('img');
    thumb.className = 'slot-thumb';
    // 與正式畫面共用同一套遞補與失敗記憶
    setImage(thumb, null, custom ? [custom, ...listed] : listed);
    li.appendChild(thumb);

    const text = el('div', 'slot-text');
    text.appendChild(el('span', 'slot-name', label));
    text.appendChild(el('span', 'slot-state', custom ? '自訂圖片' : '預設'));
    li.appendChild(text);

    const pick = el('button', 'btn btn-tiny', custom ? '更換' : '選圖');
    pick.type = 'button';
    pick.addEventListener('click', () => { slotTarget = role; $('#pic-file').click(); });
    li.appendChild(pick);

    if (custom) {
      const reset = el('button', 'btn btn-tiny btn-quiet', '還原');
      reset.type = 'button';
      reset.addEventListener('click', () => clearPicture(role));
      li.appendChild(reset);
    }
    list.appendChild(li);
  }
}

/* ── 匯出與匯入 ────────────────────────────────────── */
const blobToDataUrl = (blob) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => resolve(null);
  reader.readAsDataURL(blob);
});

async function exportRecords() {
  if (!records.length && !Object.keys(settings.pictures || {}).length) { toast('尚無紀錄可匯出'); return; }
  const payload = { app: 'mercy-divine', version: 2, exportedAt: new Date().toISOString(), records };

  // 自訂聖像一併帶走，換手機或清除資料後可完整還原
  const pictures = {};
  for (const id of new Set(Object.values(settings.pictures || {}))) {
    const blob = await getBlob(id).catch(() => null);
    if (blob) {
      const url = await blobToDataUrl(blob);
      if (url) pictures[id] = url;
    }
  }
  if (Object.keys(pictures).length) {
    payload.pictures = pictures;
    payload.pictureRoles = settings.pictures;
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mercy-chaplet-records-${dayKey(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const shots = Object.keys(payload.pictures || {}).length;
  toast(`已匯出 ${records.length} 筆紀錄${shots ? ` 與 ${shots} 張聖像` : ''}`);
}

// 只接受內嵌的 data: 圖片。備份檔可能來自他處，若其中放的是 http 網址，
// fetch 會向外連線；本程式不應在任何情況下對外送出請求。
const IMAGE_DATA_URL = /^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const dataUrlToBlob = (url) => {
  if (typeof url !== 'string' || !IMAGE_DATA_URL.test(url)) throw new Error('不是內嵌圖片');
  return fetch(url).then((r) => r.blob());
};

function importRecords(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    let incoming;
    try {
      const parsed = JSON.parse(reader.result);
      incoming = Array.isArray(parsed) ? parsed : parsed.records;
    } catch { incoming = null; }
    if (!Array.isArray(incoming)) { toast('檔案格式不正確'); return; }

    const seen = new Set(records.map((r) => r.id));
    let added = 0;
    for (const r of incoming) {
      if (!r || !r.ts || Number.isNaN(Date.parse(r.ts)) || (r.id && seen.has(r.id))) continue;
      records.push({
        id: String(r.id || newId()).slice(0, 64),
        ts: r.ts,
        mode: ['guided', 'full', 'offline'].includes(r.mode) ? r.mode : 'guided',
        secs: Number.isFinite(r.secs) ? Math.max(0, Math.min(r.secs, 86400)) : 0,
        note: typeof r.note === 'string' ? r.note.slice(0, 80) : '',
      });
      if (r.id) seen.add(r.id);
      added++;
    }
    saveRecords();

    let shots = 0;
    const parsed = JSON.parse(reader.result);
    if (parsed && parsed.pictures && parsed.pictureRoles) {
      // 只有確實存進來的圖片才算數，被擋下的網址不應留下對應關係。
      const stored = new Set();
      for (const [id, url] of Object.entries(parsed.pictures)) {
        try { await putBlob(id, await dataUrlToBlob(url)); stored.add(id); shots++; } catch { /* 略過壞掉的圖 */ }
      }
      const known = new Set(IMAGE_SLOTS.map(([role]) => role));
      const roles = {};
      for (const [role, id] of Object.entries(parsed.pictureRoles)) {
        if (known.has(role) && typeof id === 'string' && stored.has(id)) roles[role] = id;
      }
      settings.pictures = { ...(settings.pictures || {}), ...roles };
      saveSettings();
      await loadPictures();
      renderSlots();
    }

    renderHome();
    renderHistory();
    const parts = [added ? `${added} 筆紀錄` : '', shots ? `${shots} 張聖像` : ''].filter(Boolean);
    toast(parts.length ? `已匯入 ${parts.join('、')}` : '沒有新的內容可匯入');
  };
  reader.onerror = () => toast('無法讀取檔案');
  reader.readAsText(file);
}

/* ── 事件綁定 ──────────────────────────────────────── */
function bind() {
  $('#start-btn').addEventListener('click', startPrayer);
  $('#prayer-exit').addEventListener('click', () => history.back());
  $('#step-next').addEventListener('click', () => (session.mode === 'guided' ? advance() : finishPrayer()));
  $('#step-prev').addEventListener('click', back);

  $('#mode-toggle').addEventListener('click', () => {
    session.mode = session.mode === 'guided' ? 'full' : 'guided';
    applyMode();
    $('#prayer-scroll').scrollTop = 0;
  });

  // 輕觸整個經文區域前進。判斷只看手指有沒有移動，不看按了多久——
  // 唸經時手指常會停在畫面上，用時間判斷會讓慢的觸碰算不到。
  const scroll = $('#prayer-scroll');
  let down = null;
  let lastStep = 0;
  scroll.addEventListener('pointerdown', (e) => {
    if (!session || session.mode !== 'guided' || e.target.closest('button, a, input, select')) { down = null; return; }
    down = { x: e.clientX, y: e.clientY, top: scroll.scrollTop };
  });
  scroll.addEventListener('pointerup', (e) => {
    if (!down) return;
    const start = down;
    down = null;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 14) return; // 拖曳
    if (Math.abs(scroll.scrollTop - start.top) > 4) return;                // 捲動
    if (Date.now() - lastStep < 200) return;   // 同一次觸碰的重複事件，避免一觸算兩珠
    lastStep = Date.now();
    advance();
  });
  scroll.addEventListener('pointercancel', () => { down = null; });
  // 長按圖片會跳出「儲存圖片」，會打斷祈禱
  scroll.addEventListener('contextmenu', (e) => {
    if (session && session.mode === 'guided') e.preventDefault();
  });

  for (const btn of document.querySelectorAll('[data-go]')) {
    btn.addEventListener('click', () => {
      const target = btn.dataset.go;
      if (target === 'home') { history.back(); return; }
      if (target === 'history') { calMonth = new Date(); renderHistory(); }
      if (target === 'settings') renderSettings();
      history.pushState({ view: target }, '');
      go(target);
    });
  }

  $('#manual-btn').addEventListener('click', () => {
    renderManual();
    history.pushState({ view: 'manual' }, '');
    go('manual');
  });
  $('#manual-save').addEventListener('click', saveManual);

  $('#done-home').addEventListener('click', () => history.back());
  $('#done-note').addEventListener('input', (e) => {
    const rec = records.find((r) => r.id === lastRecordId);
    if (rec) { rec.note = e.target.value.trim(); saveRecords(); }
  });
  $('#done-undo').addEventListener('click', () => {
    if (!confirm('刪除剛才這筆紀錄？')) return;
    records = records.filter((r) => r.id !== lastRecordId);
    saveRecords();
    history.back();
    toast('已刪除');
  });

  $('#cal-prev').addEventListener('click', () => { calMonth.setMonth(calMonth.getMonth() - 1); renderMonth(); });
  $('#cal-next').addEventListener('click', () => { calMonth.setMonth(calMonth.getMonth() + 1); renderMonth(); });
  $('#cal-toggle').addEventListener('click', () => {
    const showCal = $('#cal').hidden;
    $('#cal').hidden = !showCal;
    $('#rose').hidden = showCal;
    $('#rose-read').hidden = showCal;
    $('#cal-toggle').textContent = showCal ? '看玫瑰窗' : '看月曆';
  });

  $('#set-mode').addEventListener('change', (e) => { settings.mode = e.target.value; saveSettings(); });
  $('#set-theme').addEventListener('change', (e) => { settings.theme = e.target.value; saveSettings(); applySettings(); });
  $('#set-wake').addEventListener('change', (e) => {
    settings.wake = e.target.checked;
    saveSettings();
    if (!settings.wake) releaseWake();
  });
  $('#set-haptic').addEventListener('change', (e) => {
    settings.haptic = e.target.checked;
    saveSettings();
    if (settings.haptic) buzz(BUZZ.bead);
  });
  $('#set-haptic-strength').addEventListener('change', (e) => {
    settings.hapticStrength = e.target.value;
    saveSettings();
    buzz(BUZZ.bead);
  });
  // 手機可能整機關閉震動，讓使用者當場確認得到
  $('#test-haptic').addEventListener('click', () => {
    if (!navigator.vibrate) { toast('這個瀏覽器不支援震動'); return; }
    const demo = [...BUZZ.bead, 350, ...BUZZ.bead, 350, ...BUZZ.lastBead, 350, ...BUZZ.decadeDone];
    buzz(demo);
    toast('一珠 · 一珠 · 下一顆是第十 · 一端圓滿');
  });
  $('#set-font').addEventListener('input', (e) => {
    settings.font = Number(e.target.value);
    $('#set-font-out').textContent = `${settings.font}%`;
    applySettings();
  });
  $('#set-font').addEventListener('change', saveSettings);

  $('#pic-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && slotTarget) assignPicture(slotTarget, file);
    slotTarget = null;
    e.target.value = '';
  });

  $('#export-btn').addEventListener('click', exportRecords);
  $('#import-btn').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', (e) => {
    if (e.target.files[0]) importRecords(e.target.files[0]);
    e.target.value = '';
  });

  // 手機返回鍵：先退回首頁，在首頁時才真正離開程式。
  window.addEventListener('popstate', () => {
    if (current === 'prayer') {
      if (!mayLeavePrayer()) { history.pushState({ view: 'prayer' }, ''); return; }
      leavePrayer();
    } else if (current !== 'home') {
      renderHome();
      go('home');
    }
  });
}

/* ── Service worker ───────────────────────────────── */
// 單檔預覽版無法下載檔案，也沒有 service worker，相關功能改為說明文字。
function applyPreviewLimits() {
  $('#export-btn').hidden = true;
  $('#import-btn').hidden = true;
  $('#import-file').hidden = true;
  $('#backup-card').querySelector('.hint').textContent =
    '這是線上預覽版，匯出與匯入備份僅在安裝到手機後可用。此處的紀錄只存在這個瀏覽器分頁所屬的網站資料中。';
}

function initServiceWorker() {
  if (INLINE || !('serviceWorker' in navigator)) {
    $('#check-update').hidden = true;
    $('#update-state').textContent = INLINE ? '此為單檔預覽版，更新請見正式安裝版。' : '';
    return;
  }
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const watch = (worker) => {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) $('#update-bar').hidden = false;
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) $('#update-bar').hidden = false;
    reg.addEventListener('updatefound', () => watch(reg.installing));

    $('#update-apply').addEventListener('click', () => {
      const worker = reg.waiting || reg.installing;
      if (worker) worker.postMessage('skip-waiting');
      setTimeout(() => location.reload(), 300);
    });
    $('#check-update').addEventListener('click', () => {
      $('#update-state').textContent = '檢查中⋯';
      reg.update()
        .then(() => { $('#update-state').textContent = reg.waiting ? '已有新版本，請點下方橫幅重新載入。' : '目前已是最新版本。'; })
        .catch(() => { $('#update-state').textContent = '無法檢查（可能目前離線）。'; });
    });
  }).catch(() => {});

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}

/* ── 啟動 ─────────────────────────────────────────── */
// 單檔預覽版會把經文與圖片直接嵌在頁面裡，此時不必也無法用 fetch 取得。
let INLINE = false;
const inlineJSON = (id) => {
  const node = document.getElementById(id);
  return node ? JSON.parse(node.textContent) : null;
};

async function init() {
  applySettings();
  try {
    const embedded = inlineJSON('data-prayers');
    INLINE = embedded !== null;
    const [prayers, images] = INLINE
      ? [embedded, inlineJSON('data-images') || { images: [] }]
      : await Promise.all([
          fetch('data/prayers.json').then((r) => r.json()),
          fetch('data/images.json').then((r) => r.json()).catch(() => ({ images: [] })),
        ]);
    PRAYERS = prayers;
    IMAGES = images.images || [];
    buildImageRoles();
    STEPS = buildSteps(PRAYERS);
  } catch {
    $('.boot-msg').textContent = '無法載入經文檔案，請確認 data/prayers.json 存在。';
    return;
  }

  document.title = PRAYERS.title;
  $('.home-title').textContent = PRAYERS.title;
  bind();
  if (INLINE) applyPreviewLimits();
  await loadPictures();
  renderHome();
  go('home');
  $('#boot').hidden = true;
  $('#app').hidden = false;
  initServiceWorker();
}

init();
