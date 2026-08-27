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

const DEFAULTS = { mode: 'guided', font: 100, theme: 'auto', wake: true, pictures: {} };

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
  renderSlots();
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
        mode: r.mode === 'full' ? 'full' : 'guided',
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
