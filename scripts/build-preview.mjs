// 把整個程式打包成單一 HTML 檔，供線上預覽用（正式安裝版仍使用分開的檔案）。
// 用法: node scripts/build-preview.mjs [輸出路徑]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const out = process.argv[2] || 'preview.html';
const read = (f) => readFileSync(f, 'utf8');

const MIME = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
const dataUri = (file) => {
  const ext = file.split('.').pop().toLowerCase();
  return `data:${MIME[ext] || 'application/octet-stream'};base64,${readFileSync(file).toString('base64')}`;
};

const index = JSON.parse(read('data/sets.json'));
const sets = index.sets.map((s) => JSON.parse(read(s.file)));
const images = JSON.parse(read('data/images.json'));

// 圖片改為內嵌，單檔才能離開資料夾獨立運作
let embedded = 0;
for (const image of images.images || []) {
  try { image.id = image.file; image.file = dataUri(image.file); embedded++; }
  catch { image.missing = true; }
}
images.images = (images.images || []).filter((i) => !i.missing);

// 讀經：五卷經文、事件對照與人物一併嵌入（後兩份檔案不在也沒關係，讀經照常運作）
const BIBLE_FILES = { mat: 'matthew', mrk: 'mark', luk: 'luke', jhn: 'john', act: 'acts' };
const bible = Object.fromEntries(Object.entries(BIBLE_FILES).map(([id, f]) => [id, read(`bible/${f}.md`)]));
bible.readme = read('bible/README.md');
const events = existsSync('data/gospel-events.json') ? JSON.parse(read('data/gospel-events.json')) : null;
const people = existsSync('data/people.json') ? JSON.parse(read('data/people.json')) : null;
// 修和聖事的內容同樣嵌入（沒有檔案也無妨，那一頁會顯示無法載入）
const confession = existsSync('data/confession.json') ? JSON.parse(read('data/confession.json')) : null;
// 九日敬禮同樣嵌入（沒有檔案也無妨，那一頁會顯示無法載入）
const novenas = existsSync('data/novenas.json') ? JSON.parse(read('data/novenas.json')) : null;

const html = read('index.html');
const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/)[1]
  .replace(/<script src="(?:bible-parse|app|bible|confession|novena)\.js"><\/script>\s*/g, '')
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

<script type="application/json" id="data-sets">${json(sets)}</script>
<script type="application/json" id="data-images">${json(images)}</script>
<script type="application/json" id="data-bible">${json(bible)}</script>
${events ? `<script type="application/json" id="data-events">${json(events)}</script>\n` : ''}${people ? `<script type="application/json" id="data-people">${json(people)}</script>\n` : ''}${confession ? `<script type="application/json" id="data-confession">${json(confession)}</script>\n` : ''}${novenas ? `<script type="application/json" id="data-novenas">${json(novenas)}</script>\n` : ''}<script>
${read('app.js')}
</script>
<script>
${read('bible-parse.js')}
</script>
<script>
${read('bible.js')}
</script>
<script>
${read('confession.js')}
</script>
<script>
${read('novena.js')}
</script>
`;

writeFileSync(out, page);
console.log(`${out} — ${(Buffer.byteLength(page) / 1024).toFixed(0)} KB, `
  + `${sets.length} prayer sets, ${embedded} images embedded, Bible text${events ? ` + ${events.events.length} events` : ' (no event table)'}`
  + `${people ? `, ${people.people.length} people` : ' (no people table)'}`
  + `${confession ? ', confession text' : ' (no confession text)'}`
  + `${novenas ? ', novena text' : ' (no novena text)'}`);
