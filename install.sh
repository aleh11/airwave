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

cleanup() {
  if [[ -n "${download_dir}" && -d "${download_dir}" ]]; then
    rm -f -- "${download_dir}/${release_asset}" "${download_dir}/${release_asset}.sha256"
    rmdir -- "${download_dir}"
  fi
}

trap cleanup EXIT

fail() {
  printf 'Airwave installer: %s\n' "$1" >&2
  exit 1
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  printf 'Usage: curl -fsSL https://github.com/%s/releases/latest/download/install.sh | sudo bash\n' "${repository}"
  printf '   or: sudo ./install.sh [path-to-airwave-linux-arm64]\n'
  exit 0
fi

[[ "${EUID}" -eq 0 ]] || fail "run this installer with sudo"
[[ "$(uname -s)" == "Linux" ]] || fail "this installer requires Linux"

case "$(uname -m)" in
  aarch64 | arm64) ;;
  *) fail "the supplied binary requires 64-bit Raspberry Pi OS on ARM64" ;;
esac

script_dir="$(pwd)"
if [[ -f "${BASH_SOURCE[0]:-}" ]]; then
  script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
fi
binary_path="${1:-${AIRWAVE_BINARY:-}}"

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
  printf 'Downloading the latest Airwave release…\n'
  curl --fail --silent --show-error --location --retry 3 --proto '=https' --tlsv1.2 \
    "${release_base_url}/${release_asset}" \
    --output "${binary_path}"
  curl --fail --silent --show-error --location --retry 3 --proto '=https' --tlsv1.2 \
    "${release_base_url}/${release_asset}.sha256" \
    --output "${binary_path}.sha256"
  (
    cd -- "${download_dir}"
    sha256sum --check "${release_asset}.sha256"
  )
fi

[[ -n "${binary_path}" && -s "${binary_path}" ]] || fail "the Airwave binary is missing or empty"
command -v apt-get >/dev/null 2>&1 || fail "apt-get is required"
command -v systemctl >/dev/null 2>&1 || fail "systemd is required"

printf 'Installing system packages…\n'
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends mpv gpiod ca-certificates

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

install -d -m 0750 -o "${service_user}" -g "${service_user}" "/var/lib/${service_name}"
install -m 0755 -o root -g root "${binary_path}" "${install_path}"

gpio_chip="${AIRWAVE_GPIO_CHIP:-}"
if [[ -z "${gpio_chip}" ]] && command -v gpiodetect >/dev/null 2>&1; then
  gpio_chip="$(gpiodetect 2>/dev/null | awk '/pinctrl-(bcm|rp1)/ { sub(":", "", $1); print $1; exit }')"
fi

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
else
  printf 'Keeping existing %s\n' "${environment_path}"
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

systemctl daemon-reload
systemctl enable "${service_name}" >/dev/null
systemctl restart "${service_name}"

for _ in {1..20}; do
  if systemctl is-active --quiet "${service_name}"; then
    break
  fi
  sleep 0.25
done

if ! systemctl is-active --quiet "${service_name}"; then
  journalctl -u "${service_name}" --no-pager -n 30 >&2 || true
  fail "the service did not start"
fi

dashboard_host="$(hostname -I 2>/dev/null | awk '{ print $1 }')"
dashboard_host="${dashboard_host:-$(hostname).local}"
dashboard_port="$(awk -F= '$1 == "AIRWAVE_PORT" { gsub(/[^0-9]/, "", $2); print $2; exit }' "${environment_path}")"
dashboard_port="${dashboard_port:-8787}"

printf '\nAirwave is installed and running.\n'
printf 'Open http://%s:%s\n' "${dashboard_host}" "${dashboard_port}"
printf 'Configuration: %s\n' "${environment_path}"
printf 'Logs: journalctl -u %s -f\n' "${service_name}"
