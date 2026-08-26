// 把整個程式打包成單一 HTML 檔，供線上預覽用（正式安裝版仍使用分開的檔案）。
// 用法: node scripts/build-preview.mjs [輸出路徑]
import { readFileSync, writeFileSync } from 'node:fs';

const out = process.argv[2] || 'preview.html';
const read = (f) => readFileSync(f, 'utf8');

const MIME = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
const dataUri = (file) => {
  const ext = file.split('.').pop().toLowerCase();
  return `data:${MIME[ext] || 'application/octet-stream'};base64,${readFileSync(file).toString('base64')}`;
};

const prayers = JSON.parse(read('data/prayers.json'));
const images = JSON.parse(read('data/images.json'));

// 圖片改為內嵌，單檔才能離開資料夾獨立運作
let embedded = 0;
for (const image of images.images || []) {
  try { image.file = dataUri(image.file); embedded++; }
  catch { image.missing = true; }
}
images.images = (images.images || []).filter((i) => !i.missing);

const html = read('index.html');
const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/)[1]
  .replace(/<script src="app\.js"><\/script>/, '')
  .replace(/<link rel="stylesheet"[^>]*>/, '')
  .trim();
const title = html.match(/<title>([^<]*)<\/title>/)[1];

// JSON 內的 </script> 會提前結束區塊，須先轉義
const json = (value) => JSON.stringify(value).replace(/<\//g, '<\\/');

const page = `<title>${title}</title>
<style>
${read('styles.css')}
</style>

${body}

<script type="application/json" id="data-prayers">${json(prayers)}</script>
<script type="application/json" id="data-images">${json(images)}</script>
<script>
${read('app.js')}
</script>
`;

writeFileSync(out, page);
console.log(`${out} — ${(Buffer.byteLength(page) / 1024).toFixed(0)} KB, ${embedded} images embedded`);
