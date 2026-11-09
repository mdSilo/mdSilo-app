#!/bin/sh
# Install or update mdSilo on Linux or macOS from the GitHub release.
#
#   curl -fsSL https://raw.githubusercontent.com/mdSilo/mdSilo-app/main/scripts/install.sh | sh
#   sh install.sh [--version 0.8.0] [--format deb|rpm|appimage] [--force] [--uninstall]
#
# Linux: the package is chosen by the distro: .deb on Debian/Ubuntu and their kin,
# .rpm on Fedora/RHEL/openSUSE, otherwise the AppImage in ~/.local/bin (no root needed).
# macOS: the universal app goes to /Applications (or ~/Applications if not writable).
# Running it again updates the app when a newer release is out.
# Windows: see install.ps1 next to this script.

set -eu

REPO="mdSilo/mdSilo-app"
APP="mdsilo"
API="https://api.github.com/repos/$REPO/releases"

APPIMAGE_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/$APP"
BIN_DIR="$HOME/.local/bin"
DESKTOP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICON_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/icons"

version=""
format=""
force=0
uninstall=0

say() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }
has() { command -v "$1" >/dev/null 2>&1; }

usage() {
  cat <<EOF
Install or update mdSilo on Linux or macOS from the GitHub release.

Usage: install.sh [options]
  -v, --version X   install release X (default: the latest)
  -f, --format F    Linux only: deb, rpm or appimage (default: by distro)
      --force       reinstall even if up to date
      --uninstall   remove the app (notes are kept)
  -h, --help        show this help
EOF
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    -v|--version) [ $# -ge 2 ] || die "$1 needs a value"; version="${2#v}"; shift 2 ;;
    -f|--format)  [ $# -ge 2 ] || die "$1 needs a value"; format="$2"; shift 2 ;;
    --force)      force=1; shift ;;
    --uninstall)  uninstall=1; shift ;;
    -h|--help)    usage ;;
    *) die "unknown option: $1 (see --help)" ;;
  esac
done

OS=$(uname -s)
case "$OS" in
  Linux)
    case "$format" in
      ""|deb|rpm|appimage) ;;
      AppImage) format=appimage ;;
      *) die "unknown format: $format (deb, rpm or appimage)" ;;
    esac
    ;;
  Darwin)
    case "$format" in ""|app) format=app ;; *) die "--format is for Linux; macOS uses the .app" ;; esac
    ;;
  *) die "this script is for Linux and macOS; on Windows use install.ps1, or get the app at https://github.com/$REPO/releases" ;;
esac

# root runs commands directly, others through sudo (or doas)
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if has sudo; then SUDO="sudo"; elif has doas; then SUDO="doas"; fi
fi
as_root() {
  if [ "$(id -u)" -ne 0 ] && [ -z "$SUDO" ]; then die "root is needed: run as root or install sudo"; fi
  $SUDO "$@"
}

fetch() { # fetch URL [OUTPUT]; prints to stdout without OUTPUT
  if has curl; then
    if [ $# -ge 2 ]; then curl -fL --progress-bar -o "$2" "$1"; else curl -fsSL "$1"; fi
  elif has wget; then
    if [ $# -ge 2 ]; then wget -q --show-progress -O "$2" "$1"; else wget -qO- "$1"; fi
  else
    die "curl or wget is needed"
  fi
}

# --- where it is installed ---------------------------------------------------

detect_format() { # Linux: deb, rpm or appimage
  ids=""
  if [ -r /etc/os-release ]; then
    ids=$(. /etc/os-release; printf '%s %s' "${ID:-}" "${ID_LIKE:-}")
  fi
  for id in $ids; do
    case "$id" in
      debian|ubuntu|linuxmint|pop|elementary|zorin|kali|raspbian|deepin|uos) has dpkg && { echo deb; return; } ;;
      fedora|rhel|centos|rocky|almalinux|ol|amzn|opensuse*|suse|sles|mageia|openmandriva) has rpm && { echo rpm; return; } ;;
    esac
  done
  # unknown distro: go by the package tool, else AppImage
  if has apt-get && has dpkg; then echo deb
  elif has dnf || has yum || has zypper; then echo rpm
  else echo appimage
  fi
}

mac_app() { # macOS: prints the installed .app path, empty if none
  for dir in /Applications "$HOME/Applications"; do
    [ -d "$dir/$APP.app" ] && { echo "$dir/$APP.app"; return; }
  done
  return 0
}

installed_version() { # prints the installed version, empty if none
  case "$1" in
    deb) dpkg-query -W -f='${Status} ${Version}' "$APP" 2>/dev/null | sed -n 's/^install ok installed //p' ;;
    rpm) rpm -q --qf '%{VERSION}' "$APP" 2>/dev/null | grep -v 'not installed' || true ;;
    appimage) cat "$APPIMAGE_DIR/version" 2>/dev/null || true ;;
    app)
      a=$(mac_app)
      [ -n "$a" ] && /usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$a/Contents/Info.plist" 2>/dev/null || true
      ;;
  esac
}

# --- uninstall -------------------------------------------------------------

uninstall_appimage() {
  rm -f "$BIN_DIR/$APP" "$DESKTOP_DIR/$APP.desktop"
  find "$ICON_DIR/hicolor" -name "$APP.png" -delete 2>/dev/null || true
  rm -rf "$APPIMAGE_DIR"
  has update-desktop-database && update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
}

if [ "$uninstall" -eq 1 ]; then
  removed=0
  if [ "$OS" = Darwin ]; then
    a=$(mac_app)
    if [ -n "$a" ]; then
      if [ -w "$(dirname "$a")" ]; then rm -rf "$a"; else as_root rm -rf "$a"; fi
      removed=1
    fi
  else
    # with --format only that install is removed, otherwise every one found
    if [ "${format:-appimage}" = appimage ]; then
      if [ -n "$(installed_version appimage)" ] || [ -e "$BIN_DIR/$APP" ]; then
        uninstall_appimage; removed=1; say "Removed the AppImage install."
      fi
    fi
    if [ "${format:-deb}" = deb ] && has dpkg && [ -n "$(installed_version deb)" ]; then
      as_root dpkg -r "$APP"; removed=1
    elif [ "${format:-rpm}" = rpm ] && has rpm && [ -n "$(installed_version rpm)" ]; then
      if has dnf; then as_root dnf remove -y "$APP"
      elif has zypper; then as_root zypper --non-interactive remove "$APP"
      elif has yum; then as_root yum remove -y "$APP"
      else as_root rpm -e "$APP"; fi
      removed=1
    fi
  fi
  [ "$removed" -eq 1 ] && say "mdSilo is uninstalled. Your notes and workspace folders are kept." || say "mdSilo is not installed."
  exit 0
fi

# --- pick release and asset ------------------------------------------------

if [ "$OS" = Linux ]; then
  case "$(uname -m)" in
    x86_64|amd64) deb_arch=amd64; rpm_arch=x86_64; img_arch=amd64 ;;
    aarch64|arm64) deb_arch=arm64; rpm_arch=aarch64; img_arch=aarch64 ;;
    *) die "no Linux build for $(uname -m) yet; build from source: https://github.com/$REPO#get-the-app" ;;
  esac
  [ -n "$format" ] || format=$(detect_format)
fi

if [ -n "$version" ]; then
  release=$(fetch "$API/tags/$APP-v$version") || die "release $version is not found"
else
  release=$(fetch "$API/latest") || die "cannot get the latest release from GitHub (offline or rate limited?)"
fi

tag=$(printf '%s\n' "$release" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n 1)
[ -n "$tag" ] || die "cannot read the release from GitHub"
latest="${tag#"$APP"-v}"

case "$format" in
  deb) pattern="_${deb_arch}\\.deb\$" ;;
  rpm) pattern="\\.${rpm_arch}\\.rpm\$" ;;
  appimage) pattern="_${img_arch}\\.AppImage\$" ;;
  app) pattern='_universal\.app\.tar\.gz$' ;;
esac
url=$(printf '%s\n' "$release" | sed -n 's/.*"browser_download_url": *"\([^"]*\)".*/\1/p' | grep -E "$pattern" | head -n 1)
[ -n "$url" ] || die "release $latest has no $format package for $(uname -m)"

current=$(installed_version "$format")
if [ -n "$current" ] && [ "$current" = "$latest" ] && [ "$force" -eq 0 ]; then
  say "mdSilo $current is installed and up to date."
  exit 0
fi
if [ -n "$current" ]; then
  say "Updating mdSilo $current -> $latest ($format)"
else
  say "Installing mdSilo $latest ($format)"
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM
file="$tmp/$(basename "$url")"
fetch "$url" "$file" || die "download failed: $url"

# --- install ---------------------------------------------------------------

case "$format" in
  deb)
    if has apt-get; then
      as_root apt-get install -y "$file"
    else
      as_root dpkg -i "$file"
    fi
    ;;
  rpm)
    if has dnf; then as_root dnf install -y "$file"
    elif has zypper; then as_root zypper --non-interactive install --allow-unsigned-rpm "$file"
    elif has yum; then as_root yum install -y "$file"
    else as_root rpm -U --replacepkgs "$file"; fi
    ;;
  appimage)
    mkdir -p "$APPIMAGE_DIR" "$BIN_DIR" "$DESKTOP_DIR"
    chmod +x "$file"
    # icons from the AppImage (extraction works without FUSE)
    if (cd "$tmp" && "$file" --appimage-extract 'usr/share/icons/*' >/dev/null 2>&1); then
      [ -d "$tmp/squashfs-root/usr/share/icons/hicolor" ] && mkdir -p "$ICON_DIR" && cp -R "$tmp/squashfs-root/usr/share/icons/hicolor" "$ICON_DIR/"
    fi
    mv -f "$file" "$APPIMAGE_DIR/$APP.AppImage"
    ln -sf "$APPIMAGE_DIR/$APP.AppImage" "$BIN_DIR/$APP"
    printf '%s\n' "$latest" > "$APPIMAGE_DIR/version"
    cat > "$DESKTOP_DIR/$APP.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=mdSilo
Comment=Notes, reading and feeds in one app
Exec=$APPIMAGE_DIR/$APP.AppImage %U
Icon=$APP
Terminal=false
Categories=Office;Utility;
EOF
    has update-desktop-database && update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
    case ":$PATH:" in *":$BIN_DIR:"*) ;; *) say "Note: add $BIN_DIR to PATH to run '$APP' from a terminal." ;; esac
    if ! { ldconfig -p 2>/dev/null || /sbin/ldconfig -p 2>/dev/null; } | grep -q 'libfuse\.so\.2'; then
      say "Note: AppImage needs FUSE 2 (package libfuse2 / fuse2 / fuse-libs) to start."
    fi
    ;;
  app)
    mkdir -p "$tmp/x"
    tar -xzf "$file" -C "$tmp/x"
    [ -d "$tmp/x/$APP.app" ] || die "the download has no $APP.app"
    # update in place; a new install goes to /Applications, or ~/Applications if that is not writable
    dest=$(mac_app)
    if [ -z "$dest" ]; then
      if [ -w /Applications ]; then dest="/Applications/$APP.app"; else dest="$HOME/Applications/$APP.app"; mkdir -p "$HOME/Applications"; fi
    fi
    if [ -w "$(dirname "$dest")" ] && { [ ! -e "$dest" ] || [ -w "$dest" ]; }; then run=""; else run="as_root"; fi
    $run rm -rf "$dest"
    $run mv "$tmp/x/$APP.app" "$dest"
    xattr -dr com.apple.quarantine "$dest" 2>/dev/null || true
    pgrep -x "$APP" >/dev/null 2>&1 && say "Note: mdSilo is running; quit and reopen it to use $latest."
    say "Installed to $dest"
    ;;
esac

say "mdSilo $latest is installed. Run this script again to update."
