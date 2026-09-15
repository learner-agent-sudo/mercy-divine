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

Each prayer keeps its own wording. The Rosary uses the traditional 萬福瑪利亞，滿被聖寵者
and the chaplet its own 妳充滿聖寵; the two Creeds differ too. They are separate texts in
separate files and are never merged.

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
`decade-1` … `decade-5` give a mystery its own picture. Anything with no match falls back
to the `home` picture, so no screen is ever left blank. The names are:

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

設定 → **匯出備份檔** writes a `.json` file to Downloads with every record. **匯入備份檔**
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

## The prayer rose

祈禱紀錄 opens on a rose window rather than a grid. Each day of the month is a petal,
arranged in a ring; a day prayed lights its petal in gold, twice deepens it, three or
more turns it red. The centre holds the month's total and how many days it covers, and
touching a petal reads out that day with whatever intention was written.

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
| `rose` | one petal per day, lit by how often you prayed, future days set apart from missed ones, and the calendar still reachable |
| `rosary` | the mysteries and their scripture, the weekday cycle, the 78-step sequence, and the chaplet still intact beside it |
| `import-safety` | a backup file from anywhere cannot make the app reach the network or write malformed data |

The suites drive a real browser at phone size and fail on any console error.

## Layout

```
index.html              app shell — all five screens
app.js                  logic: prayer flow, records, calendar, settings
styles.css              theme, light + dark
sw.js                   service worker — the offline cache
manifest.webmanifest    home-screen install metadata
data/prayers.json       the prayer text
data/images.json        the picture list
images/                 the pictures
icons/                  app icon
scripts/make-icons.mjs  regenerates the icons (node scripts/make-icons.mjs)
```

No frameworks and no build step: what is in the repository is exactly what runs.
