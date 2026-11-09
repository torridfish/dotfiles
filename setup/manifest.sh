# shellcheck shell=bash
# =============================================================================
# Single source of truth for what setup.sh can install and link.
# Sourced by setup.sh. Edit this file to add or change an item.
#
# Profiles: "local" (workstation with a desktop) and "server" (HPC login node,
# usually no sudo). Every install method below works without sudo.
# =============================================================================

# -----------------------------------------------------------------------------
# TOOLS: programs to install.
#   id|check|method|spec|profiles|description
#
#   check     command name (tested with `command -v`), or a path that starts
#             with ~ or / (tested with `test -e`). A tool that passes the check
#             counts as installed and is skipped.
#   method    pixi : spec = conda-forge package names, installed with
#                    `pixi global install` into ~/.pixi/bin.
#             fn   : spec = function in this file, runs before stowing.
#             post : spec = function in this file, runs after stowing.
#   profiles  letters of the profiles that select the tool by default:
#             l = local, s = server, - = off by default.
# -----------------------------------------------------------------------------
TOOLS=(
"stow|stow|pixi|stow|ls|GNU Stow (required to link configs)"
"git|git|pixi|git git-lfs|ls|Git and Git LFS"
"gh|gh|pixi|gh|ls|GitHub CLI"
"zsh|zsh|pixi|zsh|ls|Zsh"
"starship|starship|pixi|starship|ls|Starship prompt"
"tmux|tmux|pixi|tmux|ls|Terminal multiplexer"
"vim|vim|pixi|vim|ls|Vim"
"btop|btop|pixi|btop|ls|System monitor"
"yazi|yazi|pixi|yazi|ls|File manager"
"uv|uv|pixi|uv|ls|Python package and venv manager"
"ohmyzsh|~/.oh-my-zsh|fn|install_ohmyzsh|ls|Oh My Zsh with autosuggestions and syntax highlighting"
"tpm|~/.tmux/plugins/tpm|post|install_tpm|ls|Tmux Plugin Manager and the plugins in tmux.conf"
"nvm|~/.nvm|fn|install_nvm|-|nvm (Node.js version manager)"
"bun|bun|pixi|bun|-|Bun JavaScript runtime"
"pnpm|pnpm|pixi|pnpm|-|pnpm package manager"
"rustup|~/.cargo/bin/rustup|fn|install_rustup|-|Rust toolchain via rustup"
)

# -----------------------------------------------------------------------------
# STOW: description and defaults for each stow package (top-level directory).
#   package|profiles|needs|description
#
#   needs     space-separated. A TOOLS id warns when that tool is neither
#             installed nor selected. `sys:<name>` marks a program that this
#             script cannot install without root; install it with the system
#             package manager.
#
# A directory that is missing here still shows up in the menu, off by default,
# so a new package is never silently skipped. Directories without tracked
# files (for example an empty ssh/) are hidden.
# -----------------------------------------------------------------------------
STOW_META=(
"agent|ls||Shared global AGENTS.md (~/.agent)"
"agents|ls||Cross-agent skills (~/.agents plus links into ~/.claude and ~/.codex)"
"autostart|l|sys:fcitx5 sys:deskflow sys:syncthing|XDG autostart entries"
"bash|l||bashrc and profile (off on servers)"
"btop|ls|btop|btop config"
"cava|l|sys:cava|cava config"
"claude|ls||Claude Code settings and statusline"
"condarc|ls||conda channels and priority"
"deskflow|l|sys:deskflow|Deskflow screen layout"
"fcitx5|l|sys:fcitx5|fcitx5 input method config"
"gemini|ls||Antigravity (agy) global rules"
"gh|ls|gh|GitHub CLI config"
"git|ls|git|Git config and commit template"
"herdr|ls||herdr config"
"kitty|l|sys:kitty|Kitty terminal config"
"opencode|ls||opencode config"
"pi|ls||pi coding agent config and extensions"
"ssh|l||SSH client config (local file only, not tracked)"
"starship|ls|starship|Starship prompt config"
"systemd-user|l||Custom systemd user units"
"t3code|l||T3 Code keybindings"
"tmux|ls|tmux tpm|Tmux config"
"vim|ls|vim|Vim config"
"yazi|ls|yazi|Yazi config and plugins"
"zed|l|sys:zed|Zed settings and keymap"
"zsh|ls|zsh ohmyzsh starship|Zsh env and zshrc"
)

# Top-level directories that are never stow packages.
STOW_EXCLUDE=(setup node_modules)

# -----------------------------------------------------------------------------
# DIR_LINKS: directories that are linked as a whole instead of file by file.
#   package:path-under-HOME
#
# Each path must also be excluded from stow in the package's .stow-local-ignore.
# claude-hud opens config.json with O_NOFOLLOW, so the file itself must not be
# a symlink; a symlinked parent directory is fine.
# -----------------------------------------------------------------------------
DIR_LINKS=(
"claude:.claude/plugins/claude-hud"
)

# =============================================================================
# Installer functions (used by `fn` and `post` methods above).
# They rely on helpers from setup/lib.sh: run, clone, fetch, info, warn.
# =============================================================================

install_ohmyzsh() {
    # A plain clone: the official installer would overwrite ~/.zshrc, which is
    # a symlink into this repo.
    clone https://github.com/ohmyzsh/ohmyzsh "$HOME/.oh-my-zsh" || return 1
    local custom="$HOME/.oh-my-zsh/custom/plugins"
    clone https://github.com/zsh-users/zsh-autosuggestions "$custom/zsh-autosuggestions" || return 1
    clone https://github.com/zsh-users/zsh-syntax-highlighting "$custom/zsh-syntax-highlighting" || return 1
}

# tmux.conf loads ~/.tmux/plugins/tpm/tpm, so TPM must live there.
# TPM's install script reads TMUX_PLUGIN_MANAGER_PATH from a running tmux server
# that has loaded tmux.conf. A private server (own TMUX_TMPDIR) provides that
# without touching the user's own tmux sessions.
install_tpm() {
    local dir="$HOME/.tmux/plugins/tpm"
    local conf="$HOME/.config/tmux/tmux.conf"
    clone https://github.com/tmux-plugins/tpm "$dir" || return 1
    if ${DRY_RUN:-false}; then
        printf '  + (private tmux server) %s\n' "$dir/bin/install_plugins"
        return 0
    fi
    if ! have tmux || [[ ! -f $conf ]]; then
        warn "Skipping TPM plugins (tmux or $conf missing); press prefix + I inside tmux later"
        return 0
    fi
    local tmp rc=0
    tmp=$(mktemp -d)
    env -u TMUX TMUX_TMPDIR="$tmp" tmux -f "$conf" new-session -d -s tpm-setup \
        && env -u TMUX TMUX_TMPDIR="$tmp" "$dir/bin/install_plugins" || rc=$?
    env -u TMUX TMUX_TMPDIR="$tmp" tmux kill-server 2>/dev/null
    rm -rf "$tmp"
    (( rc == 0 )) || warn "TPM plugin install failed; press prefix + I inside tmux"
    return 0
}

# Plain clone: the official installer edits shell rc files.
install_nvm() {
    clone https://github.com/nvm-sh/nvm "$HOME/.nvm" || return 1
    info "nvm installed. Run 'nvm install --lts' in a new shell to get Node.js."
}

install_rustup() {
    pipe_to_sh https://sh.rustup.rs -y --no-modify-path
}
