# Dotfiles

Dotfiles managed by [GNU Stow](https://www.gnu.org/software/stow/) and versioned with git. Configs follow the [XDG Base Directory](https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html) convention where the program allows it.

Each top-level directory is a stow package that mirrors the target path under `$HOME`. For example, `git/.config/git/config` links to `~/.config/git/config`.

Linux only. The same repo serves two kinds of machine:

| Profile | Machine | Default selection |
|---|---|---|
| `local` | Workstation with a desktop | All tools and all packages, including desktop apps |
| `server` | HPC or remote host, usually without sudo | CLI tools and CLI configs only |

## Quick start

```bash
git clone git@github.com:torridfish/dotfiles.git ~/Code/dotfiles
cd ~/Code/dotfiles
./setup.sh
```

The script is interactive. It asks for a profile, then shows two checklists: tools to install and stow packages to link. Items that fit the profile start selected, and tools that are already installed start unselected. After a summary you confirm once, and then it runs.

If [gum](https://github.com/charmbracelet/gum) is missing, the script offers to download it to `~/.local/bin` for nicer menus. Press `x` to toggle an item in gum. Without gum, the menus are plain bash: type item numbers to toggle them.

Nothing in `setup.sh` needs sudo:

- Tools install with [pixi](https://pixi.sh) (`pixi global install`, into `~/.pixi/bin`). The script installs pixi itself if it is missing.
- Oh My Zsh, its two plugins, TPM and nvm are plain `git clone` into `$HOME`. rustup uses its official installer with `--no-modify-path`.
- Stow links files into `$HOME`. If stow is missing, it is installed with pixi.
- Programs that need a system package manager (kitty, fcitx5, deskflow, zed, cava, syncthing) are not installed. The script prints which ones are missing for the packages you selected.

Before it links a file, the script moves any conflicting real file to `~/.dotfiles-backup/<timestamp>/`.

## Non-interactive use

```bash
./setup.sh -y --profile server              # profile defaults, no prompts
./setup.sh -y --tools none --stow git,zsh   # link two packages only
./setup.sh --tools tmux,tpm --stow tmux     # install and link, no menus
./setup.sh --unstow --stow zsh              # remove the links of one package
./setup.sh --dry-run                        # print every command, change nothing
./setup.sh --list                           # show tools and packages
```

`--tools` and `--stow` accept a comma-separated list, `all` or `none`. A category that you do not give uses the profile default. Any of these flags turns the menus off. Run `./setup.sh --help` for all flags.

To use one package without the script:

```bash
stow -t ~ --restow --no-folding git
stow -t ~ -D --no-folding git
```

`--no-folding` keeps directories that programs write into (Deskflow TLS certificates, new autostart entries) as real directories. Only the tracked files become links.

## Where the lists live

`setup/manifest.sh` is the only place that lists tools and packages. It holds:

- `TOOLS`: what to install, how to detect it, which profile selects it.
- `STOW_META`: a description and default profiles for each stow package, and what the package expects (a tool, or a program that needs root).
- `DIR_LINKS`: directories that are linked as a whole instead of file by file. Today this is `~/.claude/plugins/claude-hud`: claude-hud opens `config.json` with `O_NOFOLLOW`, so the file must not be a symlink. The package's `.stow-local-ignore` keeps the directory out of stow, and `setup.sh` links it. claude-hud writes `transcript-cursors/` into it, and `.gitignore` covers that.

A new top-level directory with tracked files appears in the stow menu without any edit, off by default. Add a line to `STOW_META` to give it a description and defaults. The list of packages in this README is not kept by hand; use `./setup.sh --list`.

## Packages

Notes for packages that need more than their description in `setup/manifest.sh`:

| Package | Note |
|---|---|
| `agents` | Skills in `~/.agents/skills/`, read by pi and opencode. All skills are also linked into `~/.claude/skills`, and slide-maker into `~/.codex/skills`. design-grind and before-after-review are adapted from [sago-cream/skills](https://github.com/sago-cream/skills) and stay siblings so that design-grind's `../before-after-review/SKILL.md` reference resolves. |
| `agent` | `AGENTS.md` shared by every coding agent. `claude/.claude/CLAUDE.md` and `gemini/.gemini/GEMINI.md` point to it. |
| `claude` | Global settings, status line and plugin config. `settings.local.json` and `~/.claude.json` stay machine-local. |
| `pi` | Global `AGENTS.md`, `settings.json`, `models.json` (API key from `$VLLM_API_KEY`), `mcp.json`, prompt templates and extensions. Packages install through pi (`pi update --extensions`). `auth.json` and `secrets/` stay machine-local. |
| `gemini` | Only `~/.gemini/GEMINI.md`. Auth and settings in `~/.gemini/` stay machine-local. |
| `deskflow` | Layout and server config. `tls/` stays machine-local. |
| `systemd-user` | Run `systemctl --user daemon-reload` after a change. |
| `t3code` | `Ctrl+D` and `Ctrl+B` stay with the shell inside terminals. T3 Code writes through the symlink, so changes made in the app show up here. The rest of `~/.t3/` stays machine-local. |
| `ssh` | Not tracked (real hosts and IPs). Listed only when a local `ssh/.ssh/config` exists. Keep it at mode 600. |
| `zsh` | Expects Oh My Zsh with `zsh-autosuggestions` and `zsh-syntax-highlighting`, and Starship. Contains some machine-specific PATH entries (TeX Live, Go) that do nothing where the path is missing. |
| `tmux` | Expects TPM at `~/.tmux/plugins/tpm`. Select the `tpm` tool to install it and the plugins. |

## Server notes

- `git/.config/git/config` rewrites pushes to `https://github.com/...` into `git@github.com:...` (`pushInsteadOf`). A new machine needs a GitHub SSH key before it can push. Clone and fetch of public repos stay on https and need no key.
- The same file still sets `/usr/bin/gh` as the https credential helper. With `gh` from pixi, the binary is `~/.pixi/bin/gh`, so fetch of a private repo over https cannot find the helper. Use an SSH URL for private repos on servers.
- Your login shell on an HPC host is usually bash and cannot be changed without root. Add `exec zsh` to `~/.bashrc` (guarded by `[[ $- == *i* ]]`) to start zsh from bash.
- pixi caches packages in `~/.cache/rattler`. On a host with a small home quota, set `PIXI_CACHE_DIR` to a larger disk before you run the script.

## Troubleshooting

**`links into this repo and holds absolute symlinks`**: a directory in `$HOME` (for example `~/.codex`) is a symlink into this repo, and an app has written runtime files into the repo through it. Stow refuses a package that contains absolute symlinks. The message prints the fix: replace the link with a real directory that keeps the data, then restore the tracked files.

```bash
rm ~/.codex && mv ~/dotfiles/agents/.codex ~/.codex && git -C ~/dotfiles checkout -- agents/.codex
```

Stop the app first if it is running and you want to avoid it holding old paths. Do not run `pkill` on a shared host, because it also matches other users' processes.

## Sensitive and machine-specific files

These are not tracked (see `.gitignore`):

- `gh/.config/gh/hosts.yml` (login tokens). Only `config.yml` is linked.
- `ssh/.ssh/config` (real hosts and IPs).
- `zsh/secrets.zsh`. Create it locally and source it from `.zshrc` if needed.
- `*.local` files for per-machine overrides.
- Runtime caches (`.zcompdump*`, `*.zwc`, TPM plugins, btop themes).

Directories that hold runtime data (`gh`, `tmux/plugins`, `btop/themes`, fcitx5 caches) are never linked as a whole. Only the config files are linked, so runtime files and secrets stay out of the repo.

Not tracked on purpose: the GNOME settings database (dump and load it with `dconf`).

## Operating system support

Developed on Ubuntu and run with the `local` profile on a SER8 mini PC without problems. The server profile has not been run on a real HPC host yet. `setup.sh` rejects other operating systems. The `Brewfile` remains from an earlier macOS setup and `setup.sh` no longer reads it.
