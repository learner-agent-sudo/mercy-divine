# 玫瑰經 · 救主慈悲串經 — Rosary and Divine Mercy Chaplet

An offline prayer app for praying the Rosary and the Chaplet of Divine Mercy in
Traditional Chinese, with a record of every time you finish.

Once installed on your phone it works **entirely offline** — no signal, no wifi, no
account. Your prayer records are stored on the phone only and are never uploaded
anywhere.

## Installing on your phone

1. Turn on GitHub Pages for this repository: **Settings → Pages → Source: Deploy from a
   branch**, pick this branch and the `/ (root)` folder. GitHub gives you a URL like
   `https://learner-agent-sudo.github.io/mercy-divine/`.
2. Open that URL **in Chrome** on the phone, once, with internet.
   (Use Chrome rather than Mi Browser — Chrome installs it as a real app; Mi Browser
   only makes a bookmark.)
3. Chrome menu **⋮ → Add to Home screen → Install**.
4. Done. From now on you can open it from the home screen icon with no internet at all.

### Two things worth knowing on HyperOS

- **Don't let a cleaner wipe it.** Chrome's *Clear browsing data*, and HyperOS's deep
  clean, can erase the prayer records along with site data. Export a backup now and
  then (設定 → 匯出備份檔).
- The app asks Android for persistent storage on first use, which helps but is not a
  guarantee. The export file is the real safety net.

## Using it

- **開始祈禱** starts a session. Two modes, switchable at any time with the button in
  the top-right corner:
  - **引導模式** — one prayer at a time, tap anywhere to advance. It counts the beads
    and decades for you, so you don't need a physical chaplet.
  - **全文模式** — the whole chaplet on one scrolling page, as in a prayer book.
- **我已誦畢** at the end records the session — date, time, how long it took, and an
  optional intention.
- **祈禱紀錄** shows a calendar of the days you prayed, your streak, and every session.
- The screen stays awake while praying, and the text size is adjustable in 設定.

## The two prayers

The home screen picks between 救主慈悲串經 and 玫瑰經. The chaplet is 64 steps; a rosary
is 78 — sign of the cross, creed, Our Father, three Hail Marys and a Glory Be, then five
decades each opening with its mystery and scripture, followed by Our Father, ten Hail
Marys, the Glory Be and the Fátima prayer, closing with the Salve Regina.

The mysteries follow the week without being asked: 歡喜 on Monday and Saturday, 痛苦 on
Tuesday and Friday, 榮福 on Wednesday and Sunday, 光明 on Thursday. Choosing a different
set on the home screen applies to that day only — the next day returns to the cycle, so a
one-off choice for a feast never quietly becomes permanent.

天主經, 聖母經 and 信經 are the same prayer in both, so the rosary points at the chaplet's
copy rather than repeating it — `{"from": "chaplet"}` in place of the text. Edit the
wording once and both follow. A prayer only one of them uses keeps its own text.

## Bible reading (讀經)

A third thing on the home screen, separate from the two prayers: the four Gospels and the
Acts of the Apostles in the 思高 translation, with a record of what you have read so you
do not re-read it. **打開讀經** opens it; **繼續讀** goes straight to the next section you
have not finished.

- **書卷** — the five books with progress, a chapter grid per book, and a search box (verse
  text and 思高 section headings, at least two characters).
- **事件** — the life of Jesus as one timeline in harmony order, grouped by phase. Each event
  shows which Gospels tell it (瑪 谷 路 若) or 獨有 if only one does.
- **主題** — miracles (healing, exorcism, nature, raising the dead), parables and
  discourses, each with its key verse.
- **人物** — who said what. People are listed by group (the Twelve, the early Church, …); a
  person's screen is his own words in order of his life, folded into stages like the event
  timeline (only the stage with the first thing you have not read starts open; 全部展開 opens
  them all, and the open stages are remembered until you close the app). Each saying shows the
  verses, with the key verse set apart; if the Gospels tell it differently there is a small tab
  per book, and a reply (say, 耶穌回答) is shown under it. A long passage (more than five verses)
  shows just the key verse until you tap 展開全段. 對照 chips jump to a related saying, and
  **看上下文** opens the event it belongs to (or, for Acts, the chapter at that verse). A ✓
  means every verse of the saying is read — it follows your existing reading record, there is
  nothing to mark here. The event screen and the chapter view of Acts point back with a row
  **這裡說話的人：**.
- **紀錄** — what you read and when, by day.

In a chapter, each 思高 section ends with a **讀完了** button (tap again to undo) and, where
the other Gospels tell the same story, chips that open that event. Each Gospel's account of
an event is counted separately, but if you already read it in another Gospel the page says
so. The same verses show as read everywhere they appear.

Progress is kept on the phone (`mercy.bible.v1`) and is part of the backup file. The text is
in [`bible/`](bible/) (see its README for the source and licence), parsed in the browser by
[`bible-parse.js`](bible-parse.js); the event table is
[`data/gospel-events.json`](data/gospel-events.json) and the people are in
[`data/people.json`](data/people.json) (the shape is checked by `node tests/people.mjs`).
Without the event table the books and progress still work, and without the people file
there is simply no 人物 tab.

## 修和聖事 (confession)

Another card on the home screen, separate from the prayers and the Bible: the sacrament of
confession, for getting ready before going and for the words said inside the confessional.
**準備辦告解** opens the steps; **告明時** opens the rite.

The screen has three tabs, in this order:

- **步驟** — the six steps (省察 痛悔 定改 告明 赦罪 補贖), each a card that opens to its points.
  省察 has a **開始省察** button; 告明 links to the rite.
- **省察** — the examination of conscience in three forms (第一式 by the Ten Commandments, the Four
  Precepts of the Church and the Seven Deadly Sins; 第二式 by the Gospel; 第三式 by attitudes to
  faith, others and oneself). The chosen form is remembered. Each part's sections open as cards, and
  each item is ticked as you go; a ticked item can be counted up with − n + (for example, three times
  the same sin). The 天主十誡 card at the top of 第一式 is for reference. Below the list, **其他（自己寫）**
  takes anything not on the list, and **清除勾選** empties the ticks and the note.
- **告明時** — the ten steps of the rite in order, each with who speaks (懺悔者 / 神父 / 一起) and
  the stage direction. The penitent's words have the gold border used for key verses; the priest's
  are plain. Step 3 gives how long since the last confession and, under it, **我的省察**: the ticked
  items with their source (for example 第一式 · 第一誡), the note, and a link back to 省察. Step 5
  shows the 痛悔經; there are six, chosen with the buttons 一 to 六 (the default is 二).
  At the foot, **今天已辦告解** records today's date (on the phone's clock) after a confirm, and
  clears the ticks and the note, since they have been brought to confession. The home card then shows
  **上次告解** and how long ago. A mistaken date is undone with **移除** beside it.

The text is [`data/confession.json`](data/confession.json) — plain wording, edited like the
prayers. The examination items are there too (190 in all), in `exams`; the 天主十誡 in `decalogue`.

The dates are kept on the phone (`mercy.confession.v1`) and are part of the backup file; importing
adds the dates it does not already have, and never one in the future. The ticks and the note are
kept separately (`mercy.examen.v1`) and are **not** in the backup, and an import never writes them:
they are for the examination at hand, and are cleared once the confession is recorded.

## 九日敬禮 (novenas)

Another card on the home screen: novenas, prayed every day for nine days in a row. **打開** lists
them; **念第 N 天** (once one is under way) opens the next day. The first novena is the 煉靈九日敬禮
(for the souls in purgatory): nine days, each with a theme, the souls' answer, their appeal, and the
closing prayers (天主經 and 聖母經 open on the page).

- The day screen has the question, the answer and the appeal, then the closing prayer and the
  two prayers, which open to show their text. **念完第 N 天** marks the day with today's date (after the ninth, every day reads 九天都念完了 until tomorrow);
  **取消這天的紀錄** undoes it after a confirm. ‹ and › move between days.
- Each novena keeps one run at a time. The screen shows how many days are done and when it began.
  If a day was missed, it says how many days have passed and that you can carry on or start again;
  **重新開始** clears the run.
- **為誰祈禱（可留空）** is kept with the novena across runs, and is copied into the record when
  the ninth day is marked. Finished novenas are listed under the novena with their dates.

The text is [`data/novenas.json`](data/novenas.json), written in the same way as the prayers. Nothing in
the code names a particular novena: a new one is another entry in `novenas`.

The progress, the finished runs and the intentions are kept on the phone (`mercy.novena.v1`) and are
part of the backup file; importing adds what is not already there, and never replaces what is on the
phone.

## Changing the content

**The prayers** live in [`data/prayers.json`](data/prayers.json) (the chaplet) and
[`data/rosary.json`](data/rosary.json) — plain text, no code. Both use the same shape:
`prayers` holds each text once, and `opening`, `decades.sequence` and `closing` point at
them by name, with `repeat` for how many times and `bead` for the runs that get a bead
row. Edit the wording, change the number of decades, or add a whole third prayer by
writing another file and listing it in [`data/sets.json`](data/sets.json).

**The pictures** go in [`images/`](images/), listed in
[`data/images.json`](data/images.json):

```json
{ "file": "images/jesus-1.jpg", "caption": "耶穌，我信賴祢", "for": ["hail-mary"] }
```

`for` matches a picture to the prayer being said, so the image changes as you move
through the prayer. One picture can cover several prayers. Prefix a name with a prayer's
id — `rosary:hail-mary` — to use it in that prayer only; an unprefixed name serves both.
Each of the twenty mysteries has its own name — `joyful-1` … `glorious-5` — so the same
decade number carries a different picture in each set. It appears on the screen that
announces the mystery and there only: the Our Father that follows shows the Our Father's
picture, the ten Hail Marys show the Hail Mary's. `decade-1` … `decade-5` work the same
way for that decade number across all four sets. Anything with no match falls back
to the `home` picture, so no screen is ever left blank.

設定 → 聖像 lists every place an image can go, in collapsible groups — one per prayer and
one per set of mysteries, each named — and picks one from the phone for any of them. There
are nearly forty places in all, so the groups start closed with a count beside each. Each slot has three states: **預設** falls back through the chain
below, **自訂圖片** is one you chose, and **不用** leaves that screen with no picture at
all — the frame closes and the words get the room. 不用 is a real choice, not an absence:
nothing is borrowed from elsewhere to fill the gap, and 還原 returns the slot to 預設. Each prayer has its **own cover** (封面, the home screen) and its
own closing picture (誦畢), so the Rosary and the chaplet can carry different covers, plus
a slot for every prayer within it and one for each of the Rosary's five mysteries. Where
a slot has nothing of its own it shows the matching picture from the other prayer, then
the `home` picture, so the shared prayers look alike until you decide otherwise and no
screen is left blank.

In `data/images.json` a plain name serves both prayers and a prefixed one serves just
that prayer, so `"for": ["rosary:home"]` is the Rosary's cover while `"for": ["home"]`
is the fallback for both. The names are:

| name             | shown during                        |
|------------------|-------------------------------------|
| `home`           | the home screen                     |
| `our-father`     | 天主經                               |
| `hail-mary`      | 聖母經                               |
| `creed`          | 信經                                 |
| `eternal-father` | 大珠 — 永生之父⋯                      |
| `passion`        | 小珠 — 因祂的至悲慘苦難⋯                |
| `holy-god`       | 結束祈禱 — 至聖天主⋯                   |
| `jesus-king`     | 信賴禱詞 — 主耶穌，慈悲的君王⋯          |
| `done`           | the completion screen               |

Leave `for` out entirely and the pictures simply cycle by decade instead — the first
picture for the first decade, and so on.

Pictures are shown whole, never cropped, so portrait icons and wide paintings both work.
A file listed here but missing from disk hides its frame rather than showing a broken
image. The three `placeholder-*.svg` files are stand-ins — replace them with your own and
delete them. Keep each under about 300 KB so the app stays quick to install.

Pictures listed here are part of the site: every device that opens it sees them, and
they are cached for offline use. The nine currently in `images/` come to about 2.5 MB
in total, downloaded once when the app installs. They are also what the service worker downloads on
install, so keep the set to a few MB in total or the first install gets slow.

### Or just pick them on the phone

You don't have to touch the repository at all. **設定 → 聖像** lists the nine places a
picture appears and lets you choose one from the phone's gallery for each. Chosen
pictures are stored on the device, override anything in `data/images.json`, and are
included in the backup file, so they survive a new phone. 還原 puts the built-in one back.

Pictures picked this way are scaled down to 1600px on the long edge and re-encoded, so a
4000px phone photo becomes a few tens of KB. The same picture assigned to several places
is stored once, not once per place.

**They stay on that one device.** Browser storage is per-device and per-browser, so a
picture chosen on a laptop does not appear on a phone. To carry them across, export a
backup on the first device and import it on the second. To have every device show the
same pictures without any of that, put the files in `images/` as above — that is the
copy that belongs to the site itself.

**After changing anything, bump `VERSION` in [`sw.js`](sw.js)** (`v1` → `v2`). That is
what tells already-installed phones to fetch the new version — without it they keep
serving the old cached copy. The app shows a 已有新版本 banner when an update is ready.

## Backups

設定 → **匯出備份檔** writes a `.json` file to Downloads with every record, your custom pictures, your Bible reading progress, your confession dates and your novena progress. **匯入備份檔**
reads one back, skipping anything already present — so it is safe to import the same
file twice, and it works for moving to a new phone.

## Running it locally

The app loads its content with `fetch`, so it needs to be served over HTTP rather than
opened as a file:

```sh
python3 -m http.server 8765     # then open http://localhost:8765/
```

## Previewing without installing

`node scripts/build-preview.mjs preview.html` bundles the whole app — text, images,
styles and code — into one self-contained HTML file that runs from anywhere, including
straight off disk. Useful for a quick look on a desktop or for sharing a link. It is a
preview only: backup export/import and offline install need the real deployment above.

## Praying with your eyes closed

The count is carried by vibration, so it can be followed without looking. Five signals,
each distinguishable from the others by length and rhythm:

| when you tap | you feel | meaning |
|---|---|---|
| an opening prayer | one short pulse | still in 天主經 / 聖母經 / 信經 |
| beads 1–8 | one pulse | another bead counted |
| bead 9 | two pulses | the next one is the tenth |
| bead 10 | three pulses | that decade is complete |
| the last repetition | four pulses | the whole chaplet is finished |

A phone cannot vary how *hard* it vibrates — only how long and in what rhythm. So the
signals are told apart by pulse count, which people read far more reliably than
duration, and 設定 → 震動強度 scales the length (輕 / 中 / 強, default 強). Only the
buzzes are scaled, never the gaps, so the rhythm stays recognisable at any setting.

The two closing prayers said three times each are counted the same way, with their own
three beads on screen and 第 N 遍，共 3 遍 in words. Finishing a decade also flashes
第一端 圓滿 on screen for anyone who opens their eyes.

Turn it off in 設定, where **試一下震動** plays the sequence so you can confirm the phone
is actually vibrating.

**Do Not Disturb** does not usually stop this. DND suppresses notifications and
ringtones, and a vibration asked for by a page you are looking at is neither. What does
stop it is the phone's own haptics being off — system haptic feedback disabled, some
OEMs' silent mode, or a battery saver — and no web page can detect or override any of
those. The behaviour varies enough between manufacturers that the test button, pressed
while DND is on, is the only reliable answer for a given phone.

## The prayer flower

祈禱紀錄 opens on a flower rather than a grid, and it carries both prayers at once:
**the chaplet is the outer ring of petals, the rosary the inner whorl.**
Each day of the month appears in both rings, so a glance shows which prayer was said on
which day, or that both were.

A day prayed lights its mark — gold on the outer ring, blue on the inner — deepening
with a second time and deeper again at three. Petals are broad and overlap their
neighbours, so the lit days read as a layered bloom rather than a row of spokes; the
unlit ones stay faint enough to leave the flower to them. The centre holds the month's total across
both prayers and how many days they cover; touching a petal or a stamen reads out that
day, with its mysteries and whatever intention was written.

Days still to come are drawn faintly rather than left out, so the window is always a
whole circle — an unfinished month is not shown as a broken one. A day that passed
without prayer sits between the two: present, but unlit.

The grid calendar is still there behind **看月曆** for when an exact date matters.



## Recording a prayer said away from the phone

**補記一次祈禱** on the home screen logs a chaplet prayed on beads, from a book, or in
church. Pick the date and time it actually happened, add an intention if you want, and it
joins the same record — counting towards the streak, the calendar and the totals.

Logged prayers are marked 補記 in the history and carry no duration, since none was
measured; the distinction survives export and import. Times in the future are refused.



## Tests

```sh
npm install        # once — pulls in Playwright
npm test           # runs every suite against a local server
npm test offline   # or just one
```

Five suites cover the things that would hurt most if they broke:

| suite | proves |
|---|---|
| `prayer-flow` | both modes, bead counting, the completion button, records, calendar, streak |
| `offline` | installs, then works with the network cut — cold start, praying, recording — and that reconnecting changes nothing |
| `images` | the image follows the prayer, missing files fall back, gallery picks are scaled, de-duplicated and persist |
| `backup-roundtrip` | export, wipe the device, import, and get records *and* pictures back; re-importing does not duplicate |
| `update-flow` | a new version reaches an installed phone, old content serves until accepted, stale caches are cleared |
| `tap` | a slow or slightly wobbly touch counts as one bead; drags, swipes and momentum scrolling do not |
| `haptics` | the five vibration signals stay distinguishable, every pulse is long enough to feel, and the strength setting scales them |
| `manual-log` | a prayer said elsewhere is recorded, dated, counted with the rest, and stays marked through a backup |
| `rose` | a petal in each ring per day, the two prayers counted apart, future days set apart from missed ones, and the calendar still reachable |
| `rosary` | the mysteries and their scripture, the weekday cycle, the 78-step sequence, and the chaplet still intact beside it |
| `import-safety` | a backup file from anywhere cannot make the app reach the network or write malformed data |
| `bible` | books, chapters and sections, marking read (and surviving a reload), parallels and the event pages, timeline, themes, people (their sayings, tabs, context links, speaker chips), log, search, the back button layer by layer, backup import checks, the single-file preview |
| `gospel-events` | every reference in the event table exists, and every verse of the four Gospels belongs to exactly one event |
| `people` | every passage in `data/people.json` exists, each key verse lies inside its passage, and every cross-reference points at a saying that exists |
| `novena` | the home card, the list and the nine days, the texts verbatim, marking and undoing a day, the gap notice, the intention kept and copied into the finished record, restart, the back button layer by layer, bad storage |
| `confession` | the home card and its lines, the six steps in order, the three tabs, the 省察 forms, sections and ticks (with counts, kept through a reload), the rite with its gold-bordered words and 我的省察, the 痛悔經 choice, recording and removing a day, the wording of "how long ago", the back button |

The suites drive a real browser at phone size and fail on any console error.

## Layout

```
index.html              app shell — every screen
app.js                  logic: prayer flow, records, calendar, settings
bible.js                Bible reading: books, chapters, events, progress
confession.js           修和聖事: the steps, the rite, the date of the last confession
novena.js              九日敬禮: the novenas, day by day, the finished runs
bible-parse.js          splits the Bible text files into chapters, verses and sections
styles.css              theme, light + dark
sw.js                   service worker — the offline cache
manifest.webmanifest    home-screen install metadata
data/prayers.json       the prayer text
data/images.json        the picture list
data/gospel-events.json the Gospel events in order, with where each is told
data/people.json        who said what: people, their stages and sayings, with the passages
data/confession.json    修和聖事: the steps, the rite, the prayers of contrition
data/novenas.json       九日敬禮: the novenas, nine days each, with their closing prayers
bible/                  the Bible text (思高) and its source notice
images/                 the pictures
icons/                  app icon
scripts/make-icons.mjs  regenerates the icons (node scripts/make-icons.mjs)
```

No frameworks and no build step: what is in the repository is exactly what runs.
