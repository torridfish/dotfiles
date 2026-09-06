#!/usr/bin/env bash

# =============================================================================
# Torridfish Dotfiles Setup Script (GNU Stow edition)
#
# Repo layout: one top-level directory per "stow package". Each package
# mirrors the target path structure (e.g. git/.config/git/...), so
#
#     stow -d <repo> -t $HOME <package>
#
# symlinks the configs into place. Programs with runtime artifacts in the
# same directory (gh hosts.yml, tmux plugins, btop themes/logs, ...) only
# get their config files symlinked, keeping junk out of the repo.
# =============================================================================

set -e  # Exit on error

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

NON_INTERACTIVE=false
UNSTOW=false
for arg in "$@"; do
    case $arg in
        -y|--yes) NON_INTERACTIVE=true ;;
        --unstow) UNSTOW=true ;;
    esac
done

print_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

# =============================================================================
# Detect Operating System
# =============================================================================
detect_os() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        OS=$ID
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
    else
        OS="unknown"
    fi
    print_info "Detected OS: $OS"
}

# =============================================================================
# Install package using appropriate package manager
# =============================================================================
install_package() {
    local package_name="$1"

    case $OS in
        ubuntu|debian|pop)
            sudo apt update
            sudo apt install -y "$package_name"
            ;;
        fedora)
            sudo dnf install -y "$package_name"
            ;;
        centos|rhel)
            sudo yum install -y "$package_name"
            ;;
        arch|manjaro)
            sudo pacman -S --noconfirm "$package_name"
            ;;
        alpine)
            sudo apk add --no-cache "$package_name"
            ;;
        macos)
            brew install "$package_name"
            ;;
        *)
            print_error "Unsupported OS: $OS"
            return 1
            ;;
    esac
}

# =============================================================================
# Ensure GNU Stow is available
# =============================================================================
ensure_stow() {
    if command -v stow &> /dev/null; then
        print_info "GNU Stow $(stow --version | grep -o '[0-9.]*$') found"
        return 0
    fi

    if $NON_INTERACTIVE; then
        print_info "Stow not found, trying to install..."
        install_package stow
    else
        read -rp "GNU Stow is not installed. Install it now? [Y/n] " answer
        if [[ ! $answer =~ ^[Nn] ]]; then
            install_package stow
        else
            print_error "GNU Stow is required. Install it manually, e.g.: sudo apt install stow"
            exit 1
        fi
    fi
}

# =============================================================================
# All stow packages = every top-level directory (except .git)
# Packages may contain XDG configs (.config/...) or home-level dotfiles
# (e.g. zsh/.zshrc, bash/.profile) — stow -t ~ handles both.
# =============================================================================
get_packages() {
    local pkgs=()
    for dir in "$SCRIPT_DIR"/*/; do
        local name="$(basename "$dir")"
        [[ "$name" == ".git" ]] && continue
        pkgs+=("$name")
    done
    echo "${pkgs[@]}"
}

# =============================================================================
# Back up any real files that would collide with stow symlinks
# (skips symlinks already pointing into this repo)
# =============================================================================
backup_conflicts() {
    local pkg="$1"
    local backup_root="$HOME/.dotfiles-backup/$(date +%Y%m%d-%H%M%S)"
    local backed_up=0
    local rel target

    while IFS= read -r rel; do
        target="$HOME/$rel"
        if [[ -e "$target" || -L "$target" ]]; then
            # Resolve the full path: the final component may be a real file
            # reached THROUGH a stowed directory symlink (e.g. yazi plugins/),
            # so checking -L on the last component alone is not enough.
            if [[ "$(readlink -f "$target")" == "$SCRIPT_DIR"/* ]]; then
                continue  # already managed by us
            fi
            mkdir -p "$backup_root/$(dirname "$rel")"
            mv "$target" "$backup_root/$rel"
            print_warning "Backed up ~/$rel -> $backup_root/$rel"
            backed_up=1
        fi
    done < <(cd "$SCRIPT_DIR/$pkg" && find . \( -type f -o -type l \) | sed 's|^\./||')

    return 0
}

# =============================================================================
# Bootstrap TPM (tmux plugin manager) on fresh machines
# =============================================================================
bootstrap_tpm() {
    local tpm_dir="$HOME/.config/tmux/plugins/tpm"
    if [[ ! -e "$tpm_dir" ]] && command -v git &> /dev/null; then
        print_info "Bootstrapping TPM..."
        git clone --depth 1 https://github.com/tmux-plugins/tpm "$tpm_dir"
        "$tpm_dir/bin/install_plugins.sh" || true
    fi
}

# =============================================================================
# Main
# =============================================================================
main() {
    detect_os
    ensure_stow

    local packages
    read -ra packages <<< "$(get_packages)"
    if [[ ${#packages[@]} -eq 0 ]]; then
        print_error "No stow packages found in $SCRIPT_DIR"
        exit 1
    fi
    print_info "Packages: ${packages[*]}"

    local flag=(--restow --no-folding)
    local action="Stowing"
    if $UNSTOW; then
        flag=(-D --no-folding)
        action="Unstowing"
    fi

    # --no-folding: never fold package dirs into a single symlink, so app-
    # generated runtime files (Deskflow tls/, new autostart entries, ...)
    # stay as real files in $HOME instead of landing inside the repo.
    for pkg in "${packages[@]}"; do
        if $UNSTOW; then
            print_info "$action $pkg..."
            stow -d "$SCRIPT_DIR" -t "$HOME" "${flag[@]}" "$pkg"
        else
            backup_conflicts "$pkg"
            print_info "$action $pkg..."
            stow -d "$SCRIPT_DIR" -t "$HOME" "${flag[@]}" "$pkg"
        fi
        print_success "$pkg done"
    done

    if ! $UNSTOW; then
        # shellcheck disable=SC2076
        if [[ " ${packages[*]} " =~ " tmux " ]]; then
            bootstrap_tpm
        fi
        print_success "All packages stowed. Relaunch your shell / apps to pick up changes."
    else
        print_success "All packages unstowed."
    fi
}

main
