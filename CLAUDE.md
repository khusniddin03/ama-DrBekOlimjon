# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, zero-build site that renders a personal Uzbek-language Q&A archive from a single JSON file. No
framework, no bundler, no package.json, no dependencies, no build step of any kind. Exactly three source files —
[index.html](index.html), [styles.css](styles.css), [app.js](app.js) — plus the data.

It deploys to Netlify/Vercel by dropping the folder in: no build command, publish directory is the folder itself.

There is no test runner and no linter. Verification is done by driving headless Chrome (see below).

**Do not add tooling.** The user has explicitly asked for no Python, no build scripts and no extra files. If you
create probe or test files while working, give them a leading underscore and delete them before finishing.

## Commands

```bash
npx serve                       # or: python3 -m http.server 8000
```

The page reads `question-asnwer.json` over `fetch`, so editing the data and reloading is enough. Opening
`index.html` from `file://` cannot work — the browser blocks the fetch — and the page renders an explanatory
message rather than a blank screen. That is expected behaviour, not a bug to fix.

### Verifying a change

There is no test command. Drive the real browser:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --window-size=1440,1200 --virtual-time-budget=10000 --dump-dom http://localhost:8000/index.html
```

Two traps that will waste your time:

- **Chrome headless clamps the window to a 500px minimum width.** A `--window-size=375,...` run silently renders
  at 500px, so mobile layout bugs pass. To test a real narrow viewport, load the page inside an
  `<iframe width="375">` on a wrapper page and screenshot that.
- **CSS transitions and animations never advance under `--virtual-time-budget`.** A `translateY(4px)` entry
  animation stays pinned at its start offset, so a "did the layout shift?" assertion taken right after clearing
  a query reports a phantom 4px move. Wait for the animating class to be removed before measuring.
- **CSS transitions never advance under `--virtual-time-budget`.** `getComputedStyle` on a transitioned
  property returns the *start* value forever, so toggling the theme and reading `.theme`'s `background-color`
  reports the old colour even though the theme switched correctly. This is not a bug in the page — verify such
  properties on an element with no transition, or set `el.style.transition = 'none'` before asserting.
- To assert on behaviour rather than markup, copy `index.html`, append a probe `<script>` that drives the UI
  (set `input.value`, dispatch an `input` event) and writes results into a `<pre id="results">`, then pull that
  element out of `--dump-dom`. `window.AMA` is exported for exactly this: `{normalize, normMap, search(q), records, entries}`.

## Data

[question-asnwer.json](question-asnwer.json) is the single source of truth: a flat array of
`{question: string, answer: string}` — no ids, no dates, no categories. Note the typo in the filename
(`asnwer`); it is correct on disk, do not "fix" the path.

**The file grows constantly** — it more than tripled during a single working session, gaining entries every
few minutes. Consequences that are easy to get wrong:

- No entry count may ever be hardcoded in markup, CSS, copy or comments. Every displayed number is derived from
  `data.length` at runtime. The total appears in three places, all live: the status line under the search field
  (`Jami 64 ta savol`, becoming `64 tadan 8 tasi topildi · «query» Tozalash` while filtering), the rail heading
  (`SAVOLLAR (64 ta)` / `TOPILDI (8 ta)`), and the footer.
  There is deliberately **no visible masthead** — the user removed the title, the tagline and the
  "N ta savol · taxminan M daqiqalik o'qish" line, so the page opens directly on the search bar. Do not
  reintroduce any of them. An `<h1 class="sr-only" id="top">` remains so the document keeps a top-level
  heading and the footer's "Yuqoriga" anchor has a target.
- Anchors use a content-derived slug, never the array index — a slug survives a reorder.
- Any rule you tune against the corpus (list regex, greeting detector, lede labels) must be re-verified against
  the current file, not against a count quoted in a comment.

Both fields carry meaningful `\n`. Blank lines are paragraph breaks; lines starting `1.` are list items. Text is
plain, never HTML or Markdown.

## The one rule that matters most

**In Uzbek Latin, `o'` and `g'` are letters, not punctuation.** The corpus mixes at least five apostrophe
characters: `'` U+0027, `'` U+2019, `'` U+2018, `ʻ` U+02BB and `ʼ` U+02BC. The last two are Unicode category
**Lm — letters**, so any `\w`, `\b` or generic "strip punctuation" pass will mangle words like `oʻrni` and
`sunʼiy`.

There are two completely separate paths and they must never be confused:

- **Render path** — reads `record.question` / `record.answer` verbatim. Never normalize, strip, or smart-quote.
- **Search index** — `normalize()` in [app.js](app.js) *deletes* every apostrophe-family character. Deletion,
  not canonicalisation: the corpus itself is inconsistent about whether the apostrophe is written at all
  (`bo'yicha` and `boyicha` both occur), so deleting collapses both spellings onto one key and a phone user who
  types no apostrophe still finds the word.

Because normalization deletes characters, `normMap()` returns a parallel index array mapping each normalized
character back to its source offset. **Highlighting must go through that map.** Skipping it does not change the
result count — it silently draws every `<mark>` a few characters off, which reads as a font glitch rather than a
search bug. Regression-test it with the queries `orni` (must produce one `<mark>` containing U+02BB) and `suniy`.

## Architecture notes

Everything below is a deliberate choice with a reason; changing one without the reason will regress something.

- **Author text enters the DOM only via `createTextNode`.** There is no `innerHTML` anywhere in the render or
  highlight path. The only two HTML-string writes in the file — the theme button's `innerHTML` and the clamp
  chevron's `insertAdjacentHTML` — take developer-authored SVG constants and never touch corpus text. Keep it
  that way; it makes escaping structurally impossible to get wrong.
- **The JSON is the only data path.** There is no inlined copy and no sync step, so the data can never go stale.
  The cost is that `file://` shows the explanatory error state instead of the archive.
- `app.js` is a **classic script, not a module**, and stays ES5-flavoured — no build, no transpile.
- **Questions clamp at 8 lines; answers never collapse.** The clamp is a JS-measured px `max-height`, not
  `-webkit-line-clamp`, because several questions contain a real `<ol>` and `display:-webkit-box` destroys block
  children. `-webkit-line-clamp` is fine on the rail excerpt, which is a single plain string.
- **Search never reorders.** Non-matching `<li>` get the `hidden` attribute, so find-in-page and screen readers
  skip them and the margin ordinals stay in sequence. Before hiding an `<li>`, focus is moved out of it or the
  keyboard user is stranded on `<body>`.
- **Nothing listens to `scroll` and there is no rAF loop.** The sticky condense, rail scroll-spy and back-to-top
  pill all run on `IntersectionObserver`.
- **Colors come from Telegram's stock themes** and are the user's explicit request: dark is Telegram Night
  (`#17212B` page, `#242F3D` surface, `#6AB3F3` accent), light is Telegram Day (`#FFFFFF`, `#F4F4F5`, `#3390EC`).
  Questions are styled as Telegram incoming message bubbles; the search field is Telegram's filled pill with an
  accent border on focus. Keep new UI inside this vocabulary.
- **The theme toggle sits at the right end of the search row** and is an antd *default/outline* button —
  transparent fill, 1px `--line-strong` border, text and border both going `--accent` on hover — but circular
  (`border-radius: 50%`) and matched to the field's 46px height. It is explicitly **not** a filled primary
  button; the only filled primary control is the floating back-to-top pill.
- **Dark is the default even when the OS prefers light.** Tokens live on bare `:root`; the light palette exists
  only under `:root[data-theme="light"]`. There is no `prefers-color-scheme` block, on purpose.
- **The status line's height is fixed at 34px**, not content-driven. At rest it is empty; while filtering it
  carries text plus an inline "Tozalash" button, which is taller. Without the fixed height the entire list
  jumps down on the first keystroke — the one moment the page must feel instant.
- **`--stuck-h` is measured at runtime**, not hardcoded — the sticky bar contains both the field and the status
  line, so its height changes with state. `scroll-margin-top` and the rail's sticky `top` both read from it, so
  an anchor jump never lands underneath the bar.
- Uppercase micro-labels (SAVOL, JAVOB, SAVOLLAR, MAVZULAR) are literal uppercase strings in the DOM, never
  `text-transform: uppercase` — CSS case mapping must never touch an apostrophe-letter.
- The empty-state topic chips are hardcoded and each is asserted at boot to be a substring of the normalized
  corpus, so no chip can produce a second empty state. Do not derive them by token frequency; that returns
  `uchun`, `qanday`, `assalomu`.

## Analytics

Vercel Web Analytics is loaded from a guarded inline snippet in `<head>`. Two things make it fit this project:

- The script (`/_vercel/insights/script.js`) and the beacon it sends (`/_vercel/insights/view`) are **same-origin
  paths** intercepted by Vercel's edge, so the "no third-party host is ever contacted" property still holds.
- The snippet skips `localhost`, `127.0.0.1` and `file://`, so local development stays request-free and the
  console stays clean (the path 404s anywhere that is not Vercel).

It only records once Web Analytics is enabled for the project in the Vercel dashboard; the script 404s until
then. Numbers appear in the dashboard, not on the page — that was a deliberate choice over an on-page counter,
which would have needed a serverless function plus a KV store.

**Download counting is a trial and is meant to be easy to rip out.** Vercel's Hobby plan does not include
custom events (`va('event', …)` is Pro-only), so `trackDownload()` in `app.js` records each export as a
*virtual page view* instead: it pushes `/yuklab-olish/<format>` and restores the real URL in the same task.

Why that is safe — verified by reading the shipped `/_vercel/insights/script.js`:

- The script wraps `history.pushState` and calls its recorder **synchronously** inside the wrapper.
- The recorder's `v()` captures `location.href` on its first line, *before* any `await`, so the beacon carries
  the virtual path even though we restore the URL immediately afterwards.
- `history.replaceState` is **not** wrapped, so restoring produces no second page view and does not inflate
  the count for `/`.
- The script dedupes against the last recorded pathname, so hammering the same format twice in a row counts
  once — which is the desired behaviour for a double-click, and why a repeat only registers after a different
  format has been downloaded in between.

Because the URL is restored within the same task, a reload can never land on `/yuklab-olish/...` (which would
404 on a static deploy). `trackDownload` is a no-op unless `window.vai` is set, so localhost stays clean.
To remove the experiment: delete `trackDownload()` and its single call site in `runExport()`.

## Export

The download menu (the circular button between the search field and the theme toggle) produces four formats
with **no library and no build step**:

- **`.docx` and `.xlsx` are written by hand.** Both formats are just a ZIP containing XML parts, so `app.js`
  carries a ~70-line store-only (uncompressed) ZIP writer plus a CRC-32 table. The docx ships three parts
  (`[Content_Types].xml`, `_rels/.rels`, `word/document.xml`); the xlsx ships six, including a `styles.xml`
  whose `s="1"` cell format supplies `wrapText` + top alignment — without it the long answers render as one
  unreadable line. Cells use `inlineStr`, so there is no `sharedStrings.xml` to keep in sync.
- **PDF goes through `window.print()`** and the `@media print` block, which is why that menu item is labelled
  "chop etish". A hand-rolled PDF would be limited to the standard-14 fonts, whose WinAnsi encoding cannot
  represent U+02BB / U+02BC (the `oʻ` and `sunʼiy` letters) or the emoji — it would silently corrupt the
  corpus. Do not "upgrade" this to a hand-built PDF writer.
- Export follows the **current filter**: a search narrows what lands in the file, and the query goes into the
  filename and the document title.
- XML escaping covers `& < > "` and strips XML-illegal control characters. Apostrophes are deliberately *not*
  escaped — they are ordinary characters in text nodes, and every attribute here is double-quoted.
- Regression-test by generating the blobs via `window.AMA_EXPORT`, base64-ing them into the DOM, and opening
  them in Python with `zipfile` + `ElementTree` — round-trip every question and answer and assert byte equality
  with the JSON. `textutil -convert txt out.docx` is a good extra check: it is macOS's own Word parser.

## Revisit trigger

Every answer is rendered open. That stays right while the whole archive is a single sitting's read. Once it is
clearly past that — think a couple of hundred entries, or when the user says the page feels endless — the honest
upgrade is sectioning or pagination, **not** moving the clamp from questions to answers, which would make search
matches invisible or force auto-expansion on every keystroke.
