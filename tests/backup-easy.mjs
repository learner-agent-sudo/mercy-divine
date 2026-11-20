// 備份更容易：分享到雲端或傳給自己、上次備份的紀錄、首頁提醒、.txt 也能匯入。
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASE, launch } from './helpers.mjs';

const { browser, context: first } = await launch();
await first.close();

const pad = (n) => String(n).padStart(2, '0');
const dayOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return dayOf(d); };
const TODAY = daysAgo(0);
let failures = 0;
const ok = (label, pass) => { console.log(`${pass ? 'PASS' : 'FAIL ***'}  ${label}`); if (!pass) failures++; };

// 每個情境一個新的瀏覽器情境（獨立的 localStorage），方便各自設定
const errors = [];
const outbound = [];
const contexts = [];
async function fresh(stub) {
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'zh-TW',
    serviceWorkers: 'block', acceptDownloads: true,
  });
  contexts.push(context);
  if (stub) await context.addInitScript(stub.fn, stub.arg);
  const page = await context.newPage();
  page.on('request', (r) => { if (new URL(r.url()).hostname !== 'localhost') outbound.push(r.url()); });
  page.on('dialog', (d) => { d.accept().catch(() => {}); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('CONSOLE: ' + m.text());
  });
  return page;
}

// 模擬手機的分享：記下收到的檔案；mode 'abort' 時模擬使用者取消
const shareStub = (mode) => ({
  arg: mode,
  fn: (m) => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (d) => {
        if (m === 'abort') throw new DOMException('cancelled', 'AbortError');
        window.__shared = { name: d.files[0].name, type: d.files[0].type, text: await d.files[0].text(), title: d.title };
      },
    });
  },
});
const noShareStub = { arg: null, fn: () => { Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined }); } };

// 寫入紀錄與備份狀態，然後重新載入首頁
async function seed(page, { records = null, backup = null } = {}) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(({ records, backup }) => {
    localStorage.clear();
    if (records) localStorage.setItem('mercy.records.v1', JSON.stringify(records));
    if (backup) localStorage.setItem('mercy.backup.v1', JSON.stringify(backup));
  }, { records, backup });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#view-home.active');
}
const rec = (id = 'r1') => ({ id, ts: new Date().toISOString(), mode: 'guided', secs: 60, note: '', set: 'chaplet', mystery: null });
const backupState = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mercy.backup.v1') || 'null'));
const toastText = (page) => page.textContent('#toast');

// ── 1. 分享到雲端或傳給自己 ──────────────────────────
{
  const page = await fresh(shareStub('ok'));
  await seed(page, { records: [rec('share-1')] });
  await page.click('[data-go="settings"]');
  ok('settings shows the share button when files can be shared', await page.isVisible('#share-btn'));
  await page.click('#share-btn');
  await page.waitForFunction(() => !!window.__shared, null, { timeout: 5000 }).catch(() => {});
  const shared = await page.evaluate(() => window.__shared);
  ok('the share hands over one file named mercy-backup-<today>.txt', !!shared && shared.name === `mercy-backup-${TODAY}.txt`);
  ok('the file is text/plain and titled 祈禱紀錄備份', !!shared && shared.type === 'text/plain' && shared.title === '祈禱紀錄備份');
  const parsed = shared ? JSON.parse(shared.text) : {};
  ok('its text is the backup: app, version 7, and the seeded record',
     parsed.app === 'mercy-divine' && parsed.version === 7 && parsed.records.length === 1 && parsed.records[0].id === 'share-1');
  const st = await backupState(page);
  ok('after sharing, the backup day is recorded as today', !!st && st.last === TODAY && !st.snooze);
  ok('and the settings line says 上次備份 … （今天）',
     /^上次備份：\d+月\d+日（今天）$/.test(await page.textContent('#backup-last')));
  ok('the toast says 已備份', (await toastText(page)) === '已備份 1 筆紀錄');
  await page.close();
}

// ── 2. 分享被取消：不記成已備份，也不下載 ─────────────
{
  const page = await fresh(shareStub('abort'));
  let downloads = 0;
  page.on('download', () => { downloads++; });
  await seed(page, { records: [rec('cancel-1')] });
  await page.click('[data-go="settings"]');
  await page.click('#share-btn');
  await page.waitForTimeout(700);
  const st = await backupState(page);
  ok('a cancelled share records no backup', !st || !st.last);
  ok('a cancelled share downloads nothing', downloads === 0);
  ok('and shows no failure toast', !/無法分享/.test(await toastText(page)));
  await page.close();
}

// ── 3. 不能分享檔案：不顯示分享鈕，存到下載資料夾照常 ──
{
  const page = await fresh(noShareStub);
  await seed(page, { records: [rec('plain-1')] });
  await page.click('[data-go="settings"]');
  ok('without file sharing the share button stays hidden', await page.isHidden('#share-btn'));
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), page.click('#export-btn')]);
  ok(`export downloads mercy-chaplet-records-${TODAY}.json`, download.suggestedFilename() === `mercy-chaplet-records-${TODAY}.json`);
  const file = JSON.parse(readFileSync(await download.path(), 'utf8'));
  ok('the downloaded file holds the record', file.records.length === 1 && file.version === 7);
  await page.waitForTimeout(200);
  const st = await backupState(page);
  ok('the export records the backup day', !!st && st.last === TODAY);
  ok('the settings line reflects it', /（今天）$/.test(await page.textContent('#backup-last')));
  await page.close();
}

// ── 4. 首頁提醒 ─────────────────────────────────────
{
  const page = await fresh(null);
  await seed(page, { records: [rec('nudge-1')], backup: { seen: daysAgo(8) } });
  ok('nudge shows: never backed up, first seen 8 days ago',
     !(await page.isHidden('#backup-nudge')) && (await page.textContent('#backup-nudge-text')).startsWith('還沒有備份過'));
  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  ok('home with the nudge has no horizontal scroll', noOverflow);

  await seed(page, { records: [rec('nudge-2')], backup: { seen: daysAgo(30), last: daysAgo(20) } });
  ok('nudge says 上次備份是 20 天前',
     (await page.textContent('#backup-nudge-text')).startsWith('上次備份是 20 天前。'));

  await seed(page, { records: [rec('nudge-3')], backup: { seen: daysAgo(30), last: daysAgo(3) } });
  ok('last backup 3 days ago: no nudge', await page.isHidden('#backup-nudge'));

  await seed(page, { records: null, backup: null });
  ok('no data at all: no nudge', await page.isHidden('#backup-nudge'));

  await seed(page, { records: [rec('nudge-4')], backup: { seen: daysAgo(8) } });
  await page.click('#nudge-later');
  ok('later hides the nudge', await page.isHidden('#backup-nudge'));
  const st = await backupState(page);
  ok('later stores a snooze for today', !!st && st.snooze === TODAY);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#view-home.active');
  ok('and it stays hidden after reload', await page.isHidden('#backup-nudge'));
  await page.close();
}
{
  const page = await fresh(shareStub('ok'));
  await seed(page, { records: [rec('nudge-5')], backup: { seen: daysAgo(8) } });
  ok('with file sharing, the nudge is shown', !(await page.isHidden('#backup-nudge')));
  await page.click('#nudge-now');
  await page.waitForFunction(() => !!window.__shared, null, { timeout: 5000 }).catch(() => {});
  ok('立即備份 shares the backup', await page.evaluate(() => !!window.__shared));
  ok('and hides the nudge afterwards', await page.isHidden('#backup-nudge'));
  await page.close();
}

// ── 5. 匯入 .txt（分享出去的檔案）──────────────────────
{
  const page = await fresh(shareStub('ok'));
  await seed(page, { records: [rec('txt-1')] });
  await page.click('[data-go="settings"]');
  await page.click('#share-btn');
  await page.waitForFunction(() => !!window.__shared, null, { timeout: 5000 }).catch(() => {});
  const text = await page.evaluate(() => window.__shared.text);
  const dir = mkdtempSync(join(tmpdir(), 'mercy-backup-easy-'));
  const txtPath = join(dir, `mercy-backup-${TODAY}.txt`);
  writeFileSync(txtPath, text);
  await page.evaluate(() => { localStorage.removeItem('mercy.records.v1'); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('[data-go="settings"]');
  await page.setInputFiles('#import-file', txtPath);
  await page.waitForFunction(() => /已匯入/.test(document.querySelector('#toast').textContent), null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  const back = await page.evaluate(() => JSON.parse(localStorage.getItem('mercy.records.v1') || '[]'));
  ok('a .txt backup imports and the record comes back', back.length === 1 && back[0].id === 'txt-1');
  await page.close();
}

// ── 6. 設定頁沒有溢出 ───────────────────────────────
{
  const page = await fresh(shareStub('ok'));
  await seed(page, { records: [rec('layout-1')], backup: { seen: daysAgo(8) } });
  await page.click('[data-go="settings"]');
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  ok('settings has no horizontal scroll', fits);
  await page.close();
}

for (const c of contexts) await c.close();
await browser.close();

console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'no console errors');
ok('no console errors', errors.length === 0);
ok('nothing left the device', outbound.length === 0);
process.exit(failures || errors.length || outbound.length ? 1 : 0);
