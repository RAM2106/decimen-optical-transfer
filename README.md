# Night Coder Optical Transfer: Fountain-Coded QR File Transfer

Send any file or text between two devices using nothing but a **screen and a camera**.
One device displays the file as an endless animated stream of high-contrast QR codes; another device points its camera at it and instantly reconstructs the file.

**No cloud accounts, no pairing, no Wi-Fi/Bluetooth required, zero internet.** The payload travels as pure light.

---

## 🚀 Instant CLI Usage (Zero Install)

You can run Night Coder directly with `npx`:

```bash
# 📡 1. Optical Air-Gapped Stream (Pure Light · Zero Networks)
npx ram21                       # Opens file picker dialog & starts streaming!
npx ram21 ./document.pdf         # Streams file directly

# ⚡ 2. Turbo Instant Download (50+ MB/s · Wi-Fi/Hotspot Scan)
npx ram21 -t ./video.mp4        # Point any phone camera to download at 50+ MB/s

# 📱 3. Show Mobile Phone Receiver QR
npx ram21 -s

# 🖱️ 4. Add to Windows Right-Click Menu
npx ram21 menu
```

---

## 🌐 Web Application

### **→ [ram2106.github.io/decimen-optical-transfer](https://ram2106.github.io/decimen-optical-transfer/)**

Open it on both devices and go — nothing to install. Works 100% offline after the first visit.

Files up to 64 MB (or pasted text), preserved filename, automatic gzip, SHA-256 integrity verification, and instant video playback. Extracted from a high-throughput engine reaching **130+ KB/s phone-to-phone over pure screen light**.

<p align="center">
  <img src="docs/receiving.jpg" width="420"
       alt="Phone receiving a file over light: 130.5 KB/s goodput, halfway through decoding the sender's animated QR stream" />
</p>
<p align="center"><em>Mid-transfer: a phone pulling a file out of the air at 130 KB/s.</em></p>

Neither mode is encrypted: whatever is on the sending screen is readable by
any camera pointed at it. The property this gives you is no network, not
confidentiality — see [privacy](docs/user/privacy.md).

## Documentation

**Using it** — [quick start](docs/user/quick-start.md) ·
[sending](docs/user/sending.md) · [receiving](docs/user/receiving.md) ·
[troubleshooting](docs/user/troubleshooting.md) ·
[install & offline](docs/user/install-and-offline.md) ·
[privacy](docs/user/privacy.md)

**How it's built** — [architecture](docs/technical/architecture.md) ·
[protocol](docs/technical/protocol.md) ·
[platform quirks](docs/technical/platform-quirks.md) ·
[build & release](docs/technical/build-and-release.md)

The short version of the protocol: a screen-to-camera link has no
back-channel, so the sender streams fountain-coded frames ([Luby
transform](https://en.wikipedia.org/wiki/Luby_transform_code)) — the receiver
collects *any* ~K·1.15 distinct frames in any order and peels the file out.
Dropped frames cost time, never correctness.

## Run it yourself

```bash
npm install
npm run dev               # https dev server with HMR
npm run serve             # build, then serve the production bundle
npm run demo              # demo mode: only the bundled payloads can be sent
npm test                  # golden wire-format vectors and unit tests
npm run build             # the hosted site → dist/
npm run build:standalone  # both self-contained pages → dist-standalone/
npm run build:all         # everything
```

Open `https://localhost:5173/send/` on the sending device and the printed
`Network` URL on the receiving phone (accept the self-signed certificate
once). Walkthrough: [quick start](docs/user/quick-start.md).

## Similar projects

The concept here was arrived at independently. It turns out several people
have had similar ideas, and their takes are all worth a look:

- [mohankumarelec/airgapped-qr-code-transfer](https://github.com/mohankumarelec/airgapped-qr-code-transfer):
  browser-based QR file transfer with compression and sequential chunking.
  Discovered after publicly demoing this project; convergent evolution in
  action.
- [divan/txqr](https://github.com/divan/txqr) (2018): animated QR plus
  fountain codes in Go, with two excellent write-ups on why fountain coding
  beats sequential looping.
- [sz3/libcimbar](https://github.com/sz3/libcimbar): goes past QR entirely
  with a custom high-density color code purpose-built for this channel.

Built by [Evan Crawley (Bash Alarmist)](https://www.linkedin.com/in/evan-crawley), with
[node-qrcode](https://github.com/soldair/node-qrcode) and
[zxing-wasm](https://github.com/Sec-ant/zxing-wasm).

## License

MIT
