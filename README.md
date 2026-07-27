# Daily Scene Prompter

A scene-prompt deck for [Beat](https://www.beat-app.fi/), the free Fountain screenwriting app for macOS.

365 prompts — one for every day of the year — in a panel docked beside your script. Filter by genre and tone, shuffle when today's doesn't land, and drop the scene heading straight into the page with the brief attached as a note that never prints.

Successor to the `screenwriting_daily` web app; it shares the same prompt corpus and the same day-of-year seeding, so the plugin and the site surface the same prompt on the same date.

---

## Install

**Beat for macOS only** — the iOS versions don't support plugins.

Grab the zip from the [latest release](https://github.com/DalethMountjoy/beat_prompt_plugin/releases/latest), unzip it, then drop `Daily Scene Prompter.beatPlugin` into Beat's plugin folder. The quickest way to reach that folder is **Tools → Plugin Library** and the **folder icon** in that window; failing that it's at:

```
~/Library/Containers/fi.KAPITAN.Beat/Data/Library/Application Support/Beat/Plugins
```

Restart Beat fully (`⌘Q`, not just closing the window — plugins are only scanned at launch) and it appears under **Tools → Daily Scene Prompter**.

> `Daily Scene Prompter.beatPlugin` is a *folder*, though Finder may show it as one item. Don't rename it — Beat locates `plugin.js` by the folder name.

**📖 [INSTALL.md](INSTALL.md) is the step-by-step version** — screenshots-level detail plus troubleshooting. That's the one to send someone who just wants it working.

---

## Using it

Open it from **Tools → Daily Scene Prompter**. The panel stays attached to the document window, so it follows the script it belongs to.

| Control | What it does |
|---|---|
| **Insert into script** | Writes the brief as a Beat note at the end of your current line, with the scene heading below it. The caret lands under the slugline, ready to write |
| **Shuffle ⟳** | Draws another prompt from whatever the filters allow. Never redraws the one on screen |
| **Mark written** | Counts the prompt toward your streak and greys it out |
| **Genre chips** | Narrowing filter — selecting *action* and *thriller* shows prompts that are **both** |
| **Tone** | Widening filter — pick one tone, or leave it on *Any* |
| **unwritten only** | Hides prompts you've already marked written |
| **Today** | Returns to today's prompt after shuffling |

### Menu shortcuts

| Shortcut | Action |
|---|---|
| `⌃⌥1` | Today's prompt |
| `⌃⌥2` | Shuffle |
| `⌃⌥3` | Insert current prompt |

### What lands in your script

```fountain
[[A getaway driver waits outside a job that's gone wrong. When someone
finally runs out and gets in, it's not one of her crew.

Tone: tense · DRIVER CASS, THE STRANGER]]

EXT. BANK - GETAWAY CAR - DAY

▍← caret lands here
```

The brief sits above the slugline as setup; the scene heading underneath it marks where the writing starts. The caret is left on the blank line below the heading, so you can begin typing action immediately.

The scene heading is a real slugline, so Beat colours it and lists it in the outline. The brief is a **note** — visible while you write, automatically excluded from print and PDF export. You never have to remember to delete it before sending pages out.

### Streaks

Writing counts once per day, no matter how many prompts you tackle. A streak survives until you miss a full day: if you wrote yesterday and haven't written yet today, the streak still shows — you have the rest of the day to keep it. Miss a day and it resets, but your longest run is kept.

Streaks are stored per-machine in Beat's own settings and are shared across every script you open. They don't sync between you and a collaborator.

---

## Sharing it

Everyone runs the same corpus with the same day-of-year seeding, so two people on separate machines see the same prompt on the same date without any server involved. Nothing syncs; nothing needs to.

To cut a new version for someone:

```bash
./build.sh                                          # test + package to dist/
gh release create v1.1 "dist/Daily Scene Prompter 1.1.zip"
```

Then send them <https://github.com/DalethMountjoy/beat_prompt_plugin/releases/latest> — that link always resolves to the newest release, so it stays valid across updates, and it works without a GitHub account.

> **Don't email the zip.** Google blocks `.js` attachments and enforces it *inside* archives too, so a zip containing `plugin.js` will bounce. A release link avoids the problem entirely. If you ever must send a file directly, put it on Drive or iCloud and share the link.

---

## Development

```bash
npm test              # run the suite
./build.sh            # test + package to dist/
./build.sh --install  # test + package + install into your local Beat
```

After `--install`, **restart Beat** — it reads plugins at launch.

### Layout

```
beat-scene-prompter/
├── Daily Scene Prompter.beatPlugin/
│   ├── plugin.js       Beat bootstrap — the only file that touches the Beat API
│   ├── deck.js         pure logic: selection, filtering, streaks, insert text
│   ├── ui.html         panel template + styling
│   └── prompts.json    the 365-prompt corpus
├── test/
│   ├── deck.test.js    unit tests for the logic
│   └── bundle.test.js  bundle integrity — corpus shape, template assembly
├── build.sh
└── package.json
```

### How it's put together

Beat plugins run in a JavaScriptCore sandbox with no module loader, and the HTML panel runs in a separate WebView that cannot read files out of the plugin bundle. So `plugin.js` splices `deck.js`, the corpus and the saved state into `ui.html` at launch, replacing `/*#DECK_JS#*/`-style placeholders.

That is why **`deck.js` contains no `Beat.*` calls, no DOM access and no I/O**. The same file runs in three environments — Node under test, the Beat sandbox, and the WebView — which is what makes the logic testable from the command line. Keep it that way: anything needing the editor belongs in `plugin.js`, anything needing the DOM belongs in `ui.html`.

The panel talks back to the plugin through `Beat.call("Beat.custom.fn(arg)")`. `plugin.js` is the only writer of persisted state; after saving it pushes the new state back into the panel via `runJS("applyState(...)")`, so the two copies cannot drift apart.

### Editing prompts

`prompts.json` is a flat array. Each entry:

```json
{
  "id": "prompt-039",
  "title": "The Wrong Seat",
  "scene_heading": "EXT. BANK - GETAWAY CAR - DAY",
  "description": "A getaway driver waits outside a job that's gone wrong.",
  "genre": ["action", "thriller"],
  "themes": ["complicity", "who you trust"],
  "suggested_characters": ["DRIVER CASS", "THE STRANGER"],
  "tone": "tense"
}
```

`id`, `title`, `scene_heading`, `description` and `genre` are required; `themes`, `suggested_characters` and `tone` are optional. Ids must be unique — the written-set keys on them. `bundle.test.js` enforces all of this, so run `npm test` after editing.

Genre and tone dropdowns are built from whatever is in the file, so adding a new genre needs no code change.

### Debugging

`Beat.log()` output goes to Beat's plugin console: **Tools → Plugin Console**. If the panel opens blank, it's almost always a JavaScript syntax error in the assembled page — `npm test` catches that case specifically.
