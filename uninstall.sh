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
data_path="/var/lib/airwave"
purge=false

fail() {
  printf 'Airwave uninstaller: %s\n' "$1" >&2
  exit 1
}

case "${1:-}" in
  "") ;;
  --purge) purge=true ;;
  --help | -h)
    printf 'Usage: sudo ./uninstall.sh [--purge]\n'
    printf 'Without --purge, configuration and listening data are preserved.\n'
    exit 0
    ;;
  *) fail "unknown option: ${1}" ;;
esac

[[ "${EUID}" -eq 0 ]] || fail "run this uninstaller with sudo"
[[ "$(uname -s)" == "Linux" ]] || fail "this uninstaller requires Linux"
command -v systemctl >/dev/null 2>&1 || fail "systemd is required"

systemctl disable --now "${service_name}" >/dev/null 2>&1 || true
systemctl disable --now airwave-update.path >/dev/null 2>&1 || true
rm -f -- \
  "${service_path}" \
  "${update_service_path}" \
  "${update_path_unit}" \
  "${update_helper}" \
  "${install_path}"
systemctl daemon-reload
systemctl reset-failed "${service_name}" >/dev/null 2>&1 || true

if [[ "${purge}" == true ]]; then
  rm -f -- "${environment_path}"
  if [[ -d "${data_path}" ]]; then
    find "${data_path}" -depth -mindepth 1 -delete
    rmdir -- "${data_path}"
  fi
  if id "${service_user}" >/dev/null 2>&1; then
    userdel "${service_user}"
  fi
  if getent group "${service_user}" >/dev/null 2>&1; then
    groupdel "${service_user}"
  fi
  printf 'Airwave, its configuration, and listening data were removed.\n'
else
  printf 'Airwave was removed.\n'
  printf 'Configuration preserved at %s\n' "${environment_path}"
  printf 'Listening data preserved at %s\n' "${data_path}"
  printf 'Run again with --purge to remove the preserved files and service account.\n'
fi
