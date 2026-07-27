/**
 * Tests for the plugin bundle itself, rather than its logic.
 *
 * deck.test.js proves the decisions are right. These tests prove the plugin
 * will actually *start*: the corpus is well formed, the template placeholders
 * line up with what plugin.js substitutes, and the assembled page is valid
 * JavaScript. Those failures are invisible until Beat opens the panel and shows
 * a blank window, so they are worth catching on the command line.
 */

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const BUNDLE = path.join(__dirname, '..', 'Daily Scene Prompter.beatPlugin')

const read = (name) => fs.readFileSync(path.join(BUNDLE, name), 'utf8')

/* ------------------------------------------------------------------ *
 * The corpus
 * ------------------------------------------------------------------ */

test('prompts.json is present and parses', () => {
  assert.doesNotThrow(() => JSON.parse(read('prompts.json')))
})

test('prompts.json holds a full year of prompts', () => {
  const prompts = JSON.parse(read('prompts.json'))
  assert.ok(Array.isArray(prompts))
  assert.strictEqual(prompts.length, 365)
})

test('every prompt carries the fields the UI and inserter rely on', () => {
  const prompts = JSON.parse(read('prompts.json'))

  prompts.forEach((prompt, index) => {
    const where = `prompt at index ${index} (${prompt.id})`
    assert.strictEqual(typeof prompt.id, 'string', `${where}: id`)
    assert.strictEqual(typeof prompt.title, 'string', `${where}: title`)
    assert.strictEqual(typeof prompt.scene_heading, 'string', `${where}: scene_heading`)
    assert.strictEqual(typeof prompt.description, 'string', `${where}: description`)
    assert.ok(Array.isArray(prompt.genre), `${where}: genre must be an array`)
  })
})

test('prompt ids are unique, since the written-set and lookups key on them', () => {
  const prompts = JSON.parse(read('prompts.json'))
  const ids = new Set(prompts.map((p) => p.id))
  assert.strictEqual(ids.size, prompts.length)
})

/* ------------------------------------------------------------------ *
 * Template placeholders
 * ------------------------------------------------------------------ */

const PLACEHOLDERS = ['/*#DECK_JS#*/', '/*#PROMPTS#*/', '/*#STATE#*/', '/*#FILTERS#*/']

test('ui.html declares every placeholder plugin.js substitutes', () => {
  const ui = read('ui.html')
  PLACEHOLDERS.forEach((placeholder) => {
    assert.ok(ui.includes(placeholder), `ui.html is missing ${placeholder}`)
  })
})

test('plugin.js substitutes every placeholder ui.html declares', () => {
  const plugin = read('plugin.js')
  PLACEHOLDERS.forEach((placeholder) => {
    assert.ok(plugin.includes(placeholder), `plugin.js never injects ${placeholder}`)
  })
})

test('each placeholder appears exactly once in ui.html', () => {
  // plugin.js substitutes the FIRST occurrence only. A second copy of a token —
  // typically someone documenting the templating in a comment — silently eats
  // the substitution and leaves the live placeholder in the emitted script,
  // which Beat renders as a blank panel with no error.
  const ui = read('ui.html')

  PLACEHOLDERS.forEach((placeholder) => {
    const count = ui.split(placeholder).length - 1
    assert.strictEqual(count, 1, `${placeholder} appears ${count} times in ui.html; expected exactly 1`)
  })
})

/* ------------------------------------------------------------------ *
 * Assembly
 * ------------------------------------------------------------------ */

/**
 * Mirrors the `inject` helper in plugin.js — index/slice rather than
 * String.replace, so `$&` and friends in the data are not treated as
 * substitution directives.
 */
function inject (template, placeholder, value) {
  const index = template.indexOf(placeholder)
  assert.notStrictEqual(index, -1, `placeholder ${placeholder} missing`)
  return template.slice(0, index) + value + template.slice(index + placeholder.length)
}

/** Assembles the page exactly as plugin.js does at launch. */
function assemble () {
  let html = read('ui.html')
  html = inject(html, '/*#DECK_JS#*/', read('deck.js'))
  html = inject(html, '/*#PROMPTS#*/', JSON.stringify(JSON.parse(read('prompts.json'))))
  html = inject(html, '/*#STATE#*/', JSON.stringify({ currentStreak: 0, longestStreak: 0, lastWrittenDate: null, writtenIds: [] }))
  html = inject(html, '/*#FILTERS#*/', JSON.stringify({ genres: [], tones: [], hideWritten: false }))
  return html
}

test('the assembled page leaves no placeholder behind', () => {
  const html = assemble()
  PLACEHOLDERS.forEach((placeholder) => {
    assert.ok(!html.includes(placeholder), `${placeholder} survived assembly`)
  })
})

test("the assembled page's script block is syntactically valid JavaScript", () => {
  // The single most likely way to ship a blank panel is a syntax error created
  // by injection — an unescaped character in the corpus, or a stray delimiter.
  const html = assemble()

  // Anchor on tags that own their line, so a `<script>` mentioned in prose or a
  // comment cannot be mistaken for the real opening tag.
  const open = html.indexOf('\n<script>\n')
  const close = html.lastIndexOf('\n</script>')
  assert.notStrictEqual(open, -1, 'no <script> tag found on its own line')
  assert.ok(close > open, 'no closing </script> after the opening tag')

  const script = html.slice(open + '\n<script>\n'.length, close)
  assert.doesNotThrow(() => new vm.Script(script), 'assembled script does not parse')
})

test('injection preserves data containing $ substitution patterns', () => {
  // String.replace would silently mangle these; index/slice must not.
  const hostile = JSON.stringify([{ id: 'x', description: "$& $' $` $1 costs $5" }])
  const result = inject('before/*#PROMPTS#*/after', '/*#PROMPTS#*/', hostile)

  assert.ok(result.includes("$& $' $` $1 costs $5"))
  assert.strictEqual(result, 'before' + hostile + 'after')
})

/* ------------------------------------------------------------------ *
 * Running the assembled logic
 * ------------------------------------------------------------------ */

test('deck.js attaches itself to the global when there is no module loader', () => {
  // This is how it loads inside Beat's sandbox and inside the web view. If the
  // export branch were wrong, the panel would throw "Deck is not defined".
  const context = { module: undefined, window: undefined }
  vm.createContext(context)
  vm.runInContext(read('deck.js'), context)

  assert.strictEqual(typeof context.Deck, 'object')
  assert.strictEqual(typeof context.Deck.todaysPrompt, 'function')
})

test('the real corpus yields a prompt for every day of a leap year', () => {
  // Guards against an off-by-one or a short corpus leaving a day with no prompt.
  const Deck = require(path.join(BUNDLE, 'deck.js'))
  const prompts = JSON.parse(read('prompts.json'))

  for (let d = new Date(2024, 0, 1); d.getFullYear() === 2024; d.setDate(d.getDate() + 1)) {
    const prompt = Deck.todaysPrompt(prompts, new Date(d))
    assert.ok(prompt && prompt.id, `no prompt for ${d.toDateString()}`)
  }
})

test('every prompt in the real corpus produces insertable text with a closed note', () => {
  const Deck = require(path.join(BUNDLE, 'deck.js'))
  const prompts = JSON.parse(read('prompts.json'))

  prompts.forEach((prompt) => {
    const text = Deck.insertionText(prompt, { currentLineIsEmpty: true })

    // The block ends on the slugline: brief above, heading below, caret after.
    assert.ok(text.endsWith(prompt.scene_heading + '\n\n'), `${prompt.id}: heading must close the block`)
    assert.ok(text.startsWith('[['), `${prompt.id}: brief must open the block`)

    const opens = text.split('[[').length - 1
    const closes = text.split(']]').length - 1
    assert.strictEqual(opens, 1, `${prompt.id}: expected exactly one note opener`)
    assert.strictEqual(closes, 1, `${prompt.id}: expected exactly one note closer`)
    assert.ok(text.indexOf('[[') < text.indexOf(']]'), `${prompt.id}: note delimiters inverted`)
  })
})

/* ------------------------------------------------------------------ *
 * Manifest
 * ------------------------------------------------------------------ */

test('plugin.js opens with a manifest header Beat can read', () => {
  const plugin = read('plugin.js')

  assert.ok(plugin.startsWith('/*'), 'manifest comment must be the first thing in the file')
  assert.match(plugin, /Plugin name:\s*Daily Scene Prompter/)
  assert.match(plugin, /Version:\s*\d/)
  assert.ok(plugin.includes('<Description>') && plugin.includes('</Description>'))
})
