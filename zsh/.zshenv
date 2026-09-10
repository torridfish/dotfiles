# Keep standard system utilities available even if the inherited PATH is empty
# or contains only a machine-local entry.
path=("$HOME/.local/bin" "$HOME/.cargo/bin" /usr/local/bin /usr/bin /bin $path)
typeset -U path PATH

. "$HOME/.cargo/env"

# Secrets files
[ -f "$HOME/secrets.zsh" ] && . "$HOME/secrets.zsh"
