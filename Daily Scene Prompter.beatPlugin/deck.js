/**
 * deck.js — pure logic core for the Daily Scene Prompter Beat plugin.
 *
 * DESIGN CONSTRAINT: this file must contain no `Beat.*` calls, no DOM access and
 * no I/O. It runs unchanged in three separate JavaScript environments:
 *
 *   1. Node, under `npm test`.
 *   2. Beat's JavaScriptCore sandbox, where plugin.js uses it to build the text
 *      that gets inserted into the screenplay.
 *   3. The plugin's WKWebView panel, where ui.html uses it to pick, filter and
 *      render prompts. plugin.js splices the source of this file into the HTML
 *      at load time (the `#DECK_JS#` placeholder), because the web view cannot
 *      read files from the plugin bundle itself.
 *
 * Keeping it dependency-free is what makes the same selection logic testable on
 * the command line and runnable inside a sandbox with no module loader.
 */

;(function (root) {
  'use strict'

  /* ================================================================== *
   * Dates
   *
   * Every date routine here works in *local* calendar days. A writer at
   * 11pm is still on today's prompt and today's streak, even where UTC has
   * already rolled over.
   * ================================================================== */

  /**
   * Day of the year for a given date, 1-based (1 January = 1).
   *
   * Both endpoints are normalised to UTC midnight before subtracting. That is
   * what makes this DST-safe: a naive `endOfDay - startOfYear` in local time
   * drifts by an hour across a daylight-saving boundary, and the floor of that
   * drifted value silently reports the wrong day for part of the year.
   *
   * @param {Date} date
   * @returns {number} 1–366
   */
  function dayOfYear (date) {
    // Date.UTC(year, 0, 0) is "the day before 1 January", so 1 Jan lands on 1.
    var startOfYear = Date.UTC(date.getFullYear(), 0, 0)
    var thisDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
    return Math.round((thisDay - startOfYear) / 86400000)
  }

  /**
   * Formats a date as a `YYYY-MM-DD` key using the local calendar day.
   * This is the canonical key for streak bookkeeping and the only date format
   * we persist, so saved state stays readable and timezone-independent.
   *
   * @param {Date} date
   * @returns {string}
   */
  function isoDate (date) {
    var month = String(date.getMonth() + 1).padStart(2, '0')
    var day = String(date.getDate()).padStart(2, '0')
    return date.getFullYear() + '-' + month + '-' + day
  }

  /**
   * The calendar day before a `YYYY-MM-DD` key.
   *
   * Parsed and re-emitted through UTC so that month, year and leap-day
   * boundaries are handled by the Date implementation rather than by hand, and
   * so no local DST shift can push the result onto the wrong day.
   *
   * @param {string} iso
   * @returns {string}
   */
  function previousDay (iso) {
    var parts = iso.split('-')
    var stamp = Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
    var previous = new Date(stamp - 86400000)

    var month = String(previous.getUTCMonth() + 1).padStart(2, '0')
    var day = String(previous.getUTCDate()).padStart(2, '0')
    return previous.getUTCFullYear() + '-' + month + '-' + day
  }

  /* ================================================================== *
   * Prompt selection
   * ================================================================== */

  /**
   * The prompt of the day, seeded by day-of-year.
   *
   * Mirrors `web/lib/prompts.ts` in the screenwriting_daily project so that the
   * plugin and the web app surface the same prompt on the same date — which is
   * also how two writers on separate machines stay in sync without a server.
   *
   * @param {Array<Object>} prompts
   * @param {Date} date
   * @returns {Object|null} null when the corpus is empty
   */
  function todaysPrompt (prompts, date) {
    if (!prompts || prompts.length === 0) return null
    return prompts[dayOfYear(date) % prompts.length]
  }

  /**
   * Every distinct genre and tone present in the corpus, sorted.
   * Drives the filter dropdowns, so the UI never hardcodes a taxonomy that
   * could drift out of step with prompts.json.
   *
   * @param {Array<Object>} prompts
   * @returns {{genres: string[], tones: string[]}}
   */
  function facets (prompts) {
    var genres = {}
    var tones = {}

    ;(prompts || []).forEach(function (prompt) {
      ;(prompt.genre || []).forEach(function (genre) { genres[genre] = true })
      if (prompt.tone) tones[prompt.tone] = true
    })

    return {
      genres: Object.keys(genres).sort(),
      tones: Object.keys(tones).sort()
    }
  }

  /**
   * Narrows the corpus down to the prompts matching the active filters.
   *
   * Note the deliberate asymmetry between the two filters, which follows from
   * the shape of the data:
   *
   *   - GENRES use AND. A prompt carries several genres, so intersecting them
   *     answers the useful question — "give me something that is both action
   *     and thriller".
   *   - TONES use OR. A prompt has exactly one tone, so intersecting would
   *     always return nothing; unioning lets you ask for "anything eerie or
   *     unsettling".
   *
   * @param {Array<Object>} prompts
   * @param {Object} [filters]
   * @param {string[]} [filters.genres]     prompt must carry all of these
   * @param {string[]} [filters.tones]      prompt must carry one of these
   * @param {boolean}  [filters.hideWritten] drop prompts already written
   * @param {string[]} [filters.writtenIds]  ids considered already written
   * @returns {Array<Object>} possibly empty; never null
   */
  function filterPrompts (prompts, filters) {
    var options = filters || {}
    var genres = options.genres || []
    var tones = options.tones || []
    var writtenIds = options.writtenIds || []

    return (prompts || []).filter(function (prompt) {
      var promptGenres = prompt.genre || []

      // AND: every selected genre must be present on the prompt.
      for (var i = 0; i < genres.length; i++) {
        if (promptGenres.indexOf(genres[i]) === -1) return false
      }

      // OR: the prompt's single tone must appear in the selection.
      if (tones.length > 0 && tones.indexOf(prompt.tone) === -1) return false

      if (options.hideWritten && writtenIds.indexOf(prompt.id) !== -1) return false

      return true
    })
  }

  /**
   * Draws a prompt from a pool at random.
   *
   * `excludeId` is what makes the Shuffle button feel responsive: without it,
   * a 1-in-N chance of redrawing the prompt already on screen reads to the user
   * as a broken button. When the pool has narrowed to that single prompt we
   * return it anyway rather than returning nothing.
   *
   * @param {Array<Object>} pool
   * @param {function(): number} [rng] injectable for deterministic tests
   * @param {string} [excludeId] prompt id to avoid redrawing
   * @returns {Object|null} null only when the pool is empty
   */
  function pickRandom (pool, rng, excludeId) {
    if (!pool || pool.length === 0) return null
    var random = rng || Math.random

    var candidates = pool.filter(function (prompt) { return prompt.id !== excludeId })
    if (candidates.length === 0) candidates = pool

    // Clamp: guards against an rng that returns exactly 1, which would index
    // one past the end of the array.
    var index = Math.min(Math.floor(random() * candidates.length), candidates.length - 1)
    return candidates[index]
  }

  /* ================================================================== *
   * Screenplay text generation
   * ================================================================== */

  /**
   * Removes Beat note delimiters from a fragment of prompt copy.
   *
   * Anything we place between `[[` and `]]` becomes a note. A stray `]]` in a
   * description would close the note early and spill the rest of the prompt
   * into the screenplay as action text. Looping until the string stops changing
   * handles the case where deleting one delimiter brings two brackets together
   * to form a new one.
   *
   * @param {string} text
   * @returns {string}
   */
  function stripNoteDelimiters (text) {
    var cleaned = String(text == null ? '' : text)
    var previous

    do {
      previous = cleaned
      cleaned = cleaned.split(']]').join('').split('[[').join('')
    } while (cleaned !== previous)

    return cleaned
  }

  /**
   * Builds the block of Fountain text inserted when the writer hits "Insert".
   *
   * Shape:
   *
   *     [[A getaway driver waits outside a job that's gone wrong.
   *
   *     Tone: tense · DRIVER CASS, THE STRANGER]]
   *
   *     EXT. BANK - GETAWAY CAR - DAY
   *
   * The brief comes FIRST and the slugline LAST, which is what makes the block
   * read correctly on the page: the note is setup to be read before you start,
   * and the scene heading underneath it marks the boundary where the writing
   * actually begins. plugin.js leaves the caret at the end of this block, so
   * the writer lands directly beneath the slugline on the first line of action.
   *
   * The scene heading is a real slugline, so Beat parses it, colours it and
   * lists it in the outline. The prompt itself is a note — visible while
   * writing, automatically excluded from print and PDF export, so the writer
   * never has to remember to delete it before sending pages out.
   *
   * @param {Object} prompt
   * @param {Object} [context]
   * @param {boolean} [context.currentLineIsEmpty] true when the cursor sits on a blank line
   * @returns {string} text ready to hand to Beat.addString
   */
  function insertionText (prompt, context) {
    var options = context || {}

    // Without this padding the note would be appended to whatever the writer
    // was mid-sentence on, and Beat would fold it into that paragraph rather
    // than parsing it as a standalone note.
    var leadIn = options.currentLineIsEmpty ? '' : '\n\n'

    var noteLines = [stripNoteDelimiters(prompt.description)]

    // Tone and characters are optional in the corpus; only emit the meta line
    // when there is something to put on it.
    var meta = []
    if (prompt.tone) meta.push('Tone: ' + stripNoteDelimiters(prompt.tone))
    if (prompt.suggested_characters && prompt.suggested_characters.length > 0) {
      meta.push(prompt.suggested_characters.map(stripNoteDelimiters).join(', '))
    }
    if (meta.length > 0) {
      noteLines.push('') // blank line inside the note, separating brief from meta
      noteLines.push(meta.join(' · '))
    }

    return leadIn +
      '[[' + noteLines.join('\n') + ']]\n' +
      '\n' + // blank line, or Beat reads the slugline as part of the note's paragraph
      prompt.scene_heading + '\n' +
      '\n' // trailing blank line: the caret lands here, on the first line of action
  }

  /* ================================================================== *
   * Persisted state and streaks
   * ================================================================== */

  /**
   * A fresh, zeroed state object. Also the fallback whenever saved state turns
   * out to be missing or unreadable.
   *
   * @returns {{currentStreak: number, longestStreak: number, lastWrittenDate: (string|null), writtenIds: string[]}}
   */
  function emptyState () {
    return {
      currentStreak: 0,
      longestStreak: 0,
      lastWrittenDate: null,
      writtenIds: []
    }
  }

  /**
   * Normalises whatever came back out of persistence into a usable state object.
   *
   * Beat's user defaults are shared app-wide and survive plugin updates, so we
   * cannot assume the stored value still matches the current shape — it may be
   * a JSON string, a partial object from an older version, or garbage. Every
   * field is repaired individually so a single bad key cannot wipe the rest of
   * the writer's history.
   *
   * @param {*} saved
   * @returns {Object} a complete, valid state object
   */
  function hydrate (saved) {
    var raw = saved

    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw)
      } catch (error) {
        return emptyState()
      }
    }

    // Arrays are typeof 'object' but are never a valid state.
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return emptyState()

    var base = emptyState()

    return {
      currentStreak: isFiniteNumber(raw.currentStreak) ? raw.currentStreak : base.currentStreak,
      longestStreak: isFiniteNumber(raw.longestStreak) ? raw.longestStreak : base.longestStreak,
      lastWrittenDate: typeof raw.lastWrittenDate === 'string' ? raw.lastWrittenDate : base.lastWrittenDate,
      writtenIds: Array.isArray(raw.writtenIds) ? raw.writtenIds.slice() : base.writtenIds
    }
  }

  function isFiniteNumber (value) {
    return typeof value === 'number' && isFinite(value)
  }

  /**
   * Records that a prompt was written on a given day, returning updated state.
   *
   * Streak rules:
   *   - Already wrote today  → the streak does not move. Writing three scenes
   *     in one afternoon is one day of the habit, not three.
   *   - Last wrote yesterday → the streak extends.
   *   - Anything else        → the streak restarts at 1.
   *
   * Returns a new object; the input is never mutated, because the UI holds its
   * own copy and in-place mutation would leave the rendered view out of sync.
   *
   * @param {Object} state
   * @param {string} promptId
   * @param {string} todayISO `YYYY-MM-DD`
   * @returns {Object} new state
   */
  function markWritten (state, promptId, todayISO) {
    var previous = hydrate(state)

    var writtenIds = previous.writtenIds.indexOf(promptId) === -1
      ? previous.writtenIds.concat([promptId])
      : previous.writtenIds.slice()

    var current
    if (previous.lastWrittenDate === todayISO) {
      // Second prompt of the same day. Guard against a stored zero so the badge
      // cannot read "0" on a day the writer has demonstrably written.
      current = Math.max(previous.currentStreak, 1)
    } else if (previous.lastWrittenDate === previousDay(todayISO)) {
      current = Math.max(previous.currentStreak, 0) + 1
    } else {
      current = 1
    }

    return {
      currentStreak: current,
      longestStreak: Math.max(previous.longestStreak, current),
      lastWrittenDate: todayISO,
      writtenIds: writtenIds
    }
  }

  /**
   * The streak as it should be *displayed* today.
   *
   * Distinct from `state.currentStreak`, which is only the value as of the last
   * write. A streak whose last entry is older than yesterday has lapsed and
   * must read zero — but one written yesterday is still live, because the
   * writer has the rest of today to keep it going. Opening Beat in the morning
   * should not appear to punish you for not having written yet.
   *
   * @param {Object} state
   * @param {string} todayISO `YYYY-MM-DD`
   * @returns {number}
   */
  function currentStreak (state, todayISO) {
    var settled = hydrate(state)
    if (!settled.lastWrittenDate) return 0

    var isLive = settled.lastWrittenDate === todayISO ||
                 settled.lastWrittenDate === previousDay(todayISO)

    return isLive ? settled.currentStreak : 0
  }

  /**
   * Whether a prompt has been marked written.
   *
   * @param {Object} state
   * @param {string} promptId
   * @returns {boolean}
   */
  function isWritten (state, promptId) {
    return hydrate(state).writtenIds.indexOf(promptId) !== -1
  }

  /* ================================================================== *
   * Export
   *
   * CommonJS for the Node test run; a plain global otherwise, since neither
   * JavaScriptCore nor the web view has a module loader.
   * ================================================================== */

  var Deck = {
    dayOfYear: dayOfYear,
    isoDate: isoDate,
    previousDay: previousDay,
    todaysPrompt: todaysPrompt,
    facets: facets,
    filterPrompts: filterPrompts,
    pickRandom: pickRandom,
    insertionText: insertionText,
    emptyState: emptyState,
    hydrate: hydrate,
    markWritten: markWritten,
    currentStreak: currentStreak,
    isWritten: isWritten
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Deck
  } else {
    root.Deck = Deck
  }
})(
  // Resolve the global object defensively. plugin.js loads this file by
  // eval()ing it inside Beat's JavaScriptCore sandbox, where top-level `this`
  // is not reliably the global object; the web view gets `window`; Node takes
  // the module.exports branch above and never reads this argument.
  typeof globalThis !== 'undefined' ? globalThis
    : typeof window !== 'undefined' ? window
      : this
)
