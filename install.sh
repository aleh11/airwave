#!/usr/bin/env bash

set -Eeuo pipefail

service_name="airwave"
service_user="airwave"
install_path="/usr/local/bin/airwave"
environment_path="/etc/airwave.env"
service_path="/etc/systemd/system/airwave.service"
repository="aleh11/airwave"
release_asset="airwave-linux-arm64"
release_base_url="${AIRWAVE_RELEASE_BASE_URL:-https://github.com/${repository}/releases/latest/download}"
download_dir=""
status_log=""
step_index=0
step_total=7

if [[ -t 1 && "${TERM:-dumb}" != "dumb" ]]; then
  accent=$'\033[38;5;45m'
  success=$'\033[38;5;83m'
  danger=$'\033[38;5;203m'
  muted=$'\033[38;5;244m'
  bright=$'\033[1m'
  reset=$'\033[0m'
  clear_line=$'\r\033[2K'
else
  accent=""
  success=""
  danger=""
  muted=""
  bright=""
  reset=""
  clear_line=$'\r'
fi

cleanup() {
  if [[ -n "${status_log}" ]]; then
    rm -f -- "${status_log}"
  fi
  if [[ -n "${download_dir}" && -d "${download_dir}" ]]; then
    rm -f -- "${download_dir}/${release_asset}" "${download_dir}/${release_asset}.sha256"
    rmdir -- "${download_dir}"
  fi
}

trap cleanup EXIT

fail() {
  printf '%b\n  ✕  %s%b\n' "${danger}" "$1" "${reset}" >&2
  exit 1
}

render_banner() {
  printf '\n%b' "${accent}"
  printf '%s\n' \
    '      ╭────────────────────────────────────╮' \
    '      │                                    │' \
    '      │      ▄▀█ █ █▀█ █ █ █ ▄▀█ █ █ █▀▀  │' \
    '      │      █▀█ █ █▀▄  ▀▄▀▄▀ █▀█ ▀▄▀ ██▄  │' \
    '      │                                    │' \
    '      │          tune the world            │' \
    '      ╰────────────────────────────────────╯'
  printf '%b      Raspberry Pi radio, beautifully simple%b\n\n' "${bright}" "${reset}"
}

render_progress() {
  local width=28
  local filled=$((step_index * width / step_total))
  local empty=$((width - filled))
  local bar=""
  local index
  for ((index = 0; index < filled; index++)); do bar+="━"; done
  for ((index = 0; index < empty; index++)); do bar+="·"; done
  printf '     %b%s%b %3d%%\n\n' "${accent}" "${bar}" "${reset}" "$((step_index * 100 / step_total))"
}

complete_step() {
  step_index=$((step_index + 1))
  printf '  %b✓%b  %s\n' "${success}" "${reset}" "$1"
  render_progress
}

run_step() {
  local label="$1"
  shift
  local frames=('◐' '◓' '◑' '◒')
  local frame=0
  local status=0
  : > "${status_log}"

  if [[ -t 1 ]]; then
    "$@" >"${status_log}" 2>&1 &
    local command_pid=$!
    while kill -0 "${command_pid}" 2>/dev/null; do
      printf '%b  %b%s%b  %s' "${clear_line}" "${accent}" "${frames[frame]}" "${reset}" "${label}"
      frame=$(((frame + 1) % ${#frames[@]}))
      sleep 0.12
    done
    if wait "${command_pid}"; then status=0; else status=$?; fi
    printf '%b' "${clear_line}"
  else
    printf '  ... %s\n' "${label}"
    if "$@" >"${status_log}" 2>&1; then status=0; else status=$?; fi
  fi

  if [[ "${status}" -ne 0 ]]; then
    cat "${status_log}" >&2
    fail "${label} failed"
  fi
  complete_step "${label}"
}

download_release() {
  curl --fail --silent --show-error --location --retry 3 --proto '=https' --tlsv1.2 \
    "${release_base_url}/${release_asset}" \
    --output "${binary_path}"
  curl --fail --silent --show-error --location --retry 3 --proto '=https' --tlsv1.2 \
    "${release_base_url}/${release_asset}.sha256" \
    --output "${binary_path}.sha256"
}

verify_release() {
  if [[ "${downloaded_release}" == true ]]; then
    (
      cd -- "${download_dir}"
      sha256sum --check "${release_asset}.sha256"
    )
  else
    [[ -s "${binary_path}" ]]
  fi
}

install_packages() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends mpv gpiod ca-certificates
}

prepare_service_account() {
  getent group "${service_user}" >/dev/null 2>&1 || groupadd --system "${service_user}"
  getent group audio >/dev/null 2>&1 || groupadd --system audio
  getent group gpio >/dev/null 2>&1 || groupadd --system gpio

  if id "${service_user}" >/dev/null 2>&1; then
    usermod --gid "${service_user}" --append --groups audio,gpio "${service_user}"
  else
    useradd \
      --system \
      --gid "${service_user}" \
      --groups audio,gpio \
      --home-dir "/var/lib/${service_name}" \
      --shell /usr/sbin/nologin \
      "${service_user}"
  fi
}

install_service_files() {
  install -d -m 0750 -o "${service_user}" -g "${service_user}" "/var/lib/${service_name}"
  install -m 0755 -o root -g root "${binary_path}" "${install_path}"

  if [[ ! -f "${environment_path}" ]]; then
    install -m 0640 -o root -g "${service_user}" /dev/null "${environment_path}"
    {
      printf 'AIRWAVE_HOST=%s\n' "${AIRWAVE_HOST:-0.0.0.0}"
      printf 'AIRWAVE_PORT=%s\n' "${AIRWAVE_PORT:-8787}"
      printf 'AIRWAVE_DB_PATH=%s\n' "/var/lib/${service_name}/airwave.db"
      printf 'AIRWAVE_MPV_COMMAND=%s\n' "/usr/bin/mpv"
      printf 'AIRWAVE_MPV_SOCKET=%s\n' "/run/${service_name}/mpv.sock"
      printf 'AIRWAVE_GPIO_CHIP=%s\n' "${gpio_chip}"
      printf 'AIRWAVE_GPIO_BIAS=%s\n' "${AIRWAVE_GPIO_BIAS:-pull-up}"
      printf "AIRWAVE_GPIO_BUTTONS='%s'\n" "${AIRWAVE_GPIO_BUTTONS:-{\"17\":\"toggle\",\"27\":\"next\",\"22\":\"volumeUp\",\"23\":\"volumeDown\"}}"
    } > "${environment_path}"
  fi

  cat > "${service_path}" <<'UNIT'
[Unit]
Description=Airwave internet radio
Wants=network-online.target
After=network-online.target sound.target

[Service]
Type=simple
User=airwave
Group=airwave
SupplementaryGroups=audio gpio
EnvironmentFile=/etc/airwave.env
RuntimeDirectory=airwave
StateDirectory=airwave
ExecStart=/usr/local/bin/airwave
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true

[Install]
WantedBy=multi-user.target
UNIT
}

start_airwave() {
  systemctl daemon-reload
  systemctl enable "${service_name}" >/dev/null
  systemctl restart "${service_name}"

  local attempt
  for attempt in {1..20}; do
    if systemctl is-active --quiet "${service_name}"; then
      return 0
    fi
    sleep 0.25
  done
  journalctl -u "${service_name}" --no-pager -n 30 || true
  return 1
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  printf 'Usage: curl -fsSL https://github.com/%s/releases/latest/download/install.sh | sudo bash\n' "${repository}"
  printf '   or: sudo ./install.sh [path-to-airwave-linux-arm64]\n'
  exit 0
fi

render_banner

[[ "${EUID}" -eq 0 ]] || fail "Run this installer with sudo"
[[ "$(uname -s)" == "Linux" ]] || fail "This installer requires Linux"

case "$(uname -m)" in
  aarch64 | arm64) ;;
  *) fail "Airwave currently supports 64-bit Raspberry Pi OS on ARM64" ;;
esac

command -v apt-get >/dev/null 2>&1 || fail "apt-get is required"
command -v systemctl >/dev/null 2>&1 || fail "systemd is required"
status_log="$(mktemp)"
complete_step "Detected 64-bit Raspberry Pi OS"

script_dir="$(pwd)"
if [[ -f "${BASH_SOURCE[0]:-}" ]]; then
  script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
fi
binary_path="${1:-${AIRWAVE_BINARY:-}}"
downloaded_release=false

if [[ -z "${binary_path}" ]]; then
  for candidate in \
    "${script_dir}/airwave-linux-arm64" \
    "${script_dir}/airwave" \
    "${script_dir}/build/airwave-linux-arm64"; do
    if [[ -f "${candidate}" ]]; then
      binary_path="${candidate}"
      break
    fi
  done
fi

if [[ -z "${binary_path}" ]]; then
  command -v curl >/dev/null 2>&1 || fail "curl is required to download the latest release"
  command -v sha256sum >/dev/null 2>&1 || fail "sha256sum is required to verify the release"
  download_dir="$(mktemp -d)"
  binary_path="${download_dir}/${release_asset}"
  downloaded_release=true
  run_step "Downloaded the latest Airwave release" download_release
else
  complete_step "Found the Airwave binary"
fi

run_step "Verified release integrity" verify_release
run_step "Installed audio and GPIO packages" install_packages
run_step "Prepared the restricted service account" prepare_service_account

gpio_chip="${AIRWAVE_GPIO_CHIP:-}"
if [[ -z "${gpio_chip}" ]] && command -v gpiodetect >/dev/null 2>&1; then
  gpio_chip="$(gpiodetect 2>/dev/null | awk '/pinctrl-(bcm|rp1)/ { sub(":", "", $1); print $1; exit }')"
fi

run_step "Installed Airwave and its system service" install_service_files
run_step "Started Airwave" start_airwave

dashboard_host="$(hostname -I 2>/dev/null | awk '{ print $1 }')"
dashboard_host="${dashboard_host:-$(hostname).local}"
dashboard_port="$(awk -F= '$1 == "AIRWAVE_PORT" { gsub(/[^0-9]/, "", $2); print $2; exit }' "${environment_path}")"
dashboard_port="${dashboard_port:-8787}"

printf '%b' "${success}"
printf '%s\n' \
  '      ╭────────────────────────────────────╮' \
  '      │      Airwave is on the air ✓       │' \
  '      ╰────────────────────────────────────╯'
printf '%b\n' "${reset}"
printf '      Open:          %bhttp://%s:%s%b\n' "${bright}" "${dashboard_host}" "${dashboard_port}" "${reset}"
printf '      Configuration: %s\n' "${environment_path}"
printf '      Live logs:     sudo journalctl -u %s -f\n\n' "${service_name}"
