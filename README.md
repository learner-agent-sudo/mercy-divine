# 救主慈悲串經 — Divine Mercy Chaplet

An offline prayer app for praying the Chaplet of Divine Mercy in Traditional Chinese,
with a record of every time you finish.

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

## Changing the content

**The prayers** live in [`data/prayers.json`](data/prayers.json) — plain text, no code.
Edit the wording, add or remove an opening prayer, change how many decades or beads
there are; the app rebuilds itself from that file.

**The pictures** go in [`images/`](images/), listed in
[`data/images.json`](data/images.json):

```json
{ "file": "images/jesus-1.jpg", "caption": "耶穌，我信賴祢", "for": ["hail-mary"] }
```

`for` matches a picture to the prayer being said, so the image changes as you move
through the chaplet. One picture can cover several prayers. The names are:

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

### Or just pick them on the phone

You don't have to touch the repository at all. **設定 → 聖像** lists the nine places a
picture appears and lets you choose one from the phone's gallery for each. Chosen
pictures are stored on the device, override anything in `data/images.json`, and are
included in the backup file, so they survive a new phone. 還原 puts the built-in one back.

Pictures picked this way are scaled down to 1600px on the long edge and re-encoded, so a
4000px phone photo becomes a few tens of KB. The same picture assigned to several places
is stored once, not once per place.

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
