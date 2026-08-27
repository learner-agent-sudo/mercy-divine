import { chromium } from 'playwright';
export const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
export const BASE = process.env.BASE_URL || 'http://localhost:8765/';
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
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  return { browser, context, page, errors, autoDialog: (on) => { auto = on; } };
}
