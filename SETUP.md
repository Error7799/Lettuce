# Install & Setup

There are two ways in. Pick the first one unless you intend to change the code.

- **[Install the app](#install-the-app)** — download, double-click, done. No toolchain.
- **[Build from source](#build-from-source)** — for development. Needs Rust, CMake, a C++ compiler.

---

## Install the app

Go to the [Releases page](../../releases) and download the file for your machine:

| Machine | File |
|---|---|
| MacBook / iMac (M1, M2, M3, M4) | `lettuceai_…_aarch64.dmg` |
| Mac (Intel) | `lettuceai_…_x64.dmg` |
| Windows | `lettuceai_…_x64-setup.exe` |

### macOS — one extra step, once

Open the `.dmg`, drag **lettuceai** into Applications, then run this once in
Terminal:

```bash
xattr -dr com.apple.quarantine /Applications/lettuceai.app
```

Then open it from Applications — the leaf icon — like any other app.

That command is needed because these builds are signed *ad-hoc* rather than
notarized with a paid Apple Developer account. Without it macOS reports the app
as "damaged", which is misleading: it is the quarantine flag every unnotarized
download gets, not a corrupt file. You only need it once per install.

### Windows

Run the `.exe`. SmartScreen will warn about an unknown publisher for the same
reason — no paid code-signing certificate — so choose **More info → Run anyway**.
It installs to the Start menu with the leaf icon.

### Updating

Download the newer installer and run it over the top. Your chats, characters and
settings live outside the app bundle and are not touched.

---

## Publishing a new version

Installers are built by GitHub Actions, not by hand — pushing a version tag
builds macOS and Windows in parallel and attaches the results to a Release:

```bash
git tag v1.2.1
git push origin v1.2.1
```

The run takes roughly 40 minutes the first time and ~10 minutes afterwards, once
the Rust cache is warm. Watch it under the repository's **Actions** tab; the
files appear on the Releases page when it finishes.

You can also trigger it by hand from **Actions → Release installers → Run
workflow**, which asks for the tag to publish under.

---

## Build from source

Only needed if you are changing the code. Two commands on any machine:

```bash
npm run setup
npm start
```

`npm run setup` checks what you're missing, prints the exact install command for
each, and installs dependencies once everything is in place. It never installs
system packages itself — those want elevated permissions and are worth running
knowingly.

### What it needs, and why

LettuceAI is a **Tauri** app: a React frontend inside a Rust binary. Node alone
is not enough, and the build compiles llama.cpp and whisper.cpp from C++ source,
so a C++ toolchain and CMake are required on every platform.

| | |
|---|---|
| **Node.js 20+** | frontend and tooling |
| **Rust** (rustup) | the desktop app itself |
| **CMake** | builds llama.cpp and whisper.cpp |
| **C++ toolchain** | the linker Rust needs |

#### macOS

```bash
xcode-select --install
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
brew install cmake node
```

Then **open a new terminal** so `PATH` picks up rustup, and run `npm run setup`.

Works on both Apple Silicon and Intel. For Metal GPU acceleration on Apple
Silicon, use `npm run tauri:dev:metal` instead of `npm start`.

#### Windows

```powershell
winget install OpenJS.NodeJS
winget install Rustlang.Rustup
winget install Kitware.CMake
winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Then open a new terminal and run `npm run setup`.

#### Linux

```bash
sudo apt install build-essential cmake nodejs npm \
  libwebkit2gtk-4.1-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Running

| command | what it does |
|---|---|
| `npm start` | run the app in development |
| `npm run build:app` | build an installer for the machine you're on |
| `npm run setup` | re-check prerequisites, reinstall dependencies |

**The first run takes 20–45 minutes.** It compiles llama.cpp and whisper.cpp
from source. Later runs start in seconds — the compiled output is cached in
`src-tauri/target/`, which is git-ignored, so a fresh clone pays that cost once.

---

## If something goes wrong

**A feature you expected is missing or broken after pulling new code** — you are
almost certainly running the previously compiled binary. `git pull` updates the
source, not the built app. Run `npm start` again (it rebuilds what changed), or
reinstall from the Releases page. This is the single most common cause of "that
fix didn't work".

**`cargo` or `cmake` not found, but you installed them** — the installers add to
`PATH`, and an already-open terminal won't see it. Open a new one.

**`Port 1420 is already in use`** — a previous run is still going. Close the app
window, or kill the process holding the port:

```bash
lsof -ti:1420 | xargs kill        # macOS / Linux
```

**A build error mentioning `__tauri_command_name_…`** — that's the upstream bug
described in [FORK.md](FORK.md), already fixed here. If you see it, you're on an
unpatched copy.

---

## Package manager

Upstream uses [Bun](https://bun.sh/); this fork commits a `package-lock.json` so
plain `npm` gives reproducible installs. Either works — if you prefer Bun,
`bun install` and `bun run tauri dev`.
