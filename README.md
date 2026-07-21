# Airwave

Airwave is a self-hosted internet radio dashboard for a browser or Raspberry Pi.
One Deno process owns the radio state, SQLite library, discovery API, metadata
stream, timers, WebSocket clients, optional `mpv` output, and optional GPIO
controls. The React interface is embedded into the compiled executable, so the
Pi receives one binary and no JavaScript runtime.

## What is included

- Browser and Raspberry Pi appliance playback targets
- Single-player browser coordination with remote-control tabs
- Persistent stations, favorites, listening history, settings, and starter
  presets
- Radio Browser directory search
- ICY now-playing metadata
- Listening statistics
- Sleep timer and one-time radio alarm
- `mpv` output over a Unix socket
- Bluetooth speaker and headphone discovery, pairing, and A2DP output selection
- GPIO buttons through one `gpiomon` process with 50 ms software debounce
- Native Astryx interface with Stone, Neutral, and Y2K themes plus light and
  dark modes
- Local and Raspberry Pi single-binary compile tasks

## Architecture

Every input dispatches a command to one state machine. Browser broadcast, `mpv`,
metadata, history, persistence, and scheduling react to state changes. No
WebSocket message, GPIO edge, or timer controls an output directly.

```text
WebSocket ─┐                         ┌─ browser audio
GPIO ─────┼─ command → state →─────┼─ mpv
Timer ────┘                  │      ├─ history and settings
                            └──────┴─ WebSocket broadcast
ICY metadata ───────────── command
```

## Requirements

- Deno 2.9.3 or newer
- macOS or Linux for development
- 64-bit Raspberry Pi OS with `mpv`, BlueZ, BlueALSA, and `gpiod` for appliance
  playback, Bluetooth audio, and buttons

## Develop

```bash
deno install
deno task dev
```

Open [http://localhost:8787](http://localhost:8787). The backend proxies the
Vite page in development, while Vite's HMR connection stays on port 5173.

The SQLite database is created at `./data/airwave.db`. The server binds to
`127.0.0.1` by default.

## Verify

```bash
deno task check
deno task test
deno task build
```

Astryx's CLI is pinned with the design system and available through Deno:

```bash
deno task astryx doctor
deno task astryx component Button
deno task astryx template dashboard
```

## Compile

Build a binary for the current machine:

```bash
deno task compile:local
./build/airwave
```

Cross-compile the Raspberry Pi binary on the development machine:

```bash
deno task compile
```

The result is `build/airwave-linux-arm64`. Network, environment, file, and
subprocess permissions are embedded in the executable. The frontend build under
`web/dist` is included in the binary.

## Configuration

| Variable                       | Default                  | Purpose                                   |
| ------------------------------ | ------------------------ | ----------------------------------------- |
| `AIRWAVE_HOST`                 | `127.0.0.1`              | HTTP bind address                         |
| `AIRWAVE_PORT`                 | `8787`                   | HTTP port                                 |
| `AIRWAVE_DB_PATH`              | `./data/airwave.db`      | SQLite database path                      |
| `AIRWAVE_WEB_ROOT`             | `./web/dist`             | Embedded/static frontend path             |
| `AIRWAVE_MPV_COMMAND`          | `mpv`                    | `mpv` executable path                     |
| `AIRWAVE_MPV_SOCKET`           | `/tmp/airwave-mpv.sock`  | `mpv` IPC socket                          |
| `AIRWAVE_BLUETOOTHCTL_COMMAND` | `bluetoothctl`           | BlueZ control executable path             |
| `AIRWAVE_GPIO_CHIP`            | unset                    | GPIO chip; leaving it unset disables GPIO |
| `AIRWAVE_GPIO_BIAS`            | `pull-up`                | `pull-up` or `external`                   |
| `AIRWAVE_GPIO_BUTTONS`         | standard four-button map | JSON map from line offsets to actions     |

Supported GPIO actions are `toggle`, `next`, `volumeUp`, and `volumeDown`. Run
`gpiodetect` on the Pi before setting `AIRWAVE_GPIO_CHIP`; Pi models and kernels
expose different chip names. Airwave checks the installed `gpiomon` major
version and uses the matching 1.x or 2.x flags.

Older `gpiomon` releases that cannot request internal bias are rejected when
`AIRWAVE_GPIO_BIAS=pull-up`. Upgrade `gpiod`, or wire external pull-up resistors
and set `AIRWAVE_GPIO_BIAS=external`.

## Bluetooth audio API

The appliance backend exposes Bluetooth management for a local settings UI:

| Method   | Path                                     | Purpose                         |
| -------- | ---------------------------------------- | ------------------------------- |
| `GET`    | `/api/audio?audioOnly=true`              | List adapter and device state   |
| `POST`   | `/api/audio/scan`                        | Scan for 3–30 seconds           |
| `POST`   | `/api/audio/devices/:address/pair`       | Pair and trust a device         |
| `POST`   | `/api/audio/devices/:address/connect`    | Connect and select A2DP output  |
| `POST`   | `/api/audio/devices/:address/disconnect` | Disconnect a device             |
| `DELETE` | `/api/audio/devices/:address`            | Forget a device                 |
| `PUT`    | `/api/audio/output`                      | Select a paired output or local |

Scan accepts `{ "seconds": 8, "audioOnly": true }`. Output selection accepts
`{ "address": "AA:BB:CC:DD:EE:FF" }`, or `{ "address": null }` to return to the
default local audio output. Headless pairing uses BlueZ's `NoInputNoOutput`
agent and supports speakers and headphones that use confirmation-free pairing.

## Raspberry Pi deployment

After a release has been published, install the latest version on a 64-bit
Raspberry Pi with one command:

```bash
curl -fsSL https://github.com/aleh11/airwave/releases/latest/download/install.sh | sudo bash
```

The installer downloads the latest ARM64 binary and its SHA-256 checksum,
verifies it, installs system dependencies, configures the systemd service, and
prints the dashboard URL.

To publish a release, push a version tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The release workflow verifies the project, cross-compiles the Pi binary, and
attaches the binary, checksum, and installer to the GitHub Release.

For a manual/offline installation, copy the ARM64 binary and installer to the
Pi:

```bash
scp build/airwave-linux-arm64 install.sh pi@raspberrypi.local:~/
```

Then run one setup command on the Pi:

```bash
sudo ./install.sh
```

It is safe to run the installer again for an upgrade and it preserves an
existing `/etc/airwave.env`.

The binary may also be passed explicitly:

```bash
sudo ./install.sh /path/to/airwave-linux-arm64
```

Edit `/etc/airwave.env` if the detected GPIO chip or button lines need to be
changed, then run `sudo systemctl restart airwave`.

## Uninstall

Remove the service and binary while preserving configuration and listening data:

```bash
curl -fsSL https://github.com/aleh11/airwave/releases/latest/download/uninstall.sh | sudo bash
```

To also remove `/etc/airwave.env`, `/var/lib/airwave`, and the restricted
service account:

```bash
curl -fsSL https://github.com/aleh11/airwave/releases/latest/download/uninstall.sh | sudo bash -s -- --purge
```

## GPIO wiring

Wire each momentary button between its configured GPIO line and ground.
`gpiomon` requests internal pull-ups and falling edges. The default mapping is:

| BCM line | Action        |
| -------- | ------------- |
| 17       | Play/pause    |
| 27       | Next favorite |
| 22       | Volume up     |
| 23       | Volume down   |

## Security boundary

Airwave has no user accounts. It binds to loopback by default; setting
`AIRWAVE_HOST=0.0.0.0` makes it available to the local network. Do not expose it
directly to the public internet without an authenticated reverse proxy and TLS.
