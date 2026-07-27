#!/usr/bin/env bash
#
# Packages the plugin into dist/ as a zip your writing partner can install,
# and optionally installs it into your own copy of Beat.
#
#   ./build.sh             package only
#   ./build.sh --install   package, then install into the local Beat plugins folder
#
# Beat is sandboxed, so its plugin folder lives inside its container rather than
# in the usual ~/Library/Application Support location.

set -euo pipefail

PLUGIN_NAME="Daily Scene Prompter.beatPlugin"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$PROJECT_DIR/dist"
BEAT_PLUGINS="$HOME/Library/Containers/fi.KAPITAN.Beat/Data/Library/Application Support/Beat/Plugins"

cd "$PROJECT_DIR"

# --- Sanity checks -----------------------------------------------------------
# Beat reports a broken plugin as a silent no-op, so it is worth failing loudly
# here instead of discovering it in the app.

if [[ ! -d "$PLUGIN_NAME" ]]; then
	echo "error: $PLUGIN_NAME not found in $PROJECT_DIR" >&2
	exit 1
fi

for required in plugin.js deck.js ui.html prompts.json; do
	if [[ ! -f "$PLUGIN_NAME/$required" ]]; then
		echo "error: $PLUGIN_NAME is missing $required" >&2
		exit 1
	fi
done

# --- Test --------------------------------------------------------------------
# Never package a bundle whose tests do not pass.

echo "==> Running tests"
node --test test/*.test.js > /dev/null

VERSION="$(sed -n 's/^Version: *//p' "$PLUGIN_NAME/plugin.js" | head -1)"
: "${VERSION:=0.0}"

# --- Package -----------------------------------------------------------------

echo "==> Packaging version $VERSION"
mkdir -p "$DIST_DIR"

ZIP_PATH="$DIST_DIR/Daily Scene Prompter $VERSION.zip"
rm -f "$ZIP_PATH"

# -x excludes macOS metadata that would otherwise ride along and clutter the
# recipient's plugin folder.
zip -r -q "$ZIP_PATH" "$PLUGIN_NAME" -x '*.DS_Store' -x '__MACOSX/*'

echo "    $ZIP_PATH"

# --- Install -----------------------------------------------------------------

if [[ "${1:-}" == "--install" ]]; then
	if [[ ! -d "$BEAT_PLUGINS" ]]; then
		echo "error: Beat plugins folder not found at:" >&2
		echo "  $BEAT_PLUGINS" >&2
		echo "Open Beat once (Tools -> Plugin Library) so it creates the folder, then retry." >&2
		exit 1
	fi

	echo "==> Installing into Beat"
	rm -rf "$BEAT_PLUGINS/$PLUGIN_NAME"
	cp -R "$PLUGIN_NAME" "$BEAT_PLUGINS/$PLUGIN_NAME"
	echo "    installed. Restart Beat, then open Tools -> Daily Scene Prompter."
fi
