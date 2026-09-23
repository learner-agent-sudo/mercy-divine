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

const DEFAULTS = { mode: 'guided', font: 100, theme: 'auto', wake: true, haptic: true,
                   hapticStrength: 'strong', set: 'chaplet', mystery: null, mysteryDay: null, pictures: {} };

// 聖像可以指定的位置，依經文分組產生。
// 共用的 home/done 用原本的名稱；各經文的位置前面加上經文代號，
// 這樣玫瑰經的天主經可以另配一張，沒另配時自動沿用共用的那張。
function imageSlots() {
  const groups = [];
  for (const set of SETS) {
    const seen = new Set();
    // 每套經文自己的封面與誦畢畫面，兩者各有各的圖
    const slots = [[`${set.id}:home`, '封面（首頁）']];
    const push = (items) => {
      for (const item of items || []) {
        const prayer = set.prayers[item.prayer];
        if (!prayer || seen.has(item.prayer)) continue;
        seen.add(item.prayer);
        slots.push([`${set.id}:${item.prayer}`, prayer.name]);
      }
    };
    push(set.opening);
    push(set.decades && set.decades.sequence);
    push(set.closing);
    slots.push([`${set.id}:done`, '誦畢']);
    groups.push({ title: set.short || set.title, slots });

    // 四組奧蹟共二十端，每一端都可以配自己的聖像
    for (const mset of set.mysterySets || []) {
      groups.push({
        title: `${set.short || set.title} · ${mset.name}`,
        slots: mset.mysteries.map((m, i) => [`${set.id}:${mset.id}-${i + 1}`, `${CN_NUM[i + 1]}　${m.name}`]),
      });
    }
  }

  // 舊版把封面存成共用的，若還留著就讓它看得見也還原得掉
  const legacy = [['home', '封面（兩種經文共用）'], ['done', '誦畢（共用）']]
    .filter(([key]) => customFor(key));
  if (legacy.length) groups.push({ title: '共用（舊設定）', slots: legacy });

  return groups;
}

const allSlotKeys = () => imageSlots().flatMap((g) => g.slots.map(([key]) => key));
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

function dayCounts(setId) {
  const m = new Map();
  for (const r of records) {
    if (setId && (r.set || 'chaplet') !== setId) continue;
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
let SETS = [];            // 所有經文
let SET = null;           // 目前選用的經文
let MYSTERY = null;       // 玫瑰經的奧蹟（串經為 null）
let IMAGES = [];
let STEPS = [];

const setById = (id) => SETS.find((x) => x.id === id) || SETS[0];

// prayers 內的 {"from":"其他經文"} 表示共用同一篇文字。
// 在載入時就接上，其餘程式碼便不必知道有這回事。
function resolveShared(sets) {
  for (const set of sets) {
    for (const [id, prayer] of Object.entries(set.prayers)) {
      if (!prayer || !prayer.from) continue;
      const source = sets.find((x) => x.id === prayer.from);
      const shared = source && source.prayers[id];
      if (shared && !shared.from) set.prayers[id] = shared;
      else delete set.prayers[id];   // 來源不存在就當作沒有這一篇，不要顯示空白
    }
  }
  return sets;
}
const mysteryById = (set, id) =>
  (set.mysterySets || []).find((m) => m.id === id) || (set.mysterySets || [])[0] || null;

// 依星期選奧蹟：一、六歡喜；二、五痛苦；三、日榮福；四光明。
function mysteryForToday(set) {
  const today = new Date().getDay();
  return (set.mysterySets || []).find((m) => (m.days || []).includes(today))
      || (set.mysterySets || [])[0] || null;
}

// 把 opening / decades.sequence / closing 展開成一步一步。
// repeat 幾遍就是幾步；bead 的那一項會畫出珠子。
function expand(items, set, ctx, steps) {
  for (const item of items) {
    const prayer = set.prayers[item.prayer];
    if (!prayer) continue;
    const total = item.repeat || 1;
    for (let i = 1; i <= total; i++) {
      steps.push({
        kind: ctx.kind,
        id: item.prayer,
        name: prayer.name,
        text: prayer.text,
        stage: ctx.stage,
        decade: ctx.decade || null,
        bead: item.bead ? { i, total } : null,
        rep: total > 1 && !item.bead ? { i, total } : null,
      });
    }
  }
}

function buildSteps(set, mystery) {
  const steps = [];
  expand(set.opening || [], set, { kind: 'opening', stage: '開始' }, steps);

  const dec = set.decades;
  for (let d = 1; d <= dec.count; d++) {
    const stage = `第${CN_NUM[d]}端`;
    const from = steps.length;

    // 玫瑰經每端先報奧蹟，並默想該端
    if (dec.mystery && mystery) {
      const m = mystery.mysteries[d - 1];
      if (m) steps.push({ kind: 'mystery', id: 'mystery', name: m.name, text: m.text,
                          ref: m.ref, stage, decade: d, bead: null, rep: null });
    }
    expand(dec.sequence, set, { kind: 'decade', stage, decade: d }, steps);
    if (dec.mystery && mystery) {
      for (let i = from; i < steps.length; i++) steps[i].mysterySet = mystery.id;
    }

    // 珠子列要知道這一端的珠數，以及目前在珠串的前面還是後面
    const beadStep = steps.slice(from).find((x) => x.bead);
    const beadTotal = beadStep ? beadStep.bead.total : 0;
    let passed = false;
    for (let i = from; i < steps.length; i++) {
      if (steps[i].bead) { passed = true; continue; }
      steps[i].decadeBeads = beadTotal;
      steps[i].afterBeads = passed;
    }
    if (steps[from]) steps[from].decadeStart = true;
  }

  expand(set.closing || [], set, { kind: 'closing', stage: '結束' }, steps);
  return steps;
}

const rebuildSteps = () => { STEPS = buildSteps(SET, MYSTERY); };

/* ── 聖像 ─────────────────────────────────────────── */
const imageAt = (i) => (IMAGES.length ? IMAGES[((i % IMAGES.length) + IMAGES.length) % IMAGES.length] : null);

// data/images.json 的 for 欄位把聖像指給某段經文。
// 名稱可寫成 "hail-mary"（兩套經文通用）或 "rosary:hail-mary"（只用於玫瑰經）。
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

// 自訂聖像排最前面，其後才是 data/images.json 列出的圖片。
const rolesFor = (role) => {
  if (isNoPicture(role)) return [];
  const scoped = SET ? `${SET.id}:${role}` : role;
  const listed = [...(imageRoles.get(scoped) || []), ...(imageRoles.get(role) || [])];
  const custom = customFor(settingFor(role));
  return custom ? [custom, ...listed] : listed;
};

// 某個位置該顯示哪張圖：自訂 → 該經文指定 → 共用指定 → 首頁那張
function slotCandidates(key) {
  const plain = key.includes(':') ? key.split(':').slice(1).join(':') : key;
  const list = [
    customFor(key),
    ...(imageRoles.get(key) || []),
    ...(plain !== key ? imageRoles.get(plain) || [] : []),
  ].filter(Boolean);
  if (list.length) return list;
  return key === 'home' ? [] : [customFor('home'), ...(imageRoles.get('home') || [])].filter(Boolean);
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
    imgNode.onload = scrollCue;   // 圖片載進來高度才定下來
    imgNode.src = list[i].file;
    imgNode.alt = list[i].caption || '';
    if (capNode) capNode.textContent = list[i].caption || '';
  };
  show(0);
}

// 先找指定給這段經文的聖像；沒有就退回首頁那張，畫面才不會忽有忽無。
// 依序找：這段經文 → 該端奧蹟 → 封面。任何一層寫了「不用圖片」就到此為止，
// 不再往下遞補，否則使用者關掉的圖會從別處冒出來。
function pickFrom(roles, fallbackIndex) {
  for (const role of roles) {
    if (isNoPicture(role)) return [];
    const found = rolesFor(role);
    if (found.length) return found;
  }
  return IMAGES.length ? [imageAt(fallbackIndex || 0)] : [];
}

function imageForStep(step) {
  const roles = [];
  // 奧蹟的聖像只用在報奧蹟那一步。之後唸天主經就顯示天主經的聖像、
  // 唸聖母經就顯示聖母經的，各歸各位。
  if (step.kind === 'mystery') {
    if (step.mysterySet) roles.push(`${step.mysterySet}-${step.decade}`);
    roles.push(`decade-${step.decade}`);
  }
  roles.push(step.id, 'home');
  return pickFrom(roles);
}

const imageForRole = (role, fallbackIndex) =>
  pickFrom(role === 'home' ? ['home'] : [role, 'home'], fallbackIndex);

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

/* ── 口袋模式 ──────────────────────────────────────── */
// 走路時用：手機關螢幕放口袋，用手錶上的音樂控制數珠。
//
// Android 只留了一個縫隙讓網頁在關螢幕時繼續活著——正在播放音訊的分頁不會被
// 凍結，而且系統會把耳機鍵、藍牙鍵、手錶上的上下一首都轉給它。所以這裡播一段
// 聽不見的音訊佔住那個位置，再把「下一首」接成「數一珠」。
// 手錶上那行曲名就是目前唸到哪裡，所以不需要任何聲音提示。

const POCKET_KEY = 'mercy.pocket.v1';
const POCKET_ART = [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }];
const HOLD_SECS = 30;      // 見下方：太短的音軌拿不到媒體控制
let holding = null;        // 正在播放的音訊元素
let holdUrl = null;

// 撐住分頁的那段音軌。要同時滿足兩件互相拉扯的事：
//
// 1. Chrome 只替「夠長、聽得到」的音訊建立媒體工作階段——太短的會被當成音效，
//    不會出現播放控制，手錶上自然什麼都沒有。所以長度取 30 秒，音量也不能壓到
//    系統的偵測門檻以下。
// 2. 可是我們不想讓人聽到任何聲音。
//
// 解法是用 40Hz。手機喇叭本來就推不出這麼低的頻率，所以就算振幅拉到
// -38dB（系統聽得很清楚），人耳在手機上還是一片安靜。
function holdTrackUrl() {
  const rate = 8000;
  const n = rate * HOLD_SECS;
  const buf = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buf);
  const str = (off, t) => { for (let i = 0; i < t.length; i++) view.setUint8(off + i, t.charCodeAt(i)); };
  str(0, 'RIFF');  view.setUint32(4, 36 + n * 2, true);  str(8, 'WAVE');
  str(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);  view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, n * 2, true);
  const amp = 0.012 * 32767;                       // 約 -38dB
  for (let i = 0; i < n; i++) {
    view.setInt16(44 + i * 2, Math.round(amp * Math.sin((2 * Math.PI * 40 * i) / rate)), true);
  }
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

// 必須在觸碰事件裡呼叫，否則瀏覽器不准播放。
async function holdPlay() {
  const el = $('#hold');
  if (!el) return false;
  if (!holdUrl) { holdUrl = holdTrackUrl(); el.preload = 'auto'; el.src = holdUrl; }
  el.loop = true;
  el.volume = 1;
  try { await el.play(); } catch { return false; }
  holding = el;
  return true;
}

function holdStop() {
  if (holding) { holding.pause(); holding.currentTime = 0; holding = null; }
}

const MEDIA_ACTIONS = ['nexttrack', 'previoustrack', 'play', 'pause'];
function mediaBind(handlers) {
  if (!('mediaSession' in navigator)) return false;
  const ms = navigator.mediaSession;
  ms.playbackState = 'playing';
  let bound = 0;
  for (const action of MEDIA_ACTIONS) {
    try { ms.setActionHandler(action, handlers[action] || null); bound++; } catch { /* 不支援的動作跳過 */ }
  }
  return bound > 0;
}
function mediaRelease() {
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  for (const action of MEDIA_ACTIONS) {
    try { ms.setActionHandler(action, null); } catch { /* 同上 */ }
  }
  ms.metadata = null;
  ms.playbackState = 'none';
}

async function pocketStart() {
  if (!(await holdPlay())) return false;
  const el = holding;
  mediaBind({
    nexttrack: () => { if (session) advance(); },
    previoustrack: () => { if (session) back(); },
    play: () => { el.play().catch(() => {}); navigator.mediaSession.playbackState = 'playing'; },
    pause: () => { el.pause(); navigator.mediaSession.playbackState = 'paused'; },
  });
  return true;
}

function pocketStop() {
  holdStop();
  mediaRelease();
}

// 音軌沒播起來，手錶上就不會有東西可按。這時要講出來，不要讓人白走一趟。
function pocketHealth() {
  const el = $('#hold');
  const bar = $('#pocket-bar');
  if (!bar || !session || !session.pocket) return;
  const bad = !el || el.paused;
  bar.classList.toggle('warn', bad);
  bar.textContent = bad
    ? '⚠ 音訊沒有播起來，手錶上不會出現控制。請改用畫面上的「下一步」。'
    : '口袋模式進行中　·　可以關螢幕了，用手錶上的 ⏭ 數珠';
}

// 手錶上顯示的就是這三行，所以要寫得一眼看得懂唸到哪裡。
function pocketSync() {
  if (!session || !session.pocket || !('mediaSession' in navigator) || !window.MediaMetadata) return;
  const step = STEPS[session.index];
  if (!step) return;
  let title = step.name;
  if (step.bead) title = `${step.name} ${step.bead.i}／${step.bead.total}`;
  else if (step.rep) title = `${step.name} ${step.rep.i}／${step.rep.total}`;
  navigator.mediaSession.metadata = new MediaMetadata({
    title,
    artist: `${step.stage} · ${SET.title}`,
    album: `第 ${session.index + 1} 步，共 ${STEPS.length} 步`,
    artwork: POCKET_ART,
  });
}

// 小米對背景很兇，走到一半整個被清掉是有可能的。每一珠都把進度寫下來，
// 下次打開才問得出「要接下去，還是記成一次」，不會白唸。
function saveProgress() {
  // 第一步還沒唸，沒有進度可言；記下來只會在首頁留一張沒有意義的卡片
  if (!session || !session.pocket || session.index === 0) return;
  try {
    localStorage.setItem(POCKET_KEY, JSON.stringify({
      startedAt: session.startedAt, index: session.index,
      set: session.set, mystery: session.mystery,
    }));
  } catch { /* 空間不足就不記，祈禱本身不該因此中斷 */ }
}
function clearProgress() {
  try { localStorage.removeItem(POCKET_KEY); } catch { /* 同上 */ }
}
function loadProgress() {
  try {
    const raw = JSON.parse(localStorage.getItem(POCKET_KEY) || 'null');
    if (!raw || typeof raw.index !== 'number' || raw.index < 0) return null;
    if (!SETS.some((x) => x.id === raw.set)) return null;
    return raw;
  } catch { return null; }
}

async function startPocket() {
  if (!(await pocketStart())) {
    toast('這部裝置不讓程式在背景播放，口袋模式開不起來');
    return;
  }
  startPrayer(true);
}

// 接續上次沒唸完的進度。要先把經文與奧蹟切回當時那一套。
async function resumePocket(saved) {
  if (!(await pocketStart())) {
    toast('這部裝置不讓程式在背景播放，口袋模式開不起來');
    return;
  }
  SET = setById(saved.set);
  MYSTERY = saved.mystery ? mysteryById(SET, saved.mystery) : null;
  rebuildSteps();
  history.pushState({ view: 'prayer' }, '');
  session = { startedAt: saved.startedAt || Date.now(), index: Math.min(saved.index, STEPS.length - 1),
              mode: 'guided', pocket: true, set: SET.id, mystery: MYSTERY ? MYSTERY.id : null };
  buildFullText();
  applyMode();
  go('prayer');
  pocketHealth();
}

// 「已經唸完了，記成一次」：手機在路上被系統清掉時用的。
// 時間取當時開始到現在，但封頂在兩小時——被清掉的那段常常隔了大半天，
// 照實算出來的秒數沒有意義。
function logProgress(saved) {
  const now = new Date();
  const secs = Math.min(7200, Math.max(1, Math.round((Date.now() - (saved.startedAt || Date.now())) / 1000)));
  records.push({ id: newId(), ts: now.toISOString(), mode: 'pocket', secs, note: '',
                 set: saved.set, mystery: saved.mystery || null });
  saveRecords();
  clearProgress();
  renderHome();
  toast('已記下一次');
}

function renderResume() {
  const saved = loadProgress();
  const card = $('#resume');
  if (!card) return;
  card.hidden = !saved;
  if (!saved) return;
  const set = setById(saved.set);
  const steps = buildSteps(set, saved.mystery ? mysteryById(set, saved.mystery) : null);
  const step = steps[Math.min(saved.index, steps.length - 1)];
  const where = step ? `${step.stage} · ${step.name}` : '';
  $('#resume-where').textContent =
    `${set.short || set.title}　第 ${saved.index + 1} 步，共 ${steps.length} 步${where ? `（${where}）` : ''}。`;
}

/* ── 口袋模式自我檢查 ──────────────────────────────── */
// 手錶按不動時，要分得出是這支程式沒把控制交出去，還是手錶那頭沒接上。
// 這裡把音軌單獨播起來、把控制登記好，然後把收到的按鍵數出來。

let probe = null;
function probeRender() {
  const out = $('#probe-out');
  const audio = $('#hold');
  if (!probe) { out.hidden = true; return; }
  const rows = [
    ['音訊播放中', audio && !audio.paused ? '是' : '否 — 手錶不會有控制'],
    ['音軌長度', audio && audio.duration ? `${Math.round(audio.duration)} 秒` : '讀取中'],
    ['媒體控制', probe.bound ? '已交給系統' : '這個瀏覽器不支援'],
    ['手錶按鍵', `⏭ ${probe.next}　⏮ ${probe.prev}　⏯ ${probe.toggle}`],
  ];
  out.textContent = '';
  for (const [k, v] of rows) {
    const li = el('li');
    li.appendChild(el('span', 'probe-k', k));
    li.appendChild(el('span', 'probe-v', v));
    out.appendChild(li);
  }
  out.hidden = false;
}

async function probeStart() {
  const ok = await holdPlay();
  probe = { next: 0, prev: 0, toggle: 0, bound: false };
  $('#probe-btn').textContent = '停止測試';
  if (!ok) { probeRender(); toast('這部裝置不讓程式播放音訊'); return; }
  const bump = (k) => { probe[k]++; probeRender(); };
  probe.bound = mediaBind({
    nexttrack: () => bump('next'),
    previoustrack: () => bump('prev'),
    // 測試時不真的暫停，否則按一下就沒得按了
    play: () => { holding.play().catch(() => {}); bump('toggle'); },
    pause: () => { holding.play().catch(() => {}); bump('toggle'); },
  });
  if ('mediaSession' in navigator && window.MediaMetadata) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: '測試中 — 請按手錶上的 ⏭',
      artist: '口袋模式自我檢查',
      album: '救主慈悲串經',
      artwork: POCKET_ART,
    });
  }
  $('#hold').addEventListener('loadedmetadata', probeRender, { once: true });
  probeRender();
}

function probeStop() {
  probe = null;
  holdStop();
  mediaRelease();
  $('#probe-btn').textContent = '開始測試';
  probeRender();
}

/* ── 祈禱流程 ──────────────────────────────────────── */
let session = null; // { startedAt, index, mode }

function startPrayer(pocket) {
  history.pushState({ view: 'prayer' }, '');
  rebuildSteps();
  // 口袋模式一律用引導模式：全文模式沒有逐珠，手錶上就無從數起。
  session = { startedAt: Date.now(), index: 0, mode: pocket ? 'guided' : settings.mode,
              pocket: !!pocket, set: SET.id, mystery: MYSTERY ? MYSTERY.id : null };
  buildFullText();
  applyMode();
  go('prayer');
  pocketHealth();
  if (!pocket) requestWake();   // 口袋模式是要關螢幕的，別把它撐著
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

function applyMode() {
  const guided = session.mode === 'guided';
  $('#pocket-bar').hidden = !session.pocket;
  $('#mode-toggle').hidden = !!session.pocket;
  $('#prayer-title').textContent = SET.title;
  $('#guided').hidden = !guided;
  $('#full').hidden = guided;
  $('#mode-toggle').textContent = guided ? '全文' : '引導';
  $('#step-prev').hidden = !guided;
  $('#step-next').textContent = guided ? '下一步' : '我已誦畢';
  if (guided) renderStep();
  else {
    $('#prayer-stage').textContent = MYSTERY ? MYSTERY.name : SET.title;
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
  if (step.bead) count = `第 ${step.bead.i} 珠，共 ${step.bead.total} 珠`;
  else if (step.rep) count = `第 ${step.rep.i} 遍，共 ${step.rep.total} 遍`;
  else if (step.kind === 'mystery') count = step.ref || '';
  else if (step.kind === 'decade') count = `第 ${step.decade} 端，共 ${SET.decades.count} 端`;
  $('#step-count').textContent = count;
  $('#step-name').classList.toggle('mystery', step.kind === 'mystery');

  renderBeads(step);
  setImage($('#guided-image'), null, imageForStep(step));

  const pct = (session.index / (STEPS.length - 1)) * 100;
  $('#progress-fill').style.width = `${pct}%`;
  $('.progress').setAttribute('aria-valuenow', Math.round(pct));

  $('#step-prev').disabled = session.index === 0;
  $('#step-next').textContent = last ? '我已誦畢' : '下一步';
  $('#tap-hint').textContent = last ? '輕觸畫面任一處完成' : '輕觸畫面任一處繼續';
  $('#prayer-scroll').scrollTop = 0;
  scrollCue();
  pocketSync();
  saveProgress();
}

// 奧蹟的經文比一句禱詞長得多，聖像又佔了位置，畫面底下常常還有沒讀到的字。
// 有下文時在底部透出一道漸層，才不會以為讀完了就輕觸過去。
function scrollCue() {
  const el = $('#prayer-scroll');
  if (!el) return;
  const more = el.scrollHeight - el.clientHeight - el.scrollTop > 8;
  $('#view-prayer').classList.toggle('more', more);
}

// 珠子的位置圖。珠串不一定在每端之中，長度也不一定是十：
// 玫瑰經開始時先唸三遍聖母經，每端則是十遍。
function renderBeads(step) {
  const wrap = $('#beads');
  wrap.textContent = '';
  const dots = (total, current, withLarge) => {
    if (withLarge) wrap.appendChild(makeBead('bead lg' + (current === 0 ? ' now' : ' on')));
    for (let i = 1; i <= total; i++) {
      wrap.appendChild(makeBead('bead' + (i < current ? ' on' : i === current ? ' now' : '')));
    }
  };
  if (step.bead) dots(step.bead.total, step.bead.i, step.kind === 'decade');
  else if (step.rep) dots(step.rep.total, step.rep.i, false);
  else if (step.decadeBeads) dots(step.decadeBeads, step.afterBeads ? step.decadeBeads + 1 : 0, true);
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
  // 唸完一串十顆最需要察覺，優先於其他訊號
  if (prev && prev.bead && prev.bead.total >= 10 && prev.bead.i === prev.bead.total) return BUZZ.decadeDone;
  if (next.kind === 'mystery' || next.decadeStart) return BUZZ.decade;
  if (next.bead) return next.bead.i === next.bead.total ? BUZZ.lastBead : BUZZ.bead;
  if (next.kind === 'closing') return BUZZ.closing;
  if (next.kind === 'decade') return BUZZ.bead;
  return BUZZ.opening;
}

function advance() {
  const last = session.index >= STEPS.length - 1;
  const prev = STEPS[session.index];
  // 頁面看不見時系統本來就不震，呼叫它只是徒然
  if (!document.hidden) buzz(buzzFor(prev, last ? null : STEPS[session.index + 1]));
  if (last) { finishPrayer(); return; }
  session.index++;
  renderStep();
  // 一端唸畢時明白顯示一下，睜眼時也看得出剛才過了一端
  if (prev.bead && prev.bead.total >= 10 && prev.bead.i === prev.bead.total) {
    flash(`${prev.stage} 圓滿`);
  }
}
function back() {
  if (!document.hidden) buzz(BUZZ.back);
  if (session.index > 0) { session.index--; renderStep(); }
}

/* ── 全文模式 ──────────────────────────────────────── */
let fullBuiltFor = null;
function buildFullText() {
  const key = `${SET.id}:${MYSTERY ? MYSTERY.id : ''}`;
  if (fullBuiltFor === key) return;
  const body = $('#full-body');
  body.textContent = '';

  const section = (name, text, badge, ref) => {
    const sec = el('div', 'full-sec');
    const h = el('h3');
    h.appendChild(document.createTextNode(name));
    if (badge) h.appendChild(el('span', 'rep', badge));
    sec.appendChild(h);
    sec.appendChild(el('p', 'prayer-text', text));
    if (ref) sec.appendChild(el('p', 'full-ref', ref));
    return sec;
  };
  const times = (n) => (n > 1 ? `${CN_NUM[n] || n}遍` : '一遍');

  const run = (items) => {
    for (const item of items) {
      const prayer = SET.prayers[item.prayer];
      if (prayer) body.appendChild(section(prayer.name, prayer.text, times(item.repeat || 1)));
    }
  };

  run(SET.opening || []);
  for (let d = 1; d <= SET.decades.count; d++) {
    body.appendChild(el('div', 'full-divider', `✣ 第${CN_NUM[d]}端 ✣`));
    if (SET.decades.mystery && MYSTERY) {
      const m = MYSTERY.mysteries[d - 1];
      if (m) body.appendChild(section(m.name, m.text, '默想', m.ref));
    }
    run(SET.decades.sequence);
  }
  body.appendChild(el('div', 'full-divider', '✣ 結束 ✣'));
  run(SET.closing || []);

  fullBuiltFor = key;
}

/* ── 完成 ─────────────────────────────────────────── */
let lastRecordId = null;

function finishPrayer() {
  const now = new Date();
  const secs = Math.max(1, Math.round((Date.now() - session.startedAt) / 1000));
  const record = { id: newId(), ts: now.toISOString(),
                   mode: session.pocket ? 'pocket' : session.mode, secs, note: '',
                   set: session.set, mystery: session.mystery };
  records.push(record);
  saveRecords();
  lastRecordId = record.id;

  setImage($('#done-image'), $('#done-caption'), imageForRole('done', records.length));
  $('#done-meta').textContent = `${fmtFullDate(now)}　${fmtTime(now)}　歷時 ${fmtDuration(secs)}`;
  $('#done-note').value = '';
  session = null;
  pocketStop();
  clearProgress();
  releaseWake();
  history.replaceState({ view: 'done' }, '');
  go('done');
}

// 中途離開要先確認，避免誤觸而失去進度。
function mayLeavePrayer() {
  return !(session && session.index > 0) || confirm('尚未誦畢，確定要離開嗎？此次不會留下紀錄。');
}
function leavePrayer() {
  // 進度刻意留著：中途離開常常是要改天接下去，首頁會問要接續還是記成一次。
  const keep = session && session.pocket && session.index > 0;
  session = null;
  pocketStop();
  releaseWake();
  if (!keep) clearProgress();
  renderHome();
  go('home');
}

/* ── 首頁 ─────────────────────────────────────────── */
// 手動挑的奧蹟只算今天；隔天回到依星期輪替。
function activeMystery(set) {
  if (!set.mysterySets) return null;
  if (settings.mystery && settings.mysteryDay === dayKey(new Date())) {
    return mysteryById(set, settings.mystery);
  }
  return mysteryForToday(set);
}

function renderPicker() {
  const picker = $('#set-picker');
  picker.textContent = '';
  picker.hidden = SETS.length < 2;
  for (const set of SETS) {
    const b = el('button', null, set.short || set.title);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(set.id === SET.id));
    b.addEventListener('click', () => {
      SET = set;
      MYSTERY = activeMystery(SET);
      settings.set = set.id;
      saveSettings();
      fullBuiltFor = null;
      renderHome();
    });
    picker.appendChild(b);
  }

  const pick = $('#mystery-pick');
  const sets = SET.mysterySets || [];
  pick.hidden = sets.length === 0;
  if (!sets.length) return;
  const sel = $('#mystery-select');
  sel.textContent = '';
  for (const m of sets) {
    const o = document.createElement('option');
    o.value = m.id;
    o.textContent = m.name;
    sel.appendChild(o);
  }
  sel.value = MYSTERY ? MYSTERY.id : sets[0].id;
}

function renderHome() {
  const today = new Date();
  $('#home-date').textContent = fmtFullDate(today);
  $('.home-title').textContent = SET.title;
  renderPicker();
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
  renderResume();
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
  const sel = $('#manual-set');
  sel.textContent = '';
  for (const set of SETS) {
    for (const m of set.mysterySets || [{ id: null, name: null }]) {
      const o = document.createElement('option');
      o.value = m.id ? `${set.id}:${m.id}` : set.id;
      o.textContent = m.name ? `${set.short || set.title} · ${m.name}` : (set.short || set.title);
      sel.appendChild(o);
    }
  }
  sel.value = SET.mysterySets && MYSTERY ? `${SET.id}:${MYSTERY.id}` : SET.id;
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

  const [setId, mysteryId] = $('#manual-set').value.split(':');
  records.push({
    id: newId(),
    ts: when.toISOString(),
    mode: 'offline',
    secs: 0,
    note: $('#manual-note').value.trim(),
    set: setId,
    mystery: mysteryId || null,
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

// 花瓣：根部收窄，約到一半高度張到最寬，再收成一個圓頭的尖。
// 刻意讓相鄰花瓣在根部相疊，疊出一層花，而不是一根根分開的放射狀。
const petalPath = (deg, half, r0, r1) => {
  const p = (r, d) => polar(r, d).map((n) => n.toFixed(1)).join(' ');
  const L = r1 - r0;
  const baseA = half * 0.26;
  const tipA = half * 0.13;
  return [
    `M${p(r0, deg - baseA)}`,
    `C${p(r0 + L * 0.18, deg - half * 0.92)} ${p(r0 + L * 0.52, deg - half)} ${p(r0 + L * 0.78, deg - half * 0.82)}`,
    `C${p(r0 + L * 0.93, deg - half * 0.56)} ${p(r1, deg - tipA * 2.6)} ${p(r1, deg - tipA)}`,
    `A${r1} ${r1} 0 0 1 ${p(r1, deg + tipA)}`,
    `C${p(r1, deg + tipA * 2.6)} ${p(r0 + L * 0.93, deg + half * 0.56)} ${p(r0 + L * 0.78, deg + half * 0.82)}`,
    `C${p(r0 + L * 0.52, deg + half)} ${p(r0 + L * 0.18, deg + half * 0.92)} ${p(r0, deg + baseA)}`,
    `A${r0} ${r0} 0 0 0 ${p(r0, deg - baseA)}`,
    'Z',
  ].join(' ');
};

const litClass = (n) => (n >= 3 ? 'lit3' : n === 2 ? 'lit2' : 'lit1');

// 一朵花承載兩套經文：外三層花瓣是慈悲串經，內兩層是玫瑰經。
// 每層自己一個顏色，層次才看得出來；各層半徑刻意相疊，內層的尖端壓在
// 外層的根部上，才像一朵花，而不是幾個同心圓。
const RINGS = [
  { set: 'chaplet', r0: 146, r1: 194, tone: 1 },
  { set: 'chaplet', r0: 112, r1: 158, tone: 2 },
  { set: 'chaplet', r0: 80, r1: 126, tone: 3 },
  { set: 'rosary', r0: 56, r1: 96, tone: 1 },
  { set: 'rosary', r0: 34, r1: 72, tone: 2 },
];

// 花瓣平均分到各層。一套經文的花瓣數＝當月天數，所以整朵開滿，
// 就是這個月每天都唸了一次。
function splitPetals(total, layers) {
  const base = Math.floor(total / layers);
  const extra = total % layers;
  return Array.from({ length: layers }, (_, i) => base + (i < extra ? 1 : 0));
}

// 當月的每一次誦唸，依時間先後排好。第一片花瓣就是這個月的第一次。
function monthSessions(setId, y, m) {
  return records
    .filter((r) => (r.set || 'chaplet') === setId)
    .map((r) => ({ r, at: new Date(r.ts) }))
    .filter((x) => x.at.getFullYear() === y && x.at.getMonth() === m)
    .sort((a, b) => a.at - b.at);
}

function renderRose() {
  const y = calMonth.getFullYear();
  const m = calMonth.getMonth();
  const total = new Date(y, m + 1, 0).getDate();
  const todayKey = dayKey(new Date());

  const sessions = new Map(SETS.map((set) => [set.id, monthSessions(set.id, y, m)]));
  const svg = svgEl('svg', { viewBox: '0 0 400 400', role: 'img', class: 'rose-svg' });
  svg.appendChild(svgEl('title', {})).textContent = `${y} 年 ${m + 1} 月的祈禱`;

  const days = new Set();
  const sizes = {};
  for (const set of SETS) {
    sizes[set.id] = splitPetals(total, RINGS.filter((r) => r.set === set.id).length);
    for (const x of sessions.get(set.id)) days.add(dayKey(x.at));
  }

  // 由外層畫到內層，內層的花瓣便疊在外層的根部上，像花一樣層層收攏。
  // 誦唸的次數由最外層依序點亮，所以唸得越多，花就從外往內開得越滿。
  const seen = {};
  const done = {};
  for (const ring of RINGS) {
    const layer = seen[ring.set] = (seen[ring.set] || 0);
    const n = sizes[ring.set][layer];
    seen[ring.set]++;
    if (!n) continue;
    const list = sessions.get(ring.set) || [];
    const set = SETS.find((x) => x.id === ring.set);
    const name = set ? (set.short || set.title) : ring.set;
    const base = done[ring.set] = (done[ring.set] || 0);
    done[ring.set] += n;
    const step = 360 / n;
    // 一層錯開半格，內層的花瓣便落在外層兩片之間，像花一樣交錯
    const skew = (seen[ring.set] % 2) ? step * 0.5 : 0;

    for (let i = 0; i < n; i++) {
      const at = base + i;                       // 這片是本月的第幾次誦唸
      // 唸滿一整朵還有剩的話，就再繞一圈，把同一片花瓣點得更深
      const rounds = list.length > at ? Math.floor((list.length - 1 - at) / total) + 1 : 0;
      const first = list[at];
      const key = first ? dayKey(first.at) : '';

      const petal = svgEl('path', {
        d: petalPath((i + 0.5) * step + skew, step * 0.54, ring.r0, ring.r1),
        class: `petal ${ring.set} tone${ring.tone} ${rounds ? litClass(rounds) : 'empty'}`
             + `${key && key === todayKey ? ' today' : ''}`,
        'data-set': ring.set, 'data-nth': at + 1, style: `--i:${i}`,
      });
      if (first) {
        petal.setAttribute('data-day', first.at.getDate());
        petal.setAttribute('data-key', key);
      }
      petal.appendChild(svgEl('title', {})).textContent = first
        ? `${m + 1} 月 ${first.at.getDate()} 日 · ${name}第 ${at + 1} 次`
        : `${name}第 ${at + 1} 次 · 還沒唸到`;
      petal.addEventListener('click', () => readPetal(set, list, at, total, m));
      svg.appendChild(petal);
    }
  }

  // 中心
  const sum = SETS.reduce((a, set) => a + sessions.get(set.id).length, 0);
  svg.appendChild(svgEl('circle', { cx: 200, cy: 200, r: 38, class: 'rose-core' }));
  svg.appendChild(svgEl('circle', { cx: 200, cy: 200, r: 31, class: 'rose-core-in' }));
  const count = svgEl('text', { x: 200, y: 198, class: 'rose-count' });
  count.textContent = String(sum);
  svg.appendChild(count);
  const label = svgEl('text', { x: 200, y: 216, class: 'rose-label' });
  label.textContent = sum ? `${days.size} 天` : '尚未誦唸';
  svg.appendChild(label);

  const rose = $('#rose');
  rose.textContent = '';
  rose.appendChild(svg);

  const parts = SETS.filter((set) => sessions.get(set.id).length)
    .map((set) => `${set.short || set.title} ${sessions.get(set.id).length} 次`);
  $('#rose-read').textContent = sum
    ? `本月 ${parts.join(' · ')}，共 ${days.size} 天。輕觸花瓣看那一次。`
    : '這個月還沒有紀錄。';
}

// span 是一朵花裡這套經文的花瓣總數；唸滿一朵之後，第 at+span 次會回到同一片。
function readPetal(set, list, at, span, m) {
  const rose = $('#rose');
  for (const el of rose.querySelectorAll('.petal.picked')) el.classList.remove('picked');
  const name = set ? (set.short || set.title) : '';

  const mine = [];
  for (let k = at; k < list.length; k += span) mine.push(list[k]);
  if (!mine.length) {
    for (const el of rose.querySelectorAll(`.petal[data-set="${set.id}"][data-nth="${at + 1}"]`)) {
      el.classList.add('picked');
    }
    $('#rose-read').textContent = `${name}第 ${at + 1} 次 · 還沒唸到`;
    return;
  }

  // 同一天可能唸了好幾次，也可能兩套經文都唸了。把那一天的花瓣全標起來，
  // 才看得出當天的全貌——它們不在同一個角度。
  const key = dayKey(mine[0].at);
  for (const el of rose.querySelectorAll(`.petal[data-key="${key}"]`)) el.classList.add('picked');

  // 奧蹟與意向分開收攏，各自去重，免得「痛苦五端」因為其中一次寫了意向而重複出現。
  const mysteries = [...new Set(mine.map((x) =>
    (x.r.mystery && set ? ((set.mysterySets || []).find((s) => s.id === x.r.mystery) || {}).name : '')
  ).filter(Boolean))];
  const notes = [...new Set(mine.map((x) => x.r.note).filter(Boolean))];

  const when = [...new Set(mine.map((x) => `${m + 1} 月 ${x.at.getDate()} 日`))].join('、');
  const head = `${when} · ${name}第 ${mine.map((x) => list.indexOf(x) + 1).join('、')} 次`;
  const detail = [mysteries.join('、'), notes.join('、')].filter(Boolean).join(' · ');
  $('#rose-read').textContent = detail ? `${head} — ${detail}` : head;
}

function renderHistory() {
  const days = dayCounts();
  renderStats($('#history-stats'), [
    [streak(), '連續天數'],
    [days.size, '誦念天數'],
    [records.length, '累計次數'],
  ]);
  renderRose();
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

  const set = SETS.find((x) => x.id === (r.set || 'chaplet'));
  const which = set ? (set.short || set.title) : '';
  const mystery = r.mystery && set
    ? ((set.mysterySets || []).find((m) => m.id === r.mystery) || {}).name
    : '';
  li.appendChild(el('span', 'note', [mystery || which, r.note].filter(Boolean).join(' · ')));
  const tag = r.mode === 'offline' ? '補記' : r.mode === 'pocket' ? '口袋' : '';
  li.appendChild(el('span', 'meta' + (tag ? ' tag' : ''), tag || fmtDuration(r.secs)));

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

const renderMonth = () => { renderRose(); renderCalendar(dayCounts()); };

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
    SETS.map((set) => {
      const m = (set.mysterySets || [])[0] || null;
      return `${set.short || set.title} ${buildSteps(set, m).length} 步`;
    }).join('、') + `，聖像 ${IMAGES.length} 張。所有紀錄只存在此裝置，不會上傳。`;

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

// 每個位置有三種狀態：沒設定（自動遞補）、自訂圖片、明確不用圖片。
const NO_PICTURE = 'none';
const pictureSetting = (key) => (settings.pictures || {})[key];

function customFor(key) {
  const id = pictureSetting(key);
  if (!id || id === NO_PICTURE) return null;
  const url = pictureUrls.get(id);
  if (!url) return null;
  const listed = imageRoles.get(key) || [];
  return { file: url, caption: listed.length ? listed[0].caption : '' };
}

// 較明確的設定蓋過較籠統的：玫瑰經自己設了就照它的，沒設才看共用的。
function settingFor(role) {
  const scoped = SET ? `${SET.id}:${role}` : role;
  return pictureSetting(scoped) !== undefined ? scoped : role;
}
const isNoPicture = (role) => pictureSetting(settingFor(role)) === NO_PICTURE;

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
    const slot = imageSlots().flatMap((g) => g.slots).find((sl) => sl[0] === role);
    toast(`已設定「${slot ? slot[1] : role}」的聖像`);
  } catch {
    toast('無法儲存圖片，可能是空間不足');
  }
}

async function setNoPicture(role) {
  settings.pictures = { ...(settings.pictures || {}), [role]: NO_PICTURE };
  saveSettings();
  await loadPictures();
  renderSlots();
  renderHome();
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
  const wrap = $('#slots');
  const wasOpen = new Set(
    [...wrap.querySelectorAll('details')].filter((d) => d.open).map((d) => d.dataset.group)
  );
  wrap.textContent = '';

  for (const group of imageSlots()) {
    // 位置很多（光是奧蹟就有二十端），預設收起來，要用時再展開。
    const box = el('details', 'slot-group-box');
    box.dataset.group = group.title;
    box.open = wasOpen.has(group.title);

    const set = group.slots.filter(([key]) => pictureSetting(key) !== undefined).length;
    const summary = el('summary', 'slot-group');
    summary.appendChild(el('span', 'slot-group-name', group.title));
    summary.appendChild(el('span', 'slot-group-count',
      set ? `${group.slots.length} 個位置 · ${set} 已設定` : `${group.slots.length} 個位置`));
    box.appendChild(summary);

    const list = el('ul', 'slot-list');
    for (const [key, label] of group.slots) {
      const none = pictureSetting(key) === NO_PICTURE;
      const custom = customFor(key);
      const li = el('li', 'slot');
      li.dataset.slot = key;

      if (none) {
        li.appendChild(el('span', 'slot-thumb slot-thumb-none', '—'));
      } else {
        const thumb = document.createElement('img');
        thumb.className = 'slot-thumb';
        setImage(thumb, null, slotCandidates(key));
        li.appendChild(thumb);
      }

      const text = el('div', 'slot-text');
      text.appendChild(el('span', 'slot-name', label));
      text.appendChild(el('span', 'slot-state', none ? '不用圖片' : custom ? '自訂圖片' : '預設'));
      li.appendChild(text);

      const actions = el('div', 'slot-actions');
      const button = (cls, text2, onClick) => {
        const b = el('button', `btn btn-tiny ${cls}`, text2);
        b.type = 'button';
        b.addEventListener('click', onClick);
        actions.appendChild(b);
      };
      button('', custom ? '更換' : '選圖', () => { slotTarget = key; $('#pic-file').click(); });
      if (!none) button('btn-quiet', '不用', () => setNoPicture(key));
      if (none || custom) button('btn-quiet', '還原', () => clearPicture(key));
      li.appendChild(actions);

      list.appendChild(li);
    }
    box.appendChild(list);
    wrap.appendChild(box);
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
        mode: ['guided', 'full', 'offline', 'pocket'].includes(r.mode) ? r.mode : 'guided',
        secs: Number.isFinite(r.secs) ? Math.max(0, Math.min(r.secs, 86400)) : 0,
        note: typeof r.note === 'string' ? r.note.slice(0, 80) : '',
        set: typeof r.set === 'string' ? r.set.slice(0, 40) : 'chaplet',
        mystery: typeof r.mystery === 'string' ? r.mystery.slice(0, 40) : null,
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
      const known = new Set(allSlotKeys());
      const roles = {};
      for (const [role, id] of Object.entries(parsed.pictureRoles)) {
        if (!known.has(role) || typeof id !== 'string') continue;
        if (id === NO_PICTURE || stored.has(id)) roles[role] = id;
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
  // 不能直接把 startPrayer 當處理器——click 事件會被當成「口袋模式」那個參數
  $('#start-btn').addEventListener('click', () => startPrayer(false));
  $('#pocket-btn').addEventListener('click', startPocket);
  $('#probe-btn').addEventListener('click', () => (probe ? probeStop() : probeStart()));
  $('#resume-go').addEventListener('click', () => {
    const saved = loadProgress();
    if (saved) resumePocket(saved);
  });
  $('#resume-log').addEventListener('click', () => {
    const saved = loadProgress();
    if (saved) logProgress(saved);
  });
  $('#resume-drop').addEventListener('click', () => {
    clearProgress();
    renderResume();
    toast('已刪掉那筆進度');
  });
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
  scroll.addEventListener('scroll', scrollCue, { passive: true });
  addEventListener('resize', scrollCue);
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

  $('#mystery-select').addEventListener('change', (e) => {
    MYSTERY = mysteryById(SET, e.target.value);
    settings.mystery = MYSTERY.id;
    settings.mysteryDay = dayKey(new Date());
    saveSettings();
    fullBuiltFor = null;
  });

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
    const embedded = inlineJSON('data-sets');
    INLINE = embedded !== null;
    let images;
    if (INLINE) {
      SETS = resolveShared(embedded);
      images = inlineJSON('data-images') || { images: [] };
    } else {
      const index = await fetch('data/sets.json').then((r) => r.json());
      SETS = resolveShared(await Promise.all(index.sets.map((s) => fetch(s.file).then((r) => r.json()))));
      images = await fetch('data/images.json').then((r) => r.json()).catch(() => ({ images: [] }));
    }
    SET = setById(settings.set);
    MYSTERY = activeMystery(SET);
    IMAGES = images.images || [];
    buildImageRoles();
    rebuildSteps();
  } catch {
    $('.boot-msg').textContent = '無法載入經文檔案，請確認 data/ 內的檔案齊全。';
    return;
  }

  document.title = SETS.map((s) => s.short || s.title).join(' · ');
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
