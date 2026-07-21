#!/usr/bin/env bash

set -Eeuo pipefail

service_name="airwave"
service_user="airwave"
install_path="/usr/local/bin/airwave"
environment_path="/etc/airwave.env"
service_path="/etc/systemd/system/airwave.service"
update_service_path="/etc/systemd/system/airwave-update.service"
update_path_unit="/etc/systemd/system/airwave-update.path"
update_helper="/usr/local/libexec/airwave-update"
update_request_path="/var/lib/airwave/update.request"
update_status_path="/var/lib/airwave/update.status.json"
repository="aleh11/airwave"
release_asset="airwave-linux-arm64"
release_base_url="${AIRWAVE_RELEASE_BASE_URL:-https://github.com/${repository}/releases/latest/download}"
download_dir=""
status_log=""
step_index=0
step_total=7
progress_visible=false
status_visible=false

if [[ -t 1 && "${TERM:-dumb}" != "dumb" ]]; then
  accent=$'\033[38;5;45m'
  accent_alt=$'\033[38;5;69m'
  success=$'\033[38;5;83m'
  danger=$'\033[38;5;203m'
  muted=$'\033[38;5;244m'
  bright=$'\033[1m'
  reset=$'\033[0m'
  clear_line=$'\r\033[2K'
  interactive=true
else
  accent=""
  accent_alt=""
  success=""
  danger=""
  muted=""
  bright=""
  reset=""
  clear_line=$'\r'
  interactive=false
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
    '     █████╗ ██╗██████╗ ██╗    ██╗ █████╗ ██╗   ██╗███████╗' \
    '    ██╔══██╗██║██╔══██╗██║    ██║██╔══██╗██║   ██║██╔════╝' \
    '    ███████║██║██████╔╝██║ █╗ ██║███████║██║   ██║█████╗  '
  printf '%b' "${accent_alt}"
  printf '%s\n' \
    '    ██╔══██║██║██╔══██╗██║███╗██║██╔══██║╚██╗ ██╔╝██╔══╝  ' \
    '    ██║  ██║██║██║  ██║╚███╔███╔╝██║  ██║ ╚████╔╝ ███████╗' \
    '    ╚═╝  ╚═╝╚═╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚═╝  ╚═╝  ╚═══╝  ╚══════╝'
  printf '\n%b    ≋  T U N E   T H E   W O R L D%b' "${accent}" "${reset}"
  printf '%b     Raspberry Pi internet radio%b\n\n' "${muted}" "${reset}"
}

render_progress() {
  local width=42
  local filled=$((step_index * width / step_total))
  local empty=$((width - filled))
  local bar=""
  local index
  for ((index = 0; index < filled; index++)); do bar+="━"; done
  for ((index = 0; index < empty; index++)); do bar+="·"; done
  printf '     %b%s%b %3d%%\n' "${accent}" "${bar}" "${reset}" "$((step_index * 100 / step_total))"
}

complete_step() {
  step_index=$((step_index + 1))
  if [[ "${interactive}" == true && "${progress_visible}" == true ]]; then
    if [[ "${status_visible}" == true ]]; then
      printf '\033[2A'
    else
      printf '\033[1A'
    fi
    printf '%b' "${clear_line}"
  fi
  printf '  %b✓%b  %s\n' "${success}" "${reset}" "$1"
  if [[ "${interactive}" == true ]]; then
    printf '%b' "${clear_line}"
    render_progress
    progress_visible=true
  elif [[ "${step_index}" -eq "${step_total}" ]]; then
    render_progress
  fi
  status_visible=false
}

render_status() {
  local frame="$1"
  local label="$2"
  if [[ "${progress_visible}" == true ]]; then
    if [[ "${status_visible}" == true ]]; then
      printf '\033[2A'
    else
      printf '\033[1A'
    fi
  fi
  printf '%b  %b%s%b  %s\n' "${clear_line}" "${accent}" "${frame}" "${reset}" "${label}"
  printf '%b' "${clear_line}"
  render_progress
  progress_visible=true
  status_visible=true
}

clear_live_progress() {
  if [[ "${interactive}" != true || "${progress_visible}" != true ]]; then
    return
  fi
  if [[ "${status_visible}" == true ]]; then
    printf '\033[2A\033[J'
  else
    printf '\033[1A\033[J'
  fi
  progress_visible=false
  status_visible=false
}

run_step() {
  local label="$1"
  shift
  local frames=('◐' '◓' '◑' '◒')
  local frame=0
  local status=0
  : > "${status_log}"

  if [[ "${interactive}" == true ]]; then
    "$@" >"${status_log}" 2>&1 &
    local command_pid=$!
    while kill -0 "${command_pid}" 2>/dev/null; do
      render_status "${frames[frame]}" "${label}"
      frame=$(((frame + 1) % ${#frames[@]}))
      sleep 0.12
    done
    if wait "${command_pid}"; then status=0; else status=$?; fi
  else
    printf '  ... %s\n' "${label}"
    if "$@" >"${status_log}" 2>&1; then status=0; else status=$?; fi
  fi

  if [[ "${status}" -ne 0 ]]; then
    clear_live_progress
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
  apt-get install -y --no-install-recommends \
    mpv gpiod ca-certificates bluez bluez-alsa-utils rfkill
}

prepare_service_account() {
  getent group "${service_user}" >/dev/null 2>&1 || groupadd --system "${service_user}"
  getent group audio >/dev/null 2>&1 || groupadd --system audio
  getent group gpio >/dev/null 2>&1 || groupadd --system gpio
  getent group bluetooth >/dev/null 2>&1 || groupadd --system bluetooth

  if id "${service_user}" >/dev/null 2>&1; then
    usermod --gid "${service_user}" --append --groups audio,gpio,bluetooth "${service_user}"
  else
    useradd \
      --system \
      --gid "${service_user}" \
      --groups audio,gpio,bluetooth \
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
      printf 'AIRWAVE_BLUETOOTHCTL_COMMAND=%s\n' "/usr/bin/bluetoothctl"
      printf 'AIRWAVE_UPDATE_REQUEST_PATH=%s\n' "${update_request_path}"
      printf 'AIRWAVE_UPDATE_STATUS_PATH=%s\n' "${update_status_path}"
      printf 'AIRWAVE_GPIO_CHIP=%s\n' "${gpio_chip}"
      printf 'AIRWAVE_GPIO_BIAS=%s\n' "${AIRWAVE_GPIO_BIAS:-pull-up}"
      printf "AIRWAVE_GPIO_BUTTONS='%s'\n" "${AIRWAVE_GPIO_BUTTONS:-{\"17\":\"toggle\",\"27\":\"next\",\"22\":\"volumeUp\",\"23\":\"volumeDown\"}}"
    } > "${environment_path}"
  fi

  if ! grep -q '^AIRWAVE_UPDATE_REQUEST_PATH=' "${environment_path}"; then
    printf 'AIRWAVE_UPDATE_REQUEST_PATH=%s\n' "${update_request_path}" >> "${environment_path}"
  fi
  if ! grep -q '^AIRWAVE_UPDATE_STATUS_PATH=' "${environment_path}"; then
    printf 'AIRWAVE_UPDATE_STATUS_PATH=%s\n' "${update_status_path}" >> "${environment_path}"
  fi

  install -d -m 0755 -o root -g root /usr/local/libexec
  cat > "${update_helper}" <<'UPDATER'
#!/usr/bin/env bash

set -Eeuo pipefail

service_name="airwave"
service_user="airwave"
install_path="/usr/local/bin/airwave"
request_path="${AIRWAVE_UPDATE_REQUEST_PATH:-/var/lib/airwave/update.request}"
status_path="${AIRWAVE_UPDATE_STATUS_PATH:-/var/lib/airwave/update.status.json}"
release_asset="airwave-linux-arm64"
temp_dir=""
version="unknown"

write_status() {
  local state="$1"
  local message="$2"
  local temporary_status="${status_path}.tmp.$$"
  printf '{"state":"%s","version":"%s","message":"%s"}\n' \
    "${state}" "${version}" "${message}" > "${temporary_status}"
  chmod 0644 "${temporary_status}"
  chown "${service_user}:${service_user}" "${temporary_status}"
  mv -f -- "${temporary_status}" "${status_path}"
}

cleanup_update() {
  if [[ -n "${temp_dir}" && -d "${temp_dir}" ]]; then
    rm -f -- \
      "${temp_dir}/${release_asset}" \
      "${temp_dir}/${release_asset}.sha256"
    rmdir -- "${temp_dir}"
  fi
}

fail_update() {
  local exit_code=$?
  trap - ERR
  set +e
  write_status "failed" "The update could not be installed."
  rm -f -- "${request_path}"
  cleanup_update
  exit "${exit_code}"
}

trap fail_update ERR

version="$(tr -d '[:space:]' < "${request_path}")"
[[ "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$ ]]
release_base_url="${AIRWAVE_RELEASE_BASE_URL:-https://github.com/aleh11/airwave/releases/download/v${version}}"
temp_dir="$(mktemp -d)"

write_status "downloading" "Downloading Airwave v${version}."
curl --fail --silent --show-error --location --retry 3 --proto '=https' --tlsv1.2 \
  "${release_base_url}/${release_asset}" \
  --output "${temp_dir}/${release_asset}"
curl --fail --silent --show-error --location --retry 3 --proto '=https' --tlsv1.2 \
  "${release_base_url}/${release_asset}.sha256" \
  --output "${temp_dir}/${release_asset}.sha256"

(
  cd -- "${temp_dir}"
  sha256sum --check "${release_asset}.sha256"
)

write_status "installing" "Installing Airwave v${version}."
install -m 0755 -o root -g root \
  "${temp_dir}/${release_asset}" "${install_path}.next"
mv -f -- "${install_path}.next" "${install_path}"
write_status "restarting" "Restarting Airwave v${version}."
rm -f -- "${request_path}"
cleanup_update
systemctl restart "${service_name}"
trap - ERR
UPDATER
  chmod 0755 "${update_helper}"

  cat > "${update_service_path}" <<'UNIT'
[Unit]
Description=Install an Airwave release update
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
EnvironmentFile=-/etc/airwave.env
ExecStart=/usr/local/libexec/airwave-update
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/usr/local/bin /var/lib/airwave
UNIT

  cat > "${update_path_unit}" <<'UNIT'
[Unit]
Description=Watch for Airwave update requests

[Path]
PathExists=/var/lib/airwave/update.request
Unit=airwave-update.service

[Install]
WantedBy=multi-user.target
UNIT

  cat > "${service_path}" <<'UNIT'
[Unit]
Description=Airwave internet radio
Wants=network-online.target bluetooth.service bluealsa.service
After=network-online.target sound.target bluetooth.service bluealsa.service

[Service]
Type=simple
User=airwave
Group=airwave
SupplementaryGroups=audio gpio bluetooth
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
  systemctl enable --now bluetooth.service bluealsa.service >/dev/null
  rfkill unblock bluetooth
  systemctl restart bluetooth.service bluealsa.service
  systemctl enable --now airwave-update.path >/dev/null
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
run_step "Installed audio, Bluetooth, and GPIO packages" install_packages
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
