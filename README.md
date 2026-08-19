# Andon Radio Control

An unofficial, browser-based control client for the [Andon Radio](https://andonlabs.com/store) —
a hand-built internet radio. It talks directly to the radio's local-network
control interface (a WebSocket on port 8080), so you can drive it from any
device on the same Wi-Fi without the official mobile app.

**Live:** https://andon.ericbetts.dev

## Features

- Connect to your radio by IP (remembered in the browser for next time)
- Now-playing display with play / pause, previous / next station
- Rotary volume knob (drag, scroll, arrow keys, or preset buttons) with mute
- Station grid — click to tune, highlights the current station
- Add stations from a list of popular public streams
- Remove stations, or reset to the factory station list
- Auto-reconnects if the connection drops

## Usage

The page is a static site — no build step, no backend. It runs entirely in
your browser and connects straight to the radio over your local network.

1. Open the site while on the same Wi-Fi as your radio.
2. Enter the radio's local IP address (e.g. `10.0.1.138`) and connect.

Because browsers can't discover devices via mDNS, you supply the IP yourself.
Find it in your router's device list, or on macOS:

```sh
dns-sd -B _http._tcp                       # look for a "radio-XXXX" entry
dns-sd -L "radio-XXXX" _http._tcp local    # resolve it to a host
```

## Local development

Any static file server works, e.g.:

```sh
python3 -m http.server 9000
```

Then open `http://localhost:9000`.

## Notes

- This is a community project and is not affiliated with or endorsed by
  Andon Labs.
- The design takes its cues from the physical radio: warm walnut, a silver
  perforated grille, and that orange volume knob.
