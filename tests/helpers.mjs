import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
// 雲端環境預裝的 Chromium 版本會換，這個連結總是指向目前那一版；本機沒有就用 Playwright 自己的
export const CHROME = process.env.CHROME_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
export const BASE = process.env.BASE_URL || 'http://localhost:8765/';
// 聖像位置很多，預設收起來；要操作某一格得先展開它所在的那一組。
export const openSlotGroup = (page, slot) => page.evaluate((s) => {
  const li = document.querySelector(`.slot[data-slot="${s}"]`);
  if (li && li.closest('details')) li.closest('details').open = true;
}, slot);

export const fixture = (name) => new URL(`./fixtures/${name}`, import.meta.url).pathname;

export async function launch(opts = {}) {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'zh-TW', ...opts,
  });
  const page = await context.newPage();
  const errors = [];
  // Playwright 預設會取消 confirm，導致「確定離開？」被當成否。
  // 這裡一律接受；要自行驗證對話框的測試先呼叫 autoDialog(false)。
  let auto = true;
  page.on('dialog', (d) => { if (auto) d.accept().catch(() => {}); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  // 資源載入失敗不是程式錯誤（清單可能列出尚未上傳的聖像）；
  // 要檢查這類請求的測試請自行監聽 response。
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('CONSOLE: ' + m.text());
  });
  return { browser, context, page, errors, autoDialog: (on) => { auto = on; } };
}

// 加圖、匯入備份都是非同步的（縮圖、寫進 IndexedDB），慢的機器要好幾秒。
// 等存檔真的變了、而且穩定下來才往下，不靠固定的等待時間。
export async function setFiles(page, selector, files) {
  const snap = () => page.evaluate(() =>
    `${localStorage.getItem('mercy.settings.v1') || ''}|${localStorage.getItem('mercy.records.v1') || ''}`);
  const before = await snap();
  await page.setInputFiles(selector, files);
  const end = Date.now() + 10000;
  let last = before, since = Date.now();
  while (Date.now() < end) {
    await page.waitForTimeout(150);
    const now = await snap();
    if (now !== last) { last = now; since = Date.now(); }
    else if (now !== before && Date.now() - since > 500) break;
  }
  await page.waitForTimeout(150);   // 讓畫面跟上
}
