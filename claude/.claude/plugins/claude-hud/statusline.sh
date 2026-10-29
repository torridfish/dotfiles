#!/usr/bin/env bash
# Claude Code statusLine wrapper for claude-hud.
# Finds a JS runtime at run time instead of hard-coding its path, so the same
# settings.json works on every machine (nvm, Homebrew, apt, bun...).

find_runtime() {
    local c
    # 1. Whatever is already on PATH (works when Claude was started from a
    #    shell that loaded nvm/fnm/volta).
    for c in node bun; do
        command -v "$c" 2>/dev/null && return
    done
    # 2. Common install locations; for nvm pick the newest installed version.
    for c in \
        "$(ls -d "${NVM_DIR:-$HOME/.nvm}"/versions/node/*/bin/node 2>/dev/null | sort -V | tail -1)" \
        "$HOME/.volta/bin/node" \
        "$HOME/.local/bin/node" \
        /opt/homebrew/bin/node \
        /usr/local/bin/node \
        /usr/bin/node \
        "${BUN_INSTALL:-$HOME/.bun}/bin/bun"; do
        [ -n "$c" ] && [ -x "$c" ] && { echo "$c"; return; }
    done
    return 1
}

runtime=$(find_runtime) || exit 0  # no runtime: show an empty status line

cols=${COLUMNS:-}
case "$cols" in ""|*[!0-9]*) cols=$(stty size 2>/dev/null </dev/tty | awk '{print $2}');; esac
case "$cols" in ""|*[!0-9]*) cols=120;; esac
export COLUMNS=$(( cols > 4 ? cols - 4 : 1 ))

hud_home="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
# Newest installed claude-hud version in the plugin cache.
plugin_dir=$(ls -d "$hud_home"/plugins/cache/*/claude-hud/*/ 2>/dev/null \
    | awk -F/ '{ print $(NF-1) "\t" $0 }' \
    | grep -E '^[0-9]+\.[0-9]+\.[0-9]+[[:space:]]' \
    | sort -t. -k1,1n -k2,2n -k3,3n -k4,4n | tail -1 | cut -f2-)
[ -n "$plugin_dir" ] || exit 0

"$runtime" "${plugin_dir}dist/index.js" | "$runtime" "$hud_home/plugins/claude-hud/right-align.mjs"
