#!/usr/bin/env bash

set -Eeuo pipefail

service_name="radio-deck"
service_user="radio-deck"
install_path="/usr/local/bin/radio-deck"
environment_path="/etc/radio-deck.env"
service_path="/etc/systemd/system/radio-deck.service"

fail() {
  printf 'Radio Deck installer: %s\n' "$1" >&2
  exit 1
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  printf 'Usage: sudo ./install.sh [path-to-radio-linux-arm64]\n'
  exit 0
fi

[[ "${EUID}" -eq 0 ]] || fail "run this installer with sudo"
[[ "$(uname -s)" == "Linux" ]] || fail "this installer requires Linux"

case "$(uname -m)" in
  aarch64 | arm64) ;;
  *) fail "the supplied binary requires 64-bit Raspberry Pi OS on ARM64" ;;
esac

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
binary_path="${1:-${RADIO_BINARY:-}}"

if [[ -z "${binary_path}" ]]; then
  for candidate in \
    "${script_dir}/radio-linux-arm64" \
    "${script_dir}/radio-deck" \
    "${script_dir}/build/radio-linux-arm64"; do
    if [[ -f "${candidate}" ]]; then
      binary_path="${candidate}"
      break
    fi
  done
fi

[[ -n "${binary_path}" && -f "${binary_path}" ]] || fail "place radio-linux-arm64 beside install.sh or pass its path as the first argument"
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

gpio_chip="${RADIO_GPIO_CHIP:-}"
if [[ -z "${gpio_chip}" ]] && command -v gpiodetect >/dev/null 2>&1; then
  gpio_chip="$(gpiodetect 2>/dev/null | awk '/pinctrl-(bcm|rp1)/ { sub(":", "", $1); print $1; exit }')"
fi

if [[ ! -f "${environment_path}" ]]; then
  install -m 0640 -o root -g "${service_user}" /dev/null "${environment_path}"
  {
    printf 'RADIO_HOST=%s\n' "${RADIO_HOST:-0.0.0.0}"
    printf 'RADIO_PORT=%s\n' "${RADIO_PORT:-8787}"
    printf 'RADIO_DB_PATH=%s\n' "/var/lib/${service_name}/radio.db"
    printf 'RADIO_MPV_COMMAND=%s\n' "/usr/bin/mpv"
    printf 'RADIO_MPV_SOCKET=%s\n' "/run/${service_name}/mpv.sock"
    printf 'RADIO_GPIO_CHIP=%s\n' "${gpio_chip}"
    printf 'RADIO_GPIO_BIAS=%s\n' "${RADIO_GPIO_BIAS:-pull-up}"
    printf "RADIO_GPIO_BUTTONS='%s'\n" "${RADIO_GPIO_BUTTONS:-{\"17\":\"toggle\",\"27\":\"next\",\"22\":\"volumeUp\",\"23\":\"volumeDown\"}}"
  } > "${environment_path}"
else
  printf 'Keeping existing %s\n' "${environment_path}"
fi

cat > "${service_path}" <<'UNIT'
[Unit]
Description=Radio Deck internet radio
Wants=network-online.target
After=network-online.target sound.target

[Service]
Type=simple
User=radio-deck
Group=radio-deck
SupplementaryGroups=audio gpio
EnvironmentFile=/etc/radio-deck.env
RuntimeDirectory=radio-deck
StateDirectory=radio-deck
ExecStart=/usr/local/bin/radio-deck
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
dashboard_port="$(awk -F= '$1 == "RADIO_PORT" { gsub(/[^0-9]/, "", $2); print $2; exit }' "${environment_path}")"
dashboard_port="${dashboard_port:-8787}"

printf '\nRadio Deck is installed and running.\n'
printf 'Open http://%s:%s\n' "${dashboard_host}" "${dashboard_port}"
printf 'Configuration: %s\n' "${environment_path}"
printf 'Logs: journalctl -u %s -f\n' "${service_name}"
