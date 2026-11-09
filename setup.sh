#!/usr/bin/env bash
# =============================================================================
# Interactive dotfiles installer (Linux only).
#
#   1. pick a profile: local (workstation) or server (HPC, no sudo)
#   2. pick which tools to install (pixi, plus a few git clones)
#   3. pick which stow packages to link into $HOME
#
# Nothing here needs sudo. Programs that only a system package manager can
# provide (kitty, fcitx5, ...) are reported at the end instead of installed.
# Run ./setup.sh --help for the non-interactive flags.
# =============================================================================

set -uo pipefail

if (( BASH_VERSINFO[0] < 4 )); then
    echo "bash 4 or newer is required" >&2
    exit 1
fi
if [[ $(uname -s) != Linux ]]; then
    echo "setup.sh supports Linux only" >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=setup/lib.sh
source "$SCRIPT_DIR/setup/lib.sh"
# shellcheck source=setup/manifest.sh
source "$SCRIPT_DIR/setup/manifest.sh"

export PATH="$HOME/.local/bin:$HOME/.pixi/bin:$PATH"

# -----------------------------------------------------------------------------
# Options
# -----------------------------------------------------------------------------
YES=false
DRY_RUN=false
NO_GUM=false
UNSTOW=false
LIST=false
PROFILE=""
TOOLS_ARG=""     # empty = not given; "none" = nothing
STOW_ARG=""
USE_GUM=false

usage() {
    cat <<'EOF'
Usage: ./setup.sh [options]

With no options the script is interactive.

  --profile local|server   Default selection. Auto-detected when omitted
                           (server if no DISPLAY or WAYLAND_DISPLAY).
  --tools a,b,c|all|none   Tools to install (see --list).
  --stow a,b,c|all|none    Stow packages to link (see --list).
  -y, --yes                No prompts. Uses the profile defaults for anything
                           not given by --tools or --stow.
  --unstow                 Remove the links of the selected stow packages.
  --dry-run                Print every command, change nothing.
  --list                   Show tools and stow packages with their defaults.
  --no-gum                 Use plain bash menus.
  -h, --help               Show this help.

Examples:
  ./setup.sh                                  # interactive
  ./setup.sh -y --profile server              # HPC login node, all defaults
  ./setup.sh -y --tools none --stow git,zsh   # only link two packages
EOF
}

while (( $# )); do
    case $1 in
        --profile)  PROFILE=${2:-}; shift ;;
        --tools)    TOOLS_ARG=${2:-}; shift ;;
        --stow)     STOW_ARG=${2:-}; shift ;;
        -y|--yes)   YES=true ;;
        --unstow)   UNSTOW=true ;;
        --dry-run)  DRY_RUN=true ;;
        --list)     LIST=true ;;
        --no-gum)   NO_GUM=true ;;
        -h|--help)  usage; exit 0 ;;
        *) error "Unknown option: $1"; usage >&2; exit 1 ;;
    esac
    shift
done

# -----------------------------------------------------------------------------
# Load the manifest into lookup tables
# -----------------------------------------------------------------------------
declare -a T_IDS=() S_IDS=()
declare -A T_CHECK T_METHOD T_SPEC T_PROF T_DESC
declare -A S_PROF S_NEEDS S_DESC

load_manifest() {
    local line id check method spec prof desc needs pkg dir
    for line in "${TOOLS[@]}"; do
        IFS='|' read -r id check method spec prof desc <<<"$line"
        T_IDS+=("$id")
        T_CHECK[$id]=$check; T_METHOD[$id]=$method; T_SPEC[$id]=$spec
        T_PROF[$id]=$prof; T_DESC[$id]=$desc
    done
    for line in "${STOW_META[@]}"; do
        IFS='|' read -r pkg prof needs desc <<<"$line"
        S_PROF[$pkg]=$prof; S_NEEDS[$pkg]=$needs; S_DESC[$pkg]=$desc
    done
    # Discover packages from the directories, so a new one is never skipped.
    for dir in "$SCRIPT_DIR"/*/; do
        pkg=$(basename "$dir")
        [[ " ${STOW_EXCLUDE[*]} " == *" $pkg "* ]] && continue
        [[ -n $(find "$dir" \( -type f -o -type l \) -print -quit) ]] || continue
        S_IDS+=("$pkg")
        : "${S_PROF[$pkg]:=-}"
        : "${S_NEEDS[$pkg]:=}"
        : "${S_DESC[$pkg]:=(no description in setup/manifest.sh)}"
    done
}

detect_profile() {
    if [[ -n ${DISPLAY:-}${WAYLAND_DISPLAY:-} ]]; then echo local; else echo server; fi
}

# profile_letter local|server -> l|s
profile_letter() { [[ $1 == local ]] && echo l || echo s; }

# defaults_for_profile KIND(tools|stow) LETTER -> space-separated ids
default_tools() {
    local id out=()
    for id in "${T_IDS[@]}"; do
        [[ ${T_PROF[$id]} == *"$1"* ]] || continue
        tool_present "${T_CHECK[$id]}" && continue   # already installed
        out+=("$id")
    done
    echo "${out[*]:-}"
}
default_stow() {
    local id out=()
    for id in "${S_IDS[@]}"; do
        [[ ${S_PROF[$id]} == *"$1"* ]] && out+=("$id")
    done
    echo "${out[*]:-}"
}

# split_list "a,b" "ids..." -> space-separated ids; validates against known ids
split_list() {
    local arg=$1 kind=$2; shift 2
    case $arg in
        none) echo ""; return 0 ;;
        all)  echo "$*"; return 0 ;;
    esac
    local item out=()
    IFS=, read -ra items <<<"$arg"
    for item in "${items[@]}"; do
        [[ " $* " == *" $item "* ]] || { error "Unknown $kind: $item (see --list)"; return 1; }
        out+=("$item")
    done
    echo "${out[*]:-}"
}

list_all() {
    local id mark
    printf 'Tools (l = local default, s = server default)\n'
    for id in "${T_IDS[@]}"; do
        mark=$(tool_present "${T_CHECK[$id]}" && echo "installed" || echo "-")
        printf '  %-10s %-3s %-9s %s\n' "$id" "${T_PROF[$id]}" "$mark" "${T_DESC[$id]}"
    done
    printf '\nStow packages\n'
    for id in "${S_IDS[@]}"; do
        printf '  %-13s %-3s %s\n' "$id" "${S_PROF[$id]}" "${S_DESC[$id]}"
    done
}

# -----------------------------------------------------------------------------
# Tool installation
# -----------------------------------------------------------------------------
FAILED=()

install_tool() {
    local id=$1 method=${T_METHOD[$1]} spec=${T_SPEC[$1]}
    info "Installing $id"
    local rc=0
    case $method in
        pixi)
            # shellcheck disable=SC2086
            run pixi global install $spec || rc=$? ;;
        fn|post) "$spec" || rc=$? ;;
        *) error "Bad method '$method' for $id"; rc=1 ;;
    esac
    if (( rc != 0 )); then
        error "Failed: $id"
        FAILED+=("$id")
    fi
}

# -----------------------------------------------------------------------------
# Stow
# -----------------------------------------------------------------------------
BACKUP_ROOT="$HOME/.dotfiles-backup/$(date +%Y%m%d-%H%M%S)"

# Move real files that would collide with a stow link into the backup dir.
backup_conflicts() {
    local pkg=$1 rel target
    while IFS= read -r rel; do
        is_dir_link_path "$pkg" "$rel" && continue   # handled by link_dirs
        target="$HOME/$rel"
        [[ -e $target || -L $target ]] || continue
        # Resolve fully: the last component may be a real file reached through
        # a stowed directory symlink.
        [[ "$(readlink -f "$target")" == "$SCRIPT_DIR"/* ]] && continue
        warn "Backing up ~/$rel -> $BACKUP_ROOT/$rel"
        if ! $DRY_RUN; then
            mkdir -p "$BACKUP_ROOT/$(dirname "$rel")"
            mv "$target" "$BACKUP_ROOT/$rel"
        fi
    done < <(cd "$SCRIPT_DIR/$pkg" && find . \( -type f -o -type l \) | sed 's|^\./||')
}

# True if REL (a path inside PKG) is, or is under, a DIR_LINKS entry of PKG.
is_dir_link_path() {
    local pkg=$1 rel=$2 entry dir
    for entry in "${DIR_LINKS[@]}"; do
        [[ ${entry%%:*} == "$pkg" ]] || continue
        dir=${entry#*:}
        [[ $rel == "$dir" || $rel == "$dir"/* ]] && return 0
    done
    return 1
}

# Link (or unlink) the DIR_LINKS directories of one package.
link_dirs() {
    local pkg=$1 entry rel src target
    for entry in "${DIR_LINKS[@]}"; do
        [[ ${entry%%:*} == "$pkg" ]] || continue
        rel=${entry#*:}
        src="$SCRIPT_DIR/$pkg/$rel"
        target="$HOME/$rel"
        if $UNSTOW; then
            [[ -L $target && "$(readlink -f "$target")" == "$src" ]] && run rm "$target"
            continue
        fi
        [[ -L $target && "$(readlink -f "$target")" == "$src" ]] && continue   # already linked
        if [[ -e $target || -L $target ]]; then
            warn "Backing up ~/$rel -> $BACKUP_ROOT/$rel"
            if ! $DRY_RUN; then
                mkdir -p "$BACKUP_ROOT/$(dirname "$rel")"
                mv "$target" "$BACKUP_ROOT/$rel"
            fi
        fi
        run mkdir -p "$(dirname "$target")"
        run ln -s "$src" "$target"
    done
}

# A directory in $HOME that links into this repo ("folded") lets an app write
# runtime files into the repo. If one of those files is an absolute symlink,
# stow refuses the whole package ("source is an absolute symlink"). Detect that
# before stowing and print the fix. A folded link without absolute symlinks is
# fine: stow unfolds it by itself.
check_folded() {
    local pkg=$1 rel target found bad=0
    while IFS= read -r rel; do
        is_dir_link_path "$pkg" "$rel" && continue
        target="$HOME/$rel"
        [[ -L $target ]] || continue
        [[ "$(readlink -f "$target")" == "$SCRIPT_DIR"/* ]] || continue
        found=$(find "$SCRIPT_DIR/$pkg/$rel" -type l -lname '/*' 2>/dev/null | head -n 3)
        [[ -n $found ]] || continue
        error "~/$rel links into this repo and holds absolute symlinks (runtime data that an app wrote through the link):"
        printf '      %s\n' $found >&2
        printf '    Make it a real directory first, then run setup.sh again:\n' >&2
        printf '      rm ~/%s && mv %s/%s/%s ~/%s && git -C %s checkout -- %s/%s\n' \
            "$rel" "$SCRIPT_DIR" "$pkg" "$rel" "$rel" "$SCRIPT_DIR" "$pkg" "$rel" >&2
        bad=1
    done < <(cd "$SCRIPT_DIR/$pkg" && find . -mindepth 1 -type d | sed 's|^\./||')
    return "$bad"
}

# --no-folding keeps directories that apps write into (Deskflow tls/, new
# autostart entries, ...) as real directories; only tracked files become links.
stow_pkg() {
    local pkg=$1
    if $UNSTOW; then
        run stow -d "$SCRIPT_DIR" -t "$HOME" -D --no-folding "$pkg" || return 1
        link_dirs "$pkg"
        return 0
    fi
    check_folded "$pkg" || return 1
    backup_conflicts "$pkg"
    run stow -d "$SCRIPT_DIR" -t "$HOME" --restow --no-folding "$pkg" || return 1
    link_dirs "$pkg"
}

# -----------------------------------------------------------------------------
# Summary notes
# -----------------------------------------------------------------------------
# note_needs "tools..." "stow..." : warn about missing dependencies and
# programs that need the system package manager.
note_needs() {
    local -a tools=($1) stow=($2)
    local pkg need sys=() warns=()
    for pkg in "${stow[@]}"; do
        for need in ${S_NEEDS[$pkg]}; do
            if [[ $need == sys:* ]]; then
                have "${need#sys:}" || sys+=("${need#sys:}")
            elif [[ -n ${T_CHECK[$need]:-} ]] && ! tool_present "${T_CHECK[$need]}" \
                    && [[ " ${tools[*]} " != *" $need "* ]]; then
                warns+=("stow '$pkg' expects '$need', which is not installed or selected")
            fi
        done
    done
    local w
    for w in "${warns[@]+"${warns[@]}"}"; do warn "$w"; done
    if (( ${#sys[@]} )); then
        local uniq; uniq=$(printf '%s\n' "${sys[@]}" | sort -u | tr '\n' ' ')
        warn "Not installed and needs the system package manager (root): $uniq"
    fi
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
main() {
    load_manifest
    if $LIST; then list_all; exit 0; fi

    if [[ -z $PROFILE ]]; then PROFILE=$(detect_profile); fi
    [[ $PROFILE == local || $PROFILE == server ]] || { error "--profile must be local or server"; exit 1; }

    local interactive=true
    if $YES || [[ -n $TOOLS_ARG || -n $STOW_ARG ]]; then interactive=false; fi
    if $interactive; then init_ui; fi
    if $interactive && ! [[ -t 0 ]]; then
        warn "stdin is not a terminal; menus read from stdin"
    fi

    if $interactive; then
        menu_one "Profile" "$PROFILE" \
            "local|local   workstation with a desktop" \
            "server|server  HPC or remote host without sudo"
        PROFILE=$MENU_ONE
    fi
    local letter; letter=$(profile_letter "$PROFILE")
    info "Profile: $PROFILE (tools install into ~/.pixi and ~/.local, no sudo)"

    # ---- choose tools ----
    local -a tools=() stow=()
    local tmp
    if $UNSTOW; then
        :
    elif [[ -n $TOOLS_ARG ]]; then
        tmp=$(split_list "$TOOLS_ARG" tool "${T_IDS[@]}") || exit 1
        read -ra tools <<<"$tmp"
    elif $interactive; then
        local -a entries=() ; local id
        for id in "${T_IDS[@]}"; do
            local tag=""; tool_present "${T_CHECK[$id]}" && tag=" (installed)"
            entries+=("$id|$(printf '%-9s %s%s' "$id" "${T_DESC[$id]}" "$tag")")
        done
        menu_multi "Tools to install" "$(default_tools "$letter")" "${entries[@]}"
        tools=("${MENU_RESULT[@]+"${MENU_RESULT[@]}"}")
    else
        read -ra tools <<<"$(default_tools "$letter")"
    fi

    # ---- choose stow packages ----
    if [[ -n $STOW_ARG ]]; then
        tmp=$(split_list "$STOW_ARG" "stow package" "${S_IDS[@]}") || exit 1
        read -ra stow <<<"$tmp"
    elif $interactive; then
        local -a entries=() ; local id
        for id in "${S_IDS[@]}"; do
            entries+=("$id|$(printf '%-13s %s' "$id" "${S_DESC[$id]}")")
        done
        menu_multi "Stow packages to $($UNSTOW && echo unlink || echo link) into \$HOME" \
            "$(default_stow "$letter")" "${entries[@]}"
        stow=("${MENU_RESULT[@]+"${MENU_RESULT[@]}"}")
    else
        read -ra stow <<<"$(default_stow "$letter")"
    fi

    # Stow is needed to link anything.
    if (( ${#stow[@]} )) && ! have stow && [[ " ${tools[*]-} " != *" stow "* ]] && ! $UNSTOW; then
        info "stow is required to link configs; adding it to the install list"
        tools=(stow "${tools[@]+"${tools[@]}"}")
    fi

    # ---- summary ----
    printf '\n'
    info "Install: ${tools[*]:-(nothing)}"
    info "$($UNSTOW && echo Unlink || echo Link):    ${stow[*]:-(nothing)}"
    $DRY_RUN && info "Dry run: no changes will be made"
    note_needs "${tools[*]-}" "${stow[*]-}"
    if (( ${#tools[@]} + ${#stow[@]} == 0 )); then info "Nothing to do"; exit 0; fi
    if $interactive; then confirm "Proceed?" || { info "Aborted"; exit 0; }; fi

    # ---- run ----
    local id
    local -a pixi_tools=() fn_tools=() post_tools=()
    for id in "${tools[@]+"${tools[@]}"}"; do
        case ${T_METHOD[$id]} in
            pixi) pixi_tools+=("$id") ;;
            fn)   fn_tools+=("$id") ;;
            post) post_tools+=("$id") ;;
        esac
    done

    if (( ${#pixi_tools[@]} )); then
        if ! ensure_pixi; then
            error "pixi is unavailable; skipping: ${pixi_tools[*]}"
            FAILED+=("${pixi_tools[@]}")
            pixi_tools=()
        fi
    fi
    # pixi first: git must exist before the git-clone installers run.
    for id in "${pixi_tools[@]+"${pixi_tools[@]}"}" "${fn_tools[@]+"${fn_tools[@]}"}"; do
        install_tool "$id"
    done

    if (( ${#stow[@]} )); then
        if ! have stow && ! $DRY_RUN; then
            error "stow is not available; cannot link packages"
            FAILED+=("stow")
        else
            local pkg
            for pkg in "${stow[@]}"; do
                info "$($UNSTOW && echo Unlinking || echo Linking) $pkg"
                stow_pkg "$pkg" || { error "stow failed for $pkg"; FAILED+=("stow:$pkg"); }
            done
        fi
    fi

    for id in "${post_tools[@]+"${post_tools[@]}"}"; do
        install_tool "$id"
    done

    printf '\n'
    if (( ${#FAILED[@]} )); then
        error "Finished with failures: ${FAILED[*]}"
        exit 1
    fi
    success "Done. Open a new shell to pick up the changes."
    if [[ " ${stow[*]-} " == *" zsh "* && ${SHELL##*/} != zsh ]]; then
        info "Your login shell is ${SHELL##*/}. Use 'chsh -s \$(command -v zsh)' (needs root) or add 'exec zsh' to ~/.bashrc on hosts where you cannot change it."
    fi
}

main
