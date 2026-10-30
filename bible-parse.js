/* 讀經：把 bible/ 內的經文檔拆成章、節與思高的小標題。
   不碰畫面，網頁與測試腳本都用同一份。

   檔案的樣子：第一行是書名；「第一章」這樣的一行開始新的一章；
   「1:1」這樣單獨一行是節號，下面幾行是這一節的經文（轉檔時被折成好幾行，
   有時中間還夾著空行）；前後各隔一行空行、沒有標點的短句是小標題。 */

const BIBLE_BOOKS = [
  { id: 'mat', abbr: '瑪', file: 'bible/matthew.md' },
  { id: 'mrk', abbr: '谷', file: 'bible/mark.md' },
  { id: 'luk', abbr: '路', file: 'bible/luke.md' },
  { id: 'jhn', abbr: '若', file: 'bible/john.md' },
  { id: 'act', abbr: '宗', file: 'bible/acts.md' },
];

// 經文裡會有、小標題裡不會有的標點
const SENTENCE_MARK = /[，。；：、！？「」『』“”]/;

function parseBook(raw) {
  const lines = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const verseMark = /^(\d+)[:;：](\d+)(?:-(\d+))?$/;    // 有一處把 22:17 打成了 22;17
  const chapterMark = /^第[一二三四五六七八九十百○〇零]+章$/;
  const noteMark = /^（\d+）$/;

  // stray：不屬於任何一節、也不像標題的文字。正常應該是空的，測試會檢查。
  const book = { title: lines[0].trim(), chapters: [null], sections: [], stray: [] };
  let verse = null;          // 正在收經文的那一節
  let chapter = 0;
  let pending = [];          // 還沒碰到經文的連續標題：最後一個是小段標題，前面的是大段
  let blank = true;          // 上一行是空行（或剛開始）
  let skipNote = false;      // 註解號碼下一行是註解內容，不是經文

  for (const line of lines.slice(1)) {
    const s = line.trim();
    if (!s) { blank = true; continue; }
    if (skipNote) { skipNote = false; blank = false; continue; }
    if (noteMark.test(s)) { skipNote = true; blank = false; continue; }

    const m = s.match(verseMark);
    if (m) {
      const c = Number(m[1]);
      let v = Number(m[2]);
      if (c !== chapter) { chapter = c; book.chapters[c] = []; }
      const list = book.chapters[c];
      const last = list[list.length - 1];
      // 節號打錯成跟上一節一樣（若 13:13 被印成 13:12），就當作下一節
      if (last && v <= (last.to || last.v)) v = (last.to || last.v) + 1;
      verse = { v, t: '' };
      if (m[3]) verse.to = Number(m[3]) + (v - Number(m[2]));
      list.push(verse);
      if (pending.length) {
        book.sections.push({ title: pending[pending.length - 1], parts: pending.slice(0, -1), c, v });
        pending = [];
      }
      blank = false;
      continue;
    }
    if (chapterMark.test(s)) { verse = null; blank = false; continue; }

    const heading = (blank || !verse) && !SENTENCE_MARK.test(s) && s.length <= 40;
    if (heading) { pending.push(s); verse = null; }
    else if (verse) verse.t += s;
    else if (pending.length && chapter && book.chapters[chapter].length) {
      // 思高本的小標題有時落在一節中間（宗 9:19 的下半句屬於下一段）：
      // 下半句另成一筆，同一個節號，標上 cont，新的一段從這裡開始
      const list = book.chapters[chapter];
      const prev = list[list.length - 1];
      verse = { v: prev.v, t: s, cont: true };
      if (prev.to) verse.to = prev.to;
      list.push(verse);
      book.sections.push({ title: pending[pending.length - 1], parts: pending.slice(0, -1), c: chapter, v: prev.v, cont: true });
      pending = [];
    } else book.stray.push(s);
    blank = false;
  }
  // 「＊」標的是思高本略去的一節（宗 28:29），經文裡不必顯示
  for (const list of book.chapters) for (const verse of list || []) verse.t = verse.t.replace(/＊/g, '');
  return book;
}

if (typeof module !== 'undefined') module.exports = { BIBLE_BOOKS, parseBook };
