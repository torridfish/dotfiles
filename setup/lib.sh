# shellcheck shell=bash
# Helpers for setup.sh: logging, command wrappers, bootstrap of pixi and gum,
# and the menus (gum when available, plain bash otherwise).

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; BLUE=$'\033[0;34m'; NC=$'\033[0m'

info()    { printf '%s[INFO]%s %s\n' "$BLUE" "$NC" "$*"; }
success() { printf '%s[ OK ]%s %s\n' "$GREEN" "$NC" "$*"; }
warn()    { printf '%s[WARN]%s %s\n' "$YELLOW" "$NC" "$*" >&2; }
error()   { printf '%s[FAIL]%s %s\n' "$RED" "$NC" "$*" >&2; }

have() { command -v "$1" >/dev/null 2>&1; }

# Run a command, or only print it when --dry-run is set.
run() {
    if ${DRY_RUN:-false}; then
        printf '  + %s\n' "$*"
        return 0
    fi
    "$@"
}

# Print a URL to stdout with curl or wget.
fetch() {
    if have curl; then curl -fsSL "$1"
    elif have wget; then wget -qO- "$1"
    else error "Neither curl nor wget is available"; return 1
    fi
}

# Download a script and pipe it to sh with the given arguments.
pipe_to_sh() {
    local url=$1; shift
    if ${DRY_RUN:-false}; then
        printf '  + fetch %s | sh -s -- %s\n' "$url" "$*"
        return 0
    fi
    fetch "$url" | sh -s -- "$@"
}

# Shallow-clone a repo unless the target already exists.
clone() {
    [[ -e $2 ]] && return 0
    run git clone --depth 1 "$1" "$2"
}

# True if a TOOLS check string passes. `~` at the start means $HOME.
tool_present() {
    local check=${1/#\~/$HOME}
    if [[ $check == /* ]]; then [[ -e $check ]]; else have "$check"; fi
}

# -----------------------------------------------------------------------------
# Bootstrap: pixi (user-space package manager) and gum (menus)
# -----------------------------------------------------------------------------
ensure_pixi() {
    have pixi && return 0
    info "Installing pixi into ~/.pixi (no sudo needed)"
    # PIXI_NO_PATH_UPDATE: the installer would otherwise edit ~/.zshrc, which
    # links into this repo. zshrc already has ~/.pixi/bin on PATH.
    if ${DRY_RUN:-false}; then
        printf '  + fetch https://pixi.sh/install.sh | PIXI_NO_PATH_UPDATE=1 sh\n'
        return 0
    fi
    fetch https://pixi.sh/install.sh | PIXI_NO_PATH_UPDATE=1 sh || return 1
    have pixi || { error "pixi installed but not found on PATH"; return 1; }
}

# Install the gum binary from the GitHub release into ~/.local/bin.
# gum is not on conda-forge, so pixi cannot provide it.
install_gum() {
    have curl || { warn "gum needs curl; using plain menus"; return 1; }
    local arch
    case $(uname -m) in
        x86_64)         arch=x86_64 ;;
        aarch64|arm64)  arch=arm64 ;;
        *) warn "No gum build for $(uname -m); using plain menus"; return 1 ;;
    esac
    local tag
    tag=$(curl -fsSIL -o /dev/null -w '%{url_effective}' \
        https://github.com/charmbracelet/gum/releases/latest 2>/dev/null)
    tag=${tag##*/}
    [[ $tag == v* ]] || { warn "Could not resolve the latest gum version"; return 1; }
    local ver=${tag#v}
    local tmp; tmp=$(mktemp -d)
    local url="https://github.com/charmbracelet/gum/releases/download/$tag/gum_${ver}_Linux_${arch}.tar.gz"
    if curl -fsSL --retry 3 -o "$tmp/gum.tar.gz" "$url" \
        && tar -xzf "$tmp/gum.tar.gz" -C "$tmp"; then
        local bin; bin=$(find "$tmp" -name gum -type f | head -n1)
        if [[ -n $bin ]]; then
            mkdir -p "$HOME/.local/bin"
            install -m 755 "$bin" "$HOME/.local/bin/gum"
            rm -rf "$tmp"
            success "gum $ver installed to ~/.local/bin"
            return 0
        fi
    fi
    rm -rf "$tmp"
    warn "gum download failed; using plain menus"
    return 1
}

# Decide whether menus use gum. Offers to install it once.
init_ui() {
    USE_GUM=false
    $NO_GUM && return 0
    [[ -t 0 && -t 1 ]] || return 0
    if ! have gum; then
        read -rp "Install gum (nicer menus) into ~/.local/bin? [Y/n] " ans || return 0
        [[ $ans =~ ^[Nn] ]] && return 0
        install_gum || return 0
    fi
    USE_GUM=true
}

# -----------------------------------------------------------------------------
# Menus. Entries are "id|label" strings. Results land in MENU_RESULT (array).
# -----------------------------------------------------------------------------

# menu_multi TITLE "preselected ids" ENTRY...
menu_multi() {
    local title=$1 pre=$2; shift 2
    MENU_RESULT=()
    [[ $# -eq 0 ]] && return 0
    if $USE_GUM; then _gum_multi "$title" "$pre" "$@"; else _plain_multi "$title" "$pre" "$@"; fi
}

_gum_multi() {
    local title=$1 pre=$2; shift 2
    local -a labels=() sel=()
    local -A id_of=()
    local e id label
    for e; do
        id=${e%%|*}; label=${e#*|}
        label=${label//,/}   # gum splits --selected on commas
        labels+=("$label"); id_of[$label]=$id
        [[ " $pre " == *" $id "* ]] && sel+=("$label")
    done
    local -a args=(--no-limit --height 25 --header "$title (x: toggle, ctrl+a: all, enter: confirm)"
        --cursor-prefix "[ ] " --selected-prefix "[x] " --unselected-prefix "[ ] ")
    if [[ ${#sel[@]} -gt 0 ]]; then
        local csv; csv=$(IFS=,; echo "${sel[*]}")
        args+=(--selected "$csv")
    fi
    local out
    out=$(gum choose "${args[@]}" "${labels[@]}") || { error "Cancelled"; exit 130; }
    local line
    while IFS= read -r line; do
        [[ -n $line ]] && MENU_RESULT+=("${id_of[$line]}")
    done <<<"$out"
}

_plain_multi() {
    local title=$1 pre=$2; shift 2
    local -a ids=() labels=() on=()
    local e i
    for e; do
        ids+=("${e%%|*}"); labels+=("${e#*|}")
        if [[ " $pre " == *" ${e%%|*} "* ]]; then on+=(1); else on+=(0); fi
    done
    local ans tok
    while true; do
        printf '\n%s\n' "$title"
        for i in "${!ids[@]}"; do
            printf '  %2d) [%s] %s\n' "$((i + 1))" "$([[ ${on[i]} == 1 ]] && echo x || echo ' ')" "${labels[i]}"
        done
        read -rp "Toggle numbers (e.g. 1 3 5), a=all, n=none, Enter=confirm: " ans || { error "Cancelled"; exit 130; }
        [[ -z $ans ]] && break
        for tok in $ans; do
            case $tok in
                a) for i in "${!on[@]}"; do on[i]=1; done ;;
                n) for i in "${!on[@]}"; do on[i]=0; done ;;
                *[!0-9]*) warn "Ignored: $tok" ;;
                *)
                    if (( tok >= 1 && tok <= ${#ids[@]} )); then
                        on[tok-1]=$(( 1 - on[tok-1] ))
                    else
                        warn "Out of range: $tok"
                    fi ;;
            esac
        done
    done
    for i in "${!ids[@]}"; do
        [[ ${on[i]} == 1 ]] && MENU_RESULT+=("${ids[i]}")
    done
    return 0
}

# menu_one TITLE DEFAULT_ID ENTRY...  -> MENU_ONE
menu_one() {
    local title=$1 def=$2; shift 2
    local e id
    if $USE_GUM; then
        local -a labels=(); local defl=""
        local -A id_of=()
        local label
        for e; do
            label=${e#*|}; label=${label//,/}
            labels+=("$label"); id_of[$label]=${e%%|*}
            [[ ${e%%|*} == "$def" ]] && defl=$label
        done
        local out
        out=$(gum choose --header "$title" ${defl:+--selected "$defl"} "${labels[@]}") \
            || { error "Cancelled"; exit 130; }
        MENU_ONE=${id_of[$out]}
    else
        local i=0 defn=1
        printf '\n%s\n' "$title"
        for e; do
            i=$((i + 1)); id=${e%%|*}
            [[ $id == "$def" ]] && defn=$i
            printf '  %d) %s\n' "$i" "${e#*|}"
        done
        local ans
        read -rp "Choose [$defn]: " ans || { error "Cancelled"; exit 130; }
        ans=${ans:-$defn}
        [[ $ans =~ ^[0-9]+$ ]] && (( ans >= 1 && ans <= $# )) || { error "Invalid choice: $ans"; exit 1; }
        local pick=("$@")
        MENU_ONE=${pick[ans-1]%%|*}
    fi
}

# confirm QUESTION -> returns 0 for yes (default yes)
confirm() {
    if $USE_GUM; then
        gum confirm "$1"
    else
        local ans
        read -rp "$1 [Y/n] " ans || return 1
        [[ ! $ans =~ ^[Nn] ]]
    fi
}
