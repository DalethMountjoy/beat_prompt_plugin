/*

Plugin name: Daily Scene Prompter
Description: A daily scene-prompt deck that lives beside your script.
Version: 1.0
Type: Tool

<Description>
<p>A deck of <b>365 scene prompts</b> in a panel next to your screenplay — one for
every day of the year, plus filtering and shuffling when you want something else.</p>
<ul>
	<li>Today's prompt, seeded by the date, so collaborators on different machines see the same one</li>
	<li>Filter by genre and tone, or hide prompts you have already written</li>
	<li>Insert the scene heading straight into your script, with the brief attached as a note that never prints</li>
	<li>Tracks a writing streak across every document you open</li>
</ul>
</Description>

*/

/* ====================================================================== *
 * Daily Scene Prompter
 *
 * This file is the only part of the plugin that talks to Beat. It is
 * deliberately thin — it wires four things together and nothing more:
 *
 *   1. Loads the prompt corpus and the writer's saved state.
 *   2. Builds the HTML panel by splicing data into ui.html.
 *   3. Exposes Beat.custom.* functions the panel can call back into.
 *   4. Registers menu items.
 *
 * All decision-making (which prompt, which filter, what text to insert, how
 * streaks advance) lives in deck.js, which has no Beat dependency and is
 * covered by the Node test suite in ../test/.
 * ====================================================================== */

/* ---------------------------------------------------------------------- *
 * Constants
 * ---------------------------------------------------------------------- */

// Beat's user defaults are shared app-wide, so keys are prefixed to avoid
// colliding with other plugins. State is deliberately app-wide rather than
// per-document: a writing streak belongs to the writer, not to one script.
var STATE_KEY = 'sceneprompter_state'
var FILTERS_KEY = 'sceneprompter_filters'

var WINDOW_WIDTH = 400
var WINDOW_HEIGHT = 640

/* ---------------------------------------------------------------------- *
 * Load the shared logic
 *
 * deck.js is eval'd rather than imported because Beat's JavaScriptCore sandbox
 * has no module loader. It defines a global `Deck`. This is our own bundled
 * asset, never remote content.
 * ---------------------------------------------------------------------- */

eval(Beat.assetAsString('deck.js'))

if (typeof Deck === 'undefined') {
	Beat.alert('Daily Scene Prompter could not start',
		'deck.js failed to load. The plugin folder may be incomplete — try reinstalling it.')
	return
}

/* ---------------------------------------------------------------------- *
 * Load data
 * ---------------------------------------------------------------------- */

var prompts = []

try {
	prompts = JSON.parse(Beat.assetAsString('prompts.json'))
} catch (error) {
	Beat.alert('Daily Scene Prompter could not start',
		'prompts.json is missing or malformed.\n\n' + error)
	return
}

if (!prompts || prompts.length === 0) {
	Beat.alert('Daily Scene Prompter could not start', 'prompts.json contains no prompts.')
	return
}

// hydrate() tolerates a missing key, a JSON string, or state left behind by an
// older version of the plugin.
var state = Deck.hydrate(Beat.getUserDefault(STATE_KEY))
var filters = loadFilters()

/* ====================================================================== *
 * Functions the HTML panel calls back into
 *
 * The panel reaches these via Beat.call("Beat.custom.name(arg)"). They are the
 * only route from the web view to the editor.
 *
 * Defined BEFORE the window is created: these are assignments rather than
 * hoisted declarations, so opening the panel first would leave a window on
 * screen whose buttons call into an empty bridge.
 * ====================================================================== */

Beat.custom = {}

// Assigned once the window exists, further down. Declared here because the
// callbacks below close over it.
var promptWindow = null

/**
 * Inserts a prompt's scene heading and brief into the script.
 *
 * @param {string} promptId
 */
Beat.custom.insertPrompt = function (promptId) {
	var prompt = findPrompt(promptId)
	if (!prompt) return

	var target = insertionPoint()
	var text = Deck.insertionText(prompt, { currentLineIsEmpty: target.lineIsEmpty })

	Beat.addString(text, target.location)

	// Re-parse the inserted range so the slugline is recognised as a scene
	// heading (and appears in the outline) without waiting for the next edit.
	try {
		Beat.reformatRange(target.location, text.length)
	} catch (error) {
		Beat.log('Scene Prompter: reformat skipped — ' + error)
	}

	// Drop the caret at the end of the inserted block, ready to write action,
	// and put focus back where the writing happens.
	var caret = target.location + text.length
	Beat.setSelectedRange(caret, 0)
	Beat.scrollTo(caret)
	Beat.focusEditor()
}

/**
 * Records a prompt as written and advances the streak.
 *
 * @param {string} promptId
 */
Beat.custom.markWritten = function (promptId) {
	if (!findPrompt(promptId)) return

	state = Deck.markWritten(state, promptId, Deck.isoDate(new Date()))
	Beat.setUserDefault(STATE_KEY, JSON.stringify(state))

	// The plugin is the single writer of state; push the new value so the
	// panel's copy cannot drift out of sync with what was persisted.
	pushState()
}

/**
 * Persists the panel's filter selection so it survives a restart.
 *
 * @param {Object} next
 */
Beat.custom.saveFilters = function (next) {
	filters = {
		genres: (next && next.genres) || [],
		tones: (next && next.tones) || [],
		hideWritten: !!(next && next.hideWritten)
	}
	Beat.setUserDefault(FILTERS_KEY, JSON.stringify(filters))
}

/* ---------------------------------------------------------------------- *
 * Build and open the panel
 * ---------------------------------------------------------------------- */

var html = Beat.assetAsString('ui.html')

// The web view cannot read files out of the plugin bundle, so the logic and the
// data are spliced into the page before it is handed over.
html = inject(html, '/*#DECK_JS#*/', Beat.assetAsString('deck.js'))
html = inject(html, '/*#PROMPTS#*/', JSON.stringify(prompts))
html = inject(html, '/*#STATE#*/', JSON.stringify(state))
html = inject(html, '/*#FILTERS#*/', JSON.stringify(filters))

promptWindow = Beat.htmlWindow(html, WINDOW_WIDTH, WINDOW_HEIGHT, function () {
	// Closing the window terminates the plugin. Without this it would stay
	// resident with no way to reach it.
	Beat.end()
})

// Keep the panel attached to its document window, so it travels with the script
// it belongs to instead of floating over every open project. Guarded because
// older Beat builds do not expose it.
try {
	if (typeof promptWindow.gangWithDocumentWindow === 'function') {
		promptWindow.gangWithDocumentWindow()
	}
} catch (error) {
	Beat.log('Scene Prompter: could not gang window to document — ' + error)
}

registerMenu()

/* ====================================================================== *
 * Helpers
 * ====================================================================== */

/**
 * Substitutes a placeholder in a template.
 *
 * Deliberately avoids String.replace: with a string pattern, `$&`, `$'` and
 * friends in the REPLACEMENT are treated as substitution directives. The prompt
 * corpus contains dollar signs, so replace() would silently corrupt the data.
 *
 * @param {string} template
 * @param {string} placeholder
 * @param {string} value
 * @returns {string}
 */
function inject (template, placeholder, value) {
	var index = template.indexOf(placeholder)
	if (index === -1) {
		Beat.log('Scene Prompter: placeholder ' + placeholder + ' not found in ui.html')
		return template
	}
	return template.slice(0, index) + value + template.slice(index + placeholder.length)
}

/**
 * Finds a prompt by id.
 *
 * @param {string} promptId
 * @returns {Object|null}
 */
function findPrompt (promptId) {
	for (var i = 0; i < prompts.length; i++) {
		if (prompts[i].id === promptId) return prompts[i]
	}
	Beat.log('Scene Prompter: unknown prompt id ' + promptId)
	return null
}

/**
 * Works out where in the document to insert, and whether padding is needed.
 *
 * Inserting at the raw cursor offset would split whatever line the writer is
 * on. Instead we go to the END of the current line — so the new scene always
 * begins on a line of its own — and report whether that line was blank so
 * deck.js can decide about a separating blank line.
 *
 * @returns {{location: number, lineIsEmpty: boolean}}
 */
function insertionPoint () {
	try {
		var line = Beat.currentLine

		if (line && typeof line.position === 'number') {
			var isEmpty = !line.string || line.string.trim().length === 0
			return {
				location: isEmpty ? line.position : line.position + line.length,
				lineIsEmpty: isEmpty
			}
		}
	} catch (error) {
		Beat.log('Scene Prompter: could not read current line — ' + error)
	}

	// Fallback: the caret itself. Assume padding is needed, since we cannot tell
	// what is around it — a spurious blank line is harmless, a broken slugline
	// is not.
	return { location: Beat.selectedRange().location, lineIsEmpty: false }
}

/** Pushes the current state object into the panel. */
function pushState () {
	promptWindow.runJS('applyState(' + JSON.stringify(state) + ')')
}

/**
 * Reads saved filters, falling back to an empty selection.
 *
 * @returns {{genres: string[], tones: string[], hideWritten: boolean}}
 */
function loadFilters () {
	var empty = { genres: [], tones: [], hideWritten: false }
	var saved = Beat.getUserDefault(FILTERS_KEY)

	if (typeof saved === 'string') {
		try {
			saved = JSON.parse(saved)
		} catch (error) {
			return empty
		}
	}

	if (!saved || typeof saved !== 'object') return empty

	return {
		genres: Array.isArray(saved.genres) ? saved.genres : [],
		tones: Array.isArray(saved.tones) ? saved.tones : [],
		hideWritten: !!saved.hideWritten
	}
}

/**
 * Adds a Scene Prompter menu to the menu bar.
 *
 * Each item drives the panel rather than duplicating its logic, so there is one
 * implementation of every action. Number-key shortcuts are used because the
 * letter combinations in this modifier space are heavily taken by other plugins.
 */
function registerMenu () {
	try {
		Beat.menu('Scene Prompter', [
			Beat.menuItem("Today's Prompt", ['ctrl', 'alt', '1'], function () {
				promptWindow.runJS('goToToday()')
			}),
			Beat.menuItem('Shuffle', ['ctrl', 'alt', '2'], function () {
				promptWindow.runJS('shuffle()')
			}),
			Beat.separatorMenuItem(),
			Beat.menuItem('Insert Current Prompt', ['ctrl', 'alt', '3'], function () {
				promptWindow.runJS('insertPrompt()')
			}),
			Beat.menuItem('Mark Current Prompt Written', [], function () {
				promptWindow.runJS('markWritten()')
			})
		])
	} catch (error) {
		// Menus are macOS-only and version-dependent; the panel remains fully
		// usable without them, so this is not worth interrupting the writer for.
		Beat.log('Scene Prompter: menu registration skipped — ' + error)
	}
}
