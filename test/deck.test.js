/**
 * Tests for deck.js — the pure logic core of the Daily Scene Prompter plugin.
 *
 * deck.js deliberately contains no `Beat.*` calls so that it can run in three places:
 *   1. Node (here, under test)
 *   2. Beat's JavaScriptCore sandbox (plugin.js side)
 *   3. The plugin's WKWebView HTML panel (ui.html side)
 *
 * Everything that touches the editor, the filesystem, or user defaults lives in
 * plugin.js instead and is not covered here.
 */

const test = require('node:test')
const assert = require('node:assert')

const Deck = require('../Daily Scene Prompter.beatPlugin/deck.js')

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

/**
 * A miniature stand-in for prompts.json. Shaped exactly like the real corpus
 * (id/title/scene_heading/description/genre/themes/suggested_characters/tone)
 * so the tests exercise the same field access paths as production.
 */
const PROMPTS = [
  {
    id: 'prompt-001',
    title: 'The Last Shift',
    scene_heading: 'INT. DINER - NIGHT',
    description: 'A waitress on her final shift serves one last customer.',
    genre: ['drama'],
    themes: ['legacy', 'time'],
    suggested_characters: ['RUTH, 60s', 'THE STRANGER'],
    tone: 'melancholy'
  },
  {
    id: 'prompt-002',
    title: 'The Wrong Seat',
    scene_heading: 'EXT. BANK - GETAWAY CAR - DAY',
    description: "A getaway driver waits outside a job that's gone wrong.",
    genre: ['action', 'thriller'],
    themes: ['complicity'],
    suggested_characters: ['DRIVER CASS'],
    tone: 'tense'
  },
  {
    id: 'prompt-003',
    title: 'Shelf Life',
    scene_heading: 'INT. GROCERY STORE - 2 AM',
    description: 'Two night-shift stockers have been circling each other.',
    genre: ['romance', 'drama'],
    themes: ['timing'],
    suggested_characters: ['PRIYA', 'TOMÁS'],
    tone: 'tender'
  },
  {
    id: 'prompt-004',
    title: 'Summit',
    scene_heading: 'EXT. GRANITE FACE - DAWN',
    description: 'A free-climber reaches the top to find someone already there.',
    genre: ['action'],
    themes: ['trespass'],
    suggested_characters: ['DANI'],
    tone: 'eerie'
  }
]

/* ------------------------------------------------------------------ *
 * dayOfYear
 * ------------------------------------------------------------------ */

test('dayOfYear: 1 January is day 1', () => {
  assert.strictEqual(Deck.dayOfYear(new Date(2026, 0, 1)), 1)
})

test('dayOfYear: 31 December of a non-leap year is day 365', () => {
  assert.strictEqual(Deck.dayOfYear(new Date(2026, 11, 31)), 365)
})

test('dayOfYear: 31 December of a leap year is day 366', () => {
  assert.strictEqual(Deck.dayOfYear(new Date(2024, 11, 31)), 366)
})

test('dayOfYear: 29 February in a leap year is day 60', () => {
  assert.strictEqual(Deck.dayOfYear(new Date(2024, 1, 29)), 60)
})

test('dayOfYear: is unaffected by the time of day', () => {
  // Guards the classic bug where a millisecond-diff calculation drifts across a
  // DST boundary and reports the wrong day for late-evening local times.
  const morning = Deck.dayOfYear(new Date(2026, 6, 27, 0, 30))
  const night = Deck.dayOfYear(new Date(2026, 6, 27, 23, 30))
  assert.strictEqual(morning, night)
})

test('dayOfYear: every day across a DST-observing year is unique and contiguous', () => {
  // Walks a whole year in local time. If any day duplicates or skips, the
  // day-of-year seed would serve the same prompt twice (or skip one).
  const seen = []
  for (let d = new Date(2026, 0, 1); d.getFullYear() === 2026; d.setDate(d.getDate() + 1)) {
    seen.push(Deck.dayOfYear(new Date(d)))
  }
  assert.strictEqual(seen.length, 365)
  assert.deepStrictEqual(seen, seen.map((_, i) => i + 1))
})

/* ------------------------------------------------------------------ *
 * todaysPrompt
 * ------------------------------------------------------------------ */

test("todaysPrompt: picks by day-of-year, wrapping around the corpus", () => {
  // 1 Jan -> day 1 -> index 1 % 4 == 1. This mirrors web/lib/prompts.ts so the
  // plugin and the Next.js app agree on the prompt of the day.
  assert.strictEqual(Deck.todaysPrompt(PROMPTS, new Date(2026, 0, 1)).id, 'prompt-002')
})

test('todaysPrompt: wraps when day-of-year exceeds the corpus length', () => {
  // Day 5 with a 4-prompt corpus -> index 1.
  assert.strictEqual(Deck.todaysPrompt(PROMPTS, new Date(2026, 0, 5)).id, 'prompt-002')
})

test('todaysPrompt: is stable for the same calendar day', () => {
  const a = Deck.todaysPrompt(PROMPTS, new Date(2026, 5, 14, 6, 0))
  const b = Deck.todaysPrompt(PROMPTS, new Date(2026, 5, 14, 22, 0))
  assert.strictEqual(a.id, b.id)
})

test('todaysPrompt: returns null for an empty corpus rather than throwing', () => {
  assert.strictEqual(Deck.todaysPrompt([], new Date(2026, 0, 1)), null)
})

/* ------------------------------------------------------------------ *
 * facets — powers the genre/tone dropdowns
 * ------------------------------------------------------------------ */

test('facets: collects sorted, de-duplicated genres and tones', () => {
  const f = Deck.facets(PROMPTS)
  assert.deepStrictEqual(f.genres, ['action', 'drama', 'romance', 'thriller'])
  assert.deepStrictEqual(f.tones, ['eerie', 'melancholy', 'tender', 'tense'])
})

test('facets: handles an empty corpus', () => {
  assert.deepStrictEqual(Deck.facets([]), { genres: [], tones: [] })
})

/* ------------------------------------------------------------------ *
 * filterPrompts
 * ------------------------------------------------------------------ */

test('filterPrompts: no filters returns everything', () => {
  assert.strictEqual(Deck.filterPrompts(PROMPTS, {}).length, 4)
})

test('filterPrompts: genres use AND logic — a prompt must carry every selected genre', () => {
  // This asymmetry is deliberate and matches the web archive filter: genres are
  // multi-valued per prompt, so intersecting them is the useful operation
  // ("show me something that is BOTH action AND thriller").
  const both = Deck.filterPrompts(PROMPTS, { genres: ['action', 'thriller'] })
  assert.deepStrictEqual(both.map((p) => p.id), ['prompt-002'])
})

test('filterPrompts: a single genre matches any prompt carrying it', () => {
  const action = Deck.filterPrompts(PROMPTS, { genres: ['action'] })
  assert.deepStrictEqual(action.map((p) => p.id), ['prompt-002', 'prompt-004'])
})

test('filterPrompts: tones use OR logic — a prompt has exactly one tone', () => {
  const moody = Deck.filterPrompts(PROMPTS, { tones: ['melancholy', 'eerie'] })
  assert.deepStrictEqual(moody.map((p) => p.id), ['prompt-001', 'prompt-004'])
})

test('filterPrompts: genre and tone filters combine', () => {
  const result = Deck.filterPrompts(PROMPTS, { genres: ['action'], tones: ['eerie'] })
  assert.deepStrictEqual(result.map((p) => p.id), ['prompt-004'])
})

test('filterPrompts: hideWritten drops prompts already marked written', () => {
  const result = Deck.filterPrompts(PROMPTS, {
    hideWritten: true,
    writtenIds: ['prompt-001', 'prompt-003']
  })
  assert.deepStrictEqual(result.map((p) => p.id), ['prompt-002', 'prompt-004'])
})

test('filterPrompts: hideWritten is ignored when false', () => {
  const result = Deck.filterPrompts(PROMPTS, {
    hideWritten: false,
    writtenIds: ['prompt-001']
  })
  assert.strictEqual(result.length, 4)
})

test('filterPrompts: an over-constrained filter yields an empty array, not an error', () => {
  const result = Deck.filterPrompts(PROMPTS, { genres: ['horror'] })
  assert.deepStrictEqual(result, [])
})

/* ------------------------------------------------------------------ *
 * pickRandom — the Shuffle button
 * ------------------------------------------------------------------ */

test('pickRandom: returns a member of the pool', () => {
  const picked = Deck.pickRandom(PROMPTS, () => 0.5)
  assert.ok(PROMPTS.includes(picked))
})

test('pickRandom: an rng of ~0 selects the first candidate', () => {
  assert.strictEqual(Deck.pickRandom(PROMPTS, () => 0).id, 'prompt-001')
})

test('pickRandom: an rng approaching 1 selects the last candidate', () => {
  // Math.random() is exclusive of 1, so 0.999… must stay in bounds.
  assert.strictEqual(Deck.pickRandom(PROMPTS, () => 0.999999).id, 'prompt-004')
})

test('pickRandom: never returns the excluded prompt, so Shuffle always visibly changes', () => {
  // Exhaustively sweep the rng range to prove the exclusion holds for every draw.
  for (let i = 0; i < 100; i++) {
    const picked = Deck.pickRandom(PROMPTS, () => i / 100, 'prompt-002')
    assert.notStrictEqual(picked.id, 'prompt-002')
  }
})

test('pickRandom: falls back to the excluded prompt when it is the only candidate', () => {
  const solo = [PROMPTS[1]]
  assert.strictEqual(Deck.pickRandom(solo, () => 0.5, 'prompt-002').id, 'prompt-002')
})

test('pickRandom: returns null for an empty pool', () => {
  assert.strictEqual(Deck.pickRandom([], () => 0.5), null)
})

/* ------------------------------------------------------------------ *
 * insertionText — what actually lands in the screenplay
 * ------------------------------------------------------------------ */

test('insertionText: emits the brief first, then the scene heading', () => {
  // Order matters to the writer: the brief reads as setup, and the slugline
  // sitting underneath it marks where the actual writing starts.
  const text = Deck.insertionText(PROMPTS[1], { currentLineIsEmpty: true })
  const lines = text.split('\n')

  assert.ok(lines[0].startsWith('[['), 'note should open the block')
  assert.ok(text.includes("A getaway driver waits outside a job that's gone wrong."))
  assert.ok(text.includes(']]'), 'note must be closed')
  assert.ok(text.indexOf(']]') < text.indexOf('EXT.'), 'note must close before the slugline')
})

test('insertionText: separates the closed note from the slugline with a blank line', () => {
  // Without the blank line Beat would read the slugline as a continuation of
  // the note's paragraph rather than as a scene heading.
  const text = Deck.insertionText(PROMPTS[1], { currentLineIsEmpty: true })
  const lines = text.split('\n')

  const noteEnd = lines.findIndex((line) => line.endsWith(']]'))
  assert.notStrictEqual(noteEnd, -1, 'no line closes the note')
  assert.strictEqual(lines[noteEnd + 1], '', 'expected a blank line after the note')
  assert.strictEqual(lines[noteEnd + 2], 'EXT. BANK - GETAWAY CAR - DAY')
})

test('insertionText: the note carries tone and suggested characters', () => {
  const text = Deck.insertionText(PROMPTS[0], { currentLineIsEmpty: true })
  assert.ok(text.includes('Tone: melancholy'))
  assert.ok(text.includes('RUTH, 60s'))
  assert.ok(text.includes('THE STRANGER'))
})

test('insertionText: prepends a blank line when the cursor sits on a non-empty line', () => {
  // Without this, the note would be glued onto whatever the writer was
  // mid-sentence on, and Beat would not parse it as a standalone note.
  const text = Deck.insertionText(PROMPTS[1], { currentLineIsEmpty: false })
  assert.ok(text.startsWith('\n\n[['), `expected leading blank line, got ${JSON.stringify(text.slice(0, 12))}`)
})

test('insertionText: adds no leading padding on an empty line', () => {
  const text = Deck.insertionText(PROMPTS[1], { currentLineIsEmpty: true })
  assert.ok(text.startsWith('[['))
})

test('insertionText: ends after the slugline, so the caret lands where writing begins', () => {
  // plugin.js drops the caret at the end of this block. Ending just below the
  // scene heading is what puts the writer on the first line of action.
  const text = Deck.insertionText(PROMPTS[1], { currentLineIsEmpty: true })
  assert.ok(text.endsWith('EXT. BANK - GETAWAY CAR - DAY\n\n'))
})

test('insertionText: strips note delimiters from prompt copy so the note cannot break out', () => {
  // A stray "]]" inside a description would terminate the note early and dump
  // the remainder into the script as action text.
  const hostile = {
    ...PROMPTS[0],
    description: 'She reads the sign ]] and then [[ turns away.',
    suggested_characters: ['RUTH ]]']
  }
  const text = Deck.insertionText(hostile, { currentLineIsEmpty: true })
  const body = text.slice(text.indexOf('[[') + 2, text.lastIndexOf(']]'))

  assert.ok(!body.includes(']]'), 'inner text must not contain a closing delimiter')
  assert.ok(!body.includes('[['), 'inner text must not contain an opening delimiter')
  assert.ok(body.includes('She reads the sign'))
})

test('insertionText: tolerates a prompt with no suggested characters', () => {
  const sparse = { ...PROMPTS[0], suggested_characters: [] }
  const text = Deck.insertionText(sparse, { currentLineIsEmpty: true })
  assert.ok(text.includes('Tone: melancholy'))
  assert.ok(text.includes(']]'))
})

test('insertionText: tolerates a prompt missing optional fields entirely', () => {
  const bare = { id: 'x', title: 'X', scene_heading: 'INT. VOID - DAY', description: 'Nothing.' }
  const text = Deck.insertionText(bare, { currentLineIsEmpty: true })

  // With no tone or cast the note collapses to a single line, but the slugline
  // must still end up below it with a blank line between.
  assert.strictEqual(text, '[[Nothing.]]\n\nINT. VOID - DAY\n\n')
})

/* ------------------------------------------------------------------ *
 * State + streak tracking
 * ------------------------------------------------------------------ */

test('emptyState: starts at zero with no history', () => {
  assert.deepStrictEqual(Deck.emptyState(), {
    currentStreak: 0,
    longestStreak: 0,
    lastWrittenDate: null,
    writtenIds: []
  })
})

test('markWritten: the first entry opens a one-day streak', () => {
  const state = Deck.markWritten(Deck.emptyState(), 'prompt-001', '2026-07-27')
  assert.strictEqual(state.currentStreak, 1)
  assert.strictEqual(state.longestStreak, 1)
  assert.strictEqual(state.lastWrittenDate, '2026-07-27')
  assert.deepStrictEqual(state.writtenIds, ['prompt-001'])
})

test('markWritten: writing on consecutive days extends the streak', () => {
  let state = Deck.markWritten(Deck.emptyState(), 'prompt-001', '2026-07-27')
  state = Deck.markWritten(state, 'prompt-002', '2026-07-28')
  state = Deck.markWritten(state, 'prompt-003', '2026-07-29')
  assert.strictEqual(state.currentStreak, 3)
  assert.strictEqual(state.longestStreak, 3)
})

test('markWritten: a second prompt on the same day records the id but does not inflate the streak', () => {
  let state = Deck.markWritten(Deck.emptyState(), 'prompt-001', '2026-07-27')
  state = Deck.markWritten(state, 'prompt-002', '2026-07-27')
  assert.strictEqual(state.currentStreak, 1)
  assert.deepStrictEqual(state.writtenIds, ['prompt-001', 'prompt-002'])
})

test('markWritten: a missed day resets the current streak to 1', () => {
  let state = Deck.markWritten(Deck.emptyState(), 'prompt-001', '2026-07-27')
  state = Deck.markWritten(state, 'prompt-002', '2026-07-29') // 28th skipped
  assert.strictEqual(state.currentStreak, 1)
})

test('markWritten: a reset preserves the longest streak', () => {
  let state = Deck.markWritten(Deck.emptyState(), 'p1', '2026-07-01')
  state = Deck.markWritten(state, 'p2', '2026-07-02')
  state = Deck.markWritten(state, 'p3', '2026-07-03')
  state = Deck.markWritten(state, 'p4', '2026-07-20') // long gap
  assert.strictEqual(state.currentStreak, 1)
  assert.strictEqual(state.longestStreak, 3)
})

test('markWritten: streaks span month boundaries', () => {
  let state = Deck.markWritten(Deck.emptyState(), 'p1', '2026-07-31')
  state = Deck.markWritten(state, 'p2', '2026-08-01')
  assert.strictEqual(state.currentStreak, 2)
})

test('markWritten: streaks span year boundaries', () => {
  let state = Deck.markWritten(Deck.emptyState(), 'p1', '2026-12-31')
  state = Deck.markWritten(state, 'p2', '2027-01-01')
  assert.strictEqual(state.currentStreak, 2)
})

test('markWritten: streaks span a leap day', () => {
  let state = Deck.markWritten(Deck.emptyState(), 'p1', '2024-02-28')
  state = Deck.markWritten(state, 'p2', '2024-02-29')
  state = Deck.markWritten(state, 'p3', '2024-03-01')
  assert.strictEqual(state.currentStreak, 3)
})

test('markWritten: re-marking the same prompt does not duplicate the id', () => {
  let state = Deck.markWritten(Deck.emptyState(), 'prompt-001', '2026-07-27')
  state = Deck.markWritten(state, 'prompt-001', '2026-07-28')
  assert.deepStrictEqual(state.writtenIds, ['prompt-001'])
})

test('markWritten: does not mutate the state it was given', () => {
  // The UI keeps a copy; in-place mutation would desync the rendered view.
  const before = Deck.emptyState()
  Deck.markWritten(before, 'prompt-001', '2026-07-27')
  assert.deepStrictEqual(before, Deck.emptyState())
})

test('isWritten: reports membership of the written set', () => {
  const state = Deck.markWritten(Deck.emptyState(), 'prompt-001', '2026-07-27')
  assert.strictEqual(Deck.isWritten(state, 'prompt-001'), true)
  assert.strictEqual(Deck.isWritten(state, 'prompt-002'), false)
})

/* ------------------------------------------------------------------ *
 * currentStreak — decay when the app is reopened after a gap
 * ------------------------------------------------------------------ */

test('currentStreak: a streak written today still counts', () => {
  const state = Deck.markWritten(Deck.emptyState(), 'p1', '2026-07-27')
  assert.strictEqual(Deck.currentStreak(state, '2026-07-27'), 1)
})

test('currentStreak: a streak written yesterday is still live', () => {
  // Opening Beat in the morning should not wipe last night's streak — the
  // writer still has the whole day to keep it alive.
  const state = Deck.markWritten(Deck.emptyState(), 'p1', '2026-07-26')
  assert.strictEqual(Deck.currentStreak(state, '2026-07-27'), 1)
})

test('currentStreak: a streak older than yesterday has lapsed and reads zero', () => {
  const state = Deck.markWritten(Deck.emptyState(), 'p1', '2026-07-20')
  assert.strictEqual(Deck.currentStreak(state, '2026-07-27'), 0)
})

test('currentStreak: an empty state reads zero', () => {
  assert.strictEqual(Deck.currentStreak(Deck.emptyState(), '2026-07-27'), 0)
})

/* ------------------------------------------------------------------ *
 * hydrate — tolerating whatever comes back out of user defaults
 * ------------------------------------------------------------------ */

test('hydrate: restores a well-formed saved state', () => {
  const saved = { currentStreak: 5, longestStreak: 9, lastWrittenDate: '2026-07-27', writtenIds: ['p1'] }
  assert.deepStrictEqual(Deck.hydrate(saved), saved)
})

test('hydrate: parses a JSON string, since user defaults may round-trip as text', () => {
  const saved = { currentStreak: 2, longestStreak: 2, lastWrittenDate: '2026-07-27', writtenIds: ['p1'] }
  assert.deepStrictEqual(Deck.hydrate(JSON.stringify(saved)), saved)
})

test('hydrate: falls back to an empty state for null, undefined or junk', () => {
  assert.deepStrictEqual(Deck.hydrate(null), Deck.emptyState())
  assert.deepStrictEqual(Deck.hydrate(undefined), Deck.emptyState())
  assert.deepStrictEqual(Deck.hydrate('not json {{{'), Deck.emptyState())
  assert.deepStrictEqual(Deck.hydrate(42), Deck.emptyState())
})

test('hydrate: repairs a partial state rather than propagating undefined into the UI', () => {
  const repaired = Deck.hydrate({ currentStreak: 3 })
  assert.strictEqual(repaired.currentStreak, 3)
  assert.strictEqual(repaired.longestStreak, 0)
  assert.strictEqual(repaired.lastWrittenDate, null)
  assert.deepStrictEqual(repaired.writtenIds, [])
})

test('hydrate: coerces a non-array writtenIds back to an array', () => {
  assert.deepStrictEqual(Deck.hydrate({ writtenIds: 'oops' }).writtenIds, [])
})

/* ------------------------------------------------------------------ *
 * isoDate — the canonical local calendar-day key
 * ------------------------------------------------------------------ */

test('isoDate: formats as YYYY-MM-DD with zero padding', () => {
  assert.strictEqual(Deck.isoDate(new Date(2026, 0, 5)), '2026-01-05')
})

test('isoDate: uses the local calendar day, not UTC', () => {
  // A writer at 23:00 local on the 27th is on day 27, even where that is
  // already the 28th in UTC. Streaks must follow the writer's own midnight.
  assert.strictEqual(Deck.isoDate(new Date(2026, 6, 27, 23, 0)), '2026-07-27')
})
