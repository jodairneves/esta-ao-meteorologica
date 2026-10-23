#!/usr/bin/env sh
# Runs the firmware unit tests on the host (pio test -e native).
# Uses the local PlatformIO when a C++ compiler is installed; otherwise runs them in a
# container that has g++ (Docker), keeping the PlatformIO packages in ~/.cache/wx-pio-native.
set -eu
cd "$(dirname "$0")/.."

if command -v g++ >/dev/null 2>&1 && command -v pio >/dev/null 2>&1; then
  exec pio test -e native "$@"
fi

image=wx-firmware-native-test
cache="${XDG_CACHE_HOME:-$HOME/.cache}/wx-pio-native"
mkdir -p "$cache"
docker build --quiet --tag "$image" --file scripts/native-test.Dockerfile scripts >/dev/null
exec docker run --rm \
  --user "$(id -u):$(id -g)" \
  --env HOME=/tmp \
  --env PLATFORMIO_CORE_DIR=/pio \
  --volume "$cache":/pio \
  --volume "$PWD":/firmware \
  "$image" pio test -e native "$@"
