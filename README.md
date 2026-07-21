# Radio Deck

Radio Deck is a self-hosted internet radio dashboard for a browser or Raspberry
Pi. One Deno process owns the radio state, SQLite library, discovery API,
metadata stream, timers, WebSocket clients, optional `mpv` output, and optional
GPIO controls. The React interface is embedded into the compiled executable, so
the Pi receives one binary and no JavaScript runtime.

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
- 64-bit Raspberry Pi OS with `mpv` and `gpiod` for appliance playback and
  buttons

## Develop

```bash
deno install
deno task dev
```

Open [http://localhost:8787](http://localhost:8787). The backend proxies the
Vite page in development, while Vite's HMR connection stays on port 5173.

The SQLite database is created at `./data/radio.db`. The server binds to
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
./build/radio
```

Cross-compile the Raspberry Pi binary on the development machine:

```bash
deno task compile
```

The result is `build/radio-linux-arm64`. Network, environment, file, and
subprocess permissions are embedded in the executable. The frontend build under
`web/dist` is included in the binary.

## Configuration

| Variable             | Default                    | Purpose                                   |
| -------------------- | -------------------------- | ----------------------------------------- |
| `RADIO_HOST`         | `127.0.0.1`                | HTTP bind address                         |
| `RADIO_PORT`         | `8787`                     | HTTP port                                 |
| `RADIO_DB_PATH`      | `./data/radio.db`          | SQLite database path                      |
| `RADIO_WEB_ROOT`     | `./web/dist`               | Embedded/static frontend path             |
| `RADIO_MPV_COMMAND`  | `mpv`                      | `mpv` executable path                     |
| `RADIO_MPV_SOCKET`   | `/tmp/radio-deck-mpv.sock` | `mpv` IPC socket                          |
| `RADIO_GPIO_CHIP`    | unset                      | GPIO chip; leaving it unset disables GPIO |
| `RADIO_GPIO_BIAS`    | `pull-up`                  | `pull-up` or `external`                   |
| `RADIO_GPIO_BUTTONS` | standard four-button map   | JSON map from line offsets to actions     |

Supported GPIO actions are `toggle`, `next`, `volumeUp`, and `volumeDown`. Run
`gpiodetect` on the Pi before setting `RADIO_GPIO_CHIP`; Pi models and kernels
expose different chip names. Radio Deck checks the installed `gpiomon` major
version and uses the matching 1.x or 2.x flags.

Older `gpiomon` releases that cannot request internal bias are rejected when
`RADIO_GPIO_BIAS=pull-up`. Upgrade `gpiod`, or wire external pull-up resistors
and set `RADIO_GPIO_BIAS=external`.

## Raspberry Pi deployment

Copy the ARM64 binary and installer to the Pi:

```bash
scp build/radio-linux-arm64 install.sh pi@raspberrypi.local:~/
```

Then run one setup command on the Pi:

```bash
sudo ./install.sh
```

The installer adds `mpv` and `gpiod`, creates the locked-down service account,
detects the Pi GPIO chip when possible, installs the binary and systemd unit,
starts Radio Deck, and prints its dashboard URL. It is safe to run again for an
upgrade and preserves an existing `/etc/radio-deck.env`.

The binary may also be passed explicitly:

```bash
sudo ./install.sh /path/to/radio-linux-arm64
```

Edit `/etc/radio-deck.env` if the detected GPIO chip or button lines need to be
changed, then run `sudo systemctl restart radio-deck`.

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

Radio Deck has no user accounts. It binds to loopback by default; setting
`RADIO_HOST=0.0.0.0` makes it available to the local network. Do not expose it
directly to the public internet without an authenticated reverse proxy and TLS.
