# Installing Daily Scene Prompter

A setup guide for getting the plugin running in Beat on your own Mac. No coding required — it's five steps and takes about two minutes.

**What it is:** a panel that sits beside your screenplay with 365 scene prompts, one for each day of the year. You can filter by genre and tone, shuffle for something different, and drop a prompt straight into your script.

---

## Before you start

You need **Beat for macOS** — the free screenwriting app from [beat-app.fi](https://www.beat-app.fi/), also on the Mac App Store.

This plugin is **macOS only**. Beat's iPhone and iPad versions don't support plugins, so there's no way to install it there.

If Beat isn't installed yet, do that first and open it once before continuing.

---

## Step 1 — Download the plugin

Go to:

**https://github.com/DalethMountjoy/beat_prompt_plugin/releases/latest**

Under **Assets**, click `Daily.Scene.Prompter.1.0.zip` to download it.

You do **not** need a GitHub account, and you don't need to log in. It's a normal download link.

---

## Step 2 — Unzip it

Find the download (usually your **Downloads** folder) and double-click the `.zip`.

You'll end up with a folder called:

```
Daily Scene Prompter.beatPlugin
```

> **If you use Safari**, it may have already unzipped it for you — in that case you'll see the folder straight away and can skip ahead.

> **The name matters.** Don't rename this folder and don't remove the `.beatPlugin` part. Beat finds the plugin's code by matching the folder's name.

> **It may look like a single file** rather than a folder, depending on your Finder settings. That's expected and perfectly fine — treat it as one item either way.

---

## Step 3 — Open Beat's plugin folder

Open Beat, then go to **Tools → Plugin Library** in the menu bar.

In the window that opens, click the **folder icon**. This opens Beat's plugin folder in Finder.

Leave that Finder window open — that's where the plugin goes.

<details>
<summary><strong>If you can't find the folder icon</strong> (click to expand)</summary>

You can navigate there manually. Beat is a sandboxed app, so its plugin folder is buried in a place you'd never find by browsing.

1. Switch to Finder.
2. Press `⌘` `⇧` `G` (Command-Shift-G). A "Go to Folder" box appears.
3. Paste this in exactly, then press Return:

```
~/Library/Containers/fi.KAPITAN.Beat/Data/Library/Application Support/Beat/Plugins
```

If you get an error saying the folder doesn't exist, open Beat and visit **Tools → Plugin Library** once — that makes Beat create it — then try again.

</details>

---

## Step 4 — Move the plugin in

Drag the `Daily Scene Prompter.beatPlugin` folder from your Downloads into the plugin folder you just opened.

That folder may already contain other plugins. Leave them alone — just add this one alongside them.

---

## Step 5 — Restart Beat

**Quit Beat completely** (`⌘Q` — not just closing the window) and open it again. Beat only looks for plugins when it starts up, so this step isn't optional.

Now open a screenplay and go to **Tools → Daily Scene Prompter**.

The panel should appear beside your script. That's it — you're done.

---

## Using it

The panel stays attached to your script's window, so it follows the document it belongs to.

| Button | What it does |
|---|---|
| **Insert into script** | Drops the prompt into your screenplay — the brief as a note, with the scene heading below it, and your cursor placed ready to write |
| **Shuffle ⟳** | Draws a different prompt. Never gives you the one already on screen |
| **Mark written** | Counts it toward your writing streak and greys the prompt out |
| **Today** | Returns to today's prompt after you've shuffled around |

**Genre chips** narrow things down — picking *action* and *thriller* shows prompts that are **both**, not either. **Tone** works the other way: pick one, or leave it on *Any*. **unwritten only** hides prompts you've already marked.

There are also keyboard shortcuts: `⌃⌥1` for today's prompt, `⌃⌥2` to shuffle, `⌃⌥3` to insert.

### What lands in your script

```
[[A getaway driver waits outside a job that's gone wrong. When someone
finally runs out and gets in, it's not one of her crew.

Tone: tense · DRIVER CASS, THE STRANGER]]

EXT. BANK - GETAWAY CAR - DAY

▍← your cursor ends up here
```

The brief is a **note**. Beat shows it while you write but strips it out of printing and PDF export automatically — so you can leave it in place and it'll never show up on pages you send anyone.

The scene heading below it is a real slugline, so Beat colours it and lists it in the outline like any other scene.

### About the daily prompt

Today's prompt is chosen by the date, using the same calculation on every machine. So we both see the same prompt on the same day without anything syncing between us — it's just arithmetic over an identical list.

### About streaks

Your streak is stored on your own Mac and counts once per day, however many prompts you write. It survives until you miss a full day — if you wrote yesterday and haven't written yet today, it still shows, and you've got the rest of the day to keep it.

Streaks are **not** shared between us. Nothing in this plugin connects to the internet.

---

## Troubleshooting

**"Daily Scene Prompter" doesn't appear in the Tools menu**

- Did you fully quit Beat (`⌘Q`) and reopen it? Closing the window isn't enough.
- Check the folder actually landed in the plugin folder, and that it's still named `Daily Scene Prompter.beatPlugin`.
- Make sure you moved the plugin folder itself, not a folder *containing* it. If you see `Daily Scene Prompter.beatPlugin` nested inside another folder, move the inner one up.

**The panel opens but is blank**

Something didn't copy across intact. Delete the folder from the plugin folder, re-download, and redo steps 2–5.

**macOS is being cautious about the download**

Occasionally macOS flags files downloaded from the internet and Beat then skips the plugin. If the steps above all check out and it still won't appear, open **Terminal** (in Applications → Utilities) and paste this, then press Return:

```
xattr -dr com.apple.quarantine ~/Library/Containers/fi.KAPITAN.Beat/Data/Library/Application\ Support/Beat/Plugins/Daily\ Scene\ Prompter.beatPlugin
```

It produces no output when it works. Restart Beat afterwards.

**Still stuck?** Send me a screenshot of the plugin folder and of the Tools menu.

---

## Updating later

When there's a new version:

1. Download the new zip from the [releases page](https://github.com/DalethMountjoy/beat_prompt_plugin/releases/latest) — same link as before.
2. Unzip it.
3. Open the plugin folder again (**Tools → Plugin Library**, folder icon).
4. Drag the new `Daily Scene Prompter.beatPlugin` in, replacing the old one when macOS asks.
5. Restart Beat.

Your streak and filter settings are stored separately from the plugin, so they survive an update.
