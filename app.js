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

const DEFAULTS = { mode: 'guided', font: 100, theme: 'auto', wake: true };
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
    steps.push({ kind: 'opening', name: item.name, text: item.text, stage: '開始' });
  }
  const { count, large, small } = p.decades;
  for (let d = 1; d <= count; d++) {
    const stage = `第${CN_NUM[d]}端`;
    steps.push({ kind: 'large', name: large.name, text: large.text, stage, decade: d, bead: 0 });
    for (let b = 1; b <= small.count; b++) {
      steps.push({ kind: 'small', name: small.name, text: small.text, stage, decade: d, bead: b });
    }
  }
  for (const item of p.closing) {
    for (let r = 1; r <= (item.repeat || 1); r++) {
      steps.push({ kind: 'closing', name: item.name, text: item.text, stage: '結束', rep: r, of: item.repeat || 1 });
    }
  }
  return steps;
}

const imageAt = (i) => (IMAGES.length ? IMAGES[((i % IMAGES.length) + IMAGES.length) % IMAGES.length] : null);

function setImage(imgNode, capNode, image) {
  if (!image) return;
  imgNode.src = image.file;
  imgNode.alt = image.caption || '';
  if (capNode) capNode.textContent = image.caption || '';
}

function imageForStep(step) {
  if (!IMAGES.length) return null;
  if (step.kind === 'large' || step.kind === 'small') return imageAt(step.decade);
  if (step.kind === 'closing') return imageAt(IMAGES.length - 1);
  return imageAt(0);
}

/* ── 畫面切換 ──────────────────────────────────────── */
const VIEWS = ['home', 'prayer', 'done', 'history', 'settings'];
let current = 'home';

function go(name) {
  current = name;
  for (const v of VIEWS) $(`#view-${v}`).classList.toggle('active', v === name);
  if (name !== 'prayer') releaseWake();
  window.scrollTo(0, 0);
  const scroll = $('#prayer-scroll');
  if (name === 'prayer' && scroll) scroll.scrollTop = 0;
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
    setImage($('#full-image'), null, imageAt(0));
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
  $('#tap-hint').textContent = last ? '輕觸畫面完成' : '輕觸畫面繼續';
  $('#prayer-scroll').scrollTop = 0;
}

function renderBeads(step) {
  const wrap = $('#beads');
  wrap.textContent = '';
  if (step.kind !== 'large' && step.kind !== 'small') return;
  const total = PRAYERS.decades.small.count;
  wrap.appendChild(makeBead('bead lg' + (step.bead === 0 ? ' now' : ' on')));
  for (let b = 1; b <= total; b++) {
    let cls = 'bead';
    if (b < step.bead) cls += ' on';
    else if (b === step.bead) cls += ' now';
    wrap.appendChild(makeBead(cls));
  }
}
const makeBead = (cls) => el('span', cls);

function advance() {
  if (session.index >= STEPS.length - 1) finishPrayer();
  else { session.index++; renderStep(); }
}
function back() {
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

  setImage($('#done-image'), $('#done-caption'), imageAt(records.length));
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
  setImage($('#home-image'), $('#home-caption'), imageAt(records.length));

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

/* ── 紀錄 ─────────────────────────────────────────── */
let calMonth = new Date();

function renderHistory() {
  const days = dayCounts();
  renderStats($('#history-stats'), [
    [streak(), '連續天數'],
    [days.size, '誦念天數'],
    [records.length, '累計次數'],
  ]);
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

function renderLog() {
  const list = $('#log');
  list.textContent = '';
  const recent = [...records].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 60);
  $('#log-empty').hidden = recent.length > 0;

  for (const r of recent) {
    const d = new Date(r.ts);
    const li = document.createElement('li');

    const time = document.createElement('time');
    time.dateTime = r.ts;
    time.textContent = `${d.getMonth() + 1}/${d.getDate()} ${fmtTime(d)}`;
    li.appendChild(time);

    li.appendChild(el('span', 'note', r.note || ''));
    li.appendChild(el('span', 'meta', fmtDuration(r.secs)));

    const del = el('button', null, '×');
    del.type = 'button';
    del.setAttribute('aria-label', '刪除這筆紀錄');
    del.addEventListener('click', () => {
      if (!confirm('刪除這筆紀錄？')) return;
      records = records.filter((x) => x.id !== r.id);
      saveRecords();
      renderHistory();
    });
    li.appendChild(del);

    list.appendChild(li);
  }
}

/* ── 設定 ─────────────────────────────────────────── */
function applySettings() {
  document.documentElement.style.setProperty('--fs', settings.font / 100);
  if (settings.theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', settings.theme);
}

function renderSettings() {
  $('#set-mode').value = settings.mode;
  $('#set-font').value = settings.font;
  $('#set-font-out').textContent = `${settings.font}%`;
  $('#set-theme').value = settings.theme;
  $('#set-wake').checked = settings.wake;
  $('#set-wake').disabled = !('wakeLock' in navigator);

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

/* ── 匯出與匯入 ────────────────────────────────────── */
function exportRecords() {
  if (!records.length) { toast('尚無紀錄可匯出'); return; }
  const payload = { app: 'mercy-divine', version: 1, exportedAt: new Date().toISOString(), records };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mercy-chaplet-records-${dayKey(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`已匯出 ${records.length} 筆紀錄`);
}

function importRecords(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let incoming;
    try {
      const parsed = JSON.parse(reader.result);
      incoming = Array.isArray(parsed) ? parsed : parsed.records;
    } catch { incoming = null; }
    if (!Array.isArray(incoming)) { toast('檔案格式不正確'); return; }

    const seen = new Set(records.map((r) => r.id));
    let added = 0;
    for (const r of incoming) {
      if (!r || !r.ts || (r.id && seen.has(r.id))) continue;
      records.push({ id: r.id || newId(), ts: r.ts, mode: r.mode || 'guided', secs: r.secs || 0, note: r.note || '' });
      if (r.id) seen.add(r.id);
      added++;
    }
    saveRecords();
    renderHome();
    renderHistory();
    toast(added ? `已匯入 ${added} 筆紀錄` : '沒有新的紀錄可匯入');
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

  // 輕觸經文卡片前進；拖曳或長按則視為捲動，不前進。
  let down = null;
  const guided = $('#guided');
  guided.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: Date.now() }; });
  guided.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = Date.now() - down.t < 500;
    down = null;
    if (moved < 10 && quick && !window.getSelection().toString()) advance();
  });
  guided.addEventListener('pointercancel', () => { down = null; });

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

  $('#cal-prev').addEventListener('click', () => { calMonth.setMonth(calMonth.getMonth() - 1); renderCalendar(dayCounts()); });
  $('#cal-next').addEventListener('click', () => { calMonth.setMonth(calMonth.getMonth() + 1); renderCalendar(dayCounts()); });

  $('#set-mode').addEventListener('change', (e) => { settings.mode = e.target.value; saveSettings(); });
  $('#set-theme').addEventListener('change', (e) => { settings.theme = e.target.value; saveSettings(); applySettings(); });
  $('#set-wake').addEventListener('change', (e) => {
    settings.wake = e.target.checked;
    saveSettings();
    if (!settings.wake) releaseWake();
  });
  $('#set-font').addEventListener('input', (e) => {
    settings.font = Number(e.target.value);
    $('#set-font-out').textContent = `${settings.font}%`;
    applySettings();
  });
  $('#set-font').addEventListener('change', saveSettings);

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
function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
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
async function init() {
  applySettings();
  try {
    const [prayers, images] = await Promise.all([
      fetch('data/prayers.json').then((r) => r.json()),
      fetch('data/images.json').then((r) => r.json()).catch(() => ({ images: [] })),
    ]);
    PRAYERS = prayers;
    IMAGES = images.images || [];
    STEPS = buildSteps(PRAYERS);
  } catch {
    $('.boot-msg').textContent = '無法載入經文檔案，請確認 data/prayers.json 存在。';
    return;
  }

  document.title = PRAYERS.title;
  $('.home-title').textContent = PRAYERS.title;
  bind();
  renderHome();
  go('home');
  $('#boot').hidden = true;
  $('#app').hidden = false;
  initServiceWorker();
}

init();
