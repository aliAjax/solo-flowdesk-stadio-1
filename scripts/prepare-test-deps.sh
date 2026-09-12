#!/usr/bin/env bash
# 识别并补齐 Playwright 浏览器所需的系统运行库。
#
#   scripts/prepare-test-deps.sh          完整准备：检查浏览器 → 补齐运行库 → 复验
#   scripts/prepare-test-deps.sh --check  仅检查：缺失时给出明确提示并以退出码 1 结束
#
# 有 root / sudo 时优先用 playwright install-deps 安装到系统；
# 无 root 时从 Debian 源下载对应 .deb，解压到项目内 .browser-libs/（已 gitignore），
# playwright.config.ts 检测到该目录后会自动加入 LD_LIBRARY_PATH。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MODE="prepare"
[ "${1:-}" = "--check" ] && MODE="check"

info() { printf '  %s\n' "$*"; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*"; }
err()  { printf '\033[31m✗ %s\033[0m\n' "$*"; }

case "$(uname -m)" in
  x86_64)  TRIPLET="x86_64-linux-gnu" ;;
  aarch64) TRIPLET="aarch64-linux-gnu" ;;
  *)       TRIPLET="" ;;
esac

PW_CACHE="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"

browser_bins() {
  ls -d "$PW_CACHE"/chromium_headless_shell-*/chrome-linux/headless_shell \
        "$PW_CACHE"/chromium-*/chrome-linux/chrome 2>/dev/null | sort -u || true
}

local_lib_path() {
  if [ -d "$ROOT/.browser-libs" ] && [ -n "$TRIPLET" ]; then
    printf '%s:%s' "$ROOT/.browser-libs/usr/lib/$TRIPLET" "$ROOT/.browser-libs/lib/$TRIPLET"
  fi
}

# 输出所有浏览器二进制缺失的 .so（去重），已计入 .browser-libs 的补充
missing_libs() {
  local bins bin extra lp
  bins="$(browser_bins)"
  [ -z "$bins" ] && return 0
  lp="$(local_lib_path)"
  extra="${lp}${lp:+${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}}${extra:-}"
  for bin in $bins; do
    LD_LIBRARY_PATH="$extra" ldd "$bin" 2>/dev/null | awk '/not found/{print $1}' || true
  done | sort -u
}

# 缺失的 .so → Debian 包名（含常见传递依赖）
deb_for() {
  case "$1" in
    libnspr4.so)            echo libnspr4 ;;
    libnss3.so|libnssutil3.so|libsmime3.so) echo libnss3 ;;
    libatk-1.0.so.0)        echo libatk1.0-0 ;;
    libatk-bridge-2.0.so.0) echo libatk-bridge2.0-0 ;;
    libatspi.so.0)          echo libatspi2.0-0 ;;
    libdbus-1.so.3)         echo libdbus-1-3 ;;
    libxkbcommon.so.0)      echo libxkbcommon0 ;;
    libasound.so.2)         echo libasound2 ;;
    libgbm.so.1)            echo libgbm1 ;;
    libXcomposite.so.1)     echo libxcomposite1 ;;
    libXdamage.so.1)        echo libxdamage1 ;;
    libXfixes.so.3)         echo libxfixes3 ;;
    libXrandr.so.2)         echo libxrandr2 ;;
    libXi.so.6)             echo libxi6 ;;
    libXext.so.6)           echo libxext6 ;;
    libX11.so.6)            echo libx11-6 ;;
    libxcb.so.1)            echo libxcb1 ;;
    libdrm.so.2)            echo libdrm2 ;;
    libwayland-server.so.0) echo libwayland-server0 ;;
    libcups.so.2)           echo libcups2 ;;
    libavahi-client.so.3)   echo libavahi-client3 ;;
    libavahi-common.so.3)   echo libavahi-common3 ;;
    libexpat.so.1)          echo libexpat1 ;;
    *)                      echo "" ;;
  esac
}

MISSING="$(missing_libs)"

if [ -z "$(browser_bins)" ]; then
  warn "未找到 Playwright 浏览器（$PW_CACHE）"
  if [ "$MODE" = "check" ]; then
    err "请先执行：npm run test:prepare"
    exit 1
  fi
  info "下载 Chromium ..."
  npx playwright install chromium
  MISSING="$(missing_libs)"
fi

if [ -z "$MISSING" ]; then
  ok "浏览器运行库完整，可以执行 npm test"
  exit 0
fi

if [ "$MODE" = "check" ]; then
  err "浏览器缺少以下系统运行库："
  echo "$MISSING" | sed 's/^/    /'
  echo ""
  info "补齐方式（任选其一）："
  info "  1) npm run test:prepare        —— 自动识别并补齐（无需 root 亦可）"
  info "  2) sudo npx playwright install-deps chromium —— 安装到系统"
  exit 1
fi

warn "缺少运行库：$(echo "$MISSING" | tr '\n' ' ')"

# 方式一：有 root / sudo，直接装到系统
if [ "$(id -u)" = "0" ]; then
  info "检测到 root，使用 playwright install-deps 安装到系统 ..."
  npx playwright install-deps chromium
elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
  info "检测到 sudo，使用 playwright install-deps 安装到系统 ..."
  sudo npx playwright install-deps chromium
else
  # 方式二：无 root，下载 .deb 解压到项目内 .browser-libs/
  info "无 root 权限，改为下载运行库到项目内 .browser-libs/ ..."
  command -v apt-get >/dev/null 2>&1 || { err "当前系统无 apt-get，请手动安装上述运行库后重试"; exit 1; }
  [ -n "$TRIPLET" ] || { err "未支持的架构 $(uname -m)，请手动安装上述运行库后重试"; exit 1; }

  CODENAME="$(. /etc/os-release 2>/dev/null && echo "${VERSION_CODENAME:-bookworm}")"
  APT_DIR="$(mktemp -d)"
  trap 'rm -rf "$APT_DIR"' EXIT
  mkdir -p "$APT_DIR/lists/partial" "$APT_DIR/cache/archives/partial"
  echo "deb http://deb.debian.org/debian $CODENAME main" > "$APT_DIR/sources.list"
  APT=(-o "Dir::Etc::sourcelist=$APT_DIR/sources.list" -o "Dir::Etc::sourceparts=-" \
       -o "Dir::State::lists=$APT_DIR/lists" -o "Dir::Cache=$APT_DIR/cache" \
       -o "Dir::Cache::archives=$APT_DIR/cache/archives" -o "Debug::NoLocking=1")

  PKGS=""
  UNKNOWN=""
  for so in $MISSING; do
    deb="$(deb_for "$so")"
    if [ -n "$deb" ]; then PKGS="$PKGS $deb"; else UNKNOWN="$UNKNOWN $so"; fi
  done
  # 常见传递依赖一并补齐
  PKGS="$(echo "$PKGS libdrm2 libwayland-server0 libxi6 libavahi-client3 libavahi-common3" | tr ' ' '\n' | sort -u | tr '\n' ' ')"
  [ -n "$UNKNOWN" ] && warn "以下运行库未内置包名映射，将尝试继续：$UNKNOWN"

  info "更新软件源索引（$CODENAME）..."
  # 非 root 时 apt 会尝试清理系统缓存目录并打印无害警告，过滤该噪音但保留命令退出码
  apt_get() { apt-get "${APT[@]}" "$@" 2> >(grep -vF "cannot remove '/var/cache/apt" >&2); }
  apt_get update -qq
  info "下载：$PKGS"
  ( cd "$APT_DIR" && apt_get download $PKGS >/dev/null )
  mkdir -p "$ROOT/.browser-libs"
  for deb in "$APT_DIR"/*.deb; do dpkg -x "$deb" "$ROOT/.browser-libs"; done
  ok "已解压到 .browser-libs/"
fi

# 复验
MISSING="$(missing_libs)"
if [ -n "$MISSING" ]; then
  err "以下运行库仍缺失："
  echo "$MISSING" | sed 's/^/    /'
  err "请使用系统包管理器安装后重试（如 sudo npx playwright install-deps chromium）"
  exit 1
fi
ok "运行库已补齐，可以执行 npm test"
