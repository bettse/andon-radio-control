# Andon Radio Control

An unofficial, browser-based control client for the [Andon Radio](https://andonlabs.com/store) —
a hand-built internet radio. It talks directly to the radio's local-network
control interface (a WebSocket on port 8080), so you can drive it from any
device on the same Wi-Fi without the official mobile app.

> ⚠️ **Run this over `http` on your own network — do not host it over HTTPS.**
> Browsers block HTTPS pages from opening insecure `ws://` connections (mixed
> content), and the radio only speaks `ws://` (a LAN device can’t have a public
> TLS cert). So a public HTTPS deployment can’t actually reach your radio; this
> is meant to be served locally. See [Usage](#usage).

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

Because of the mixed-content rule above, you must serve it over **http** on
your LAN (not open the hosted HTTPS site). From this folder:

```sh
python3 -m http.server 9000
```

Then, on any device on the same Wi-Fi, open
`http://<the-serving-computer's-ip>:9000`.

1. Open the app (over http) while on the same Wi-Fi as your radio.
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
