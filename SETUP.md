# Setup

Two commands on any machine:

```bash
npm run setup
npm start
```

`npm run setup` checks what you're missing, prints the exact install command for
each, and installs dependencies once everything is in place. It never installs
system packages itself — those want elevated permissions and are worth running
knowingly.

---

## What it needs, and why

LettuceAI is a **Tauri** app: a React frontend inside a Rust binary. Node alone
is not enough, and the build compiles llama.cpp and whisper.cpp from C++ source,
so a C++ toolchain and CMake are required on every platform.

| | |
|---|---|
| **Node.js 20+** | frontend and tooling |
| **Rust** (rustup) | the desktop app itself |
| **CMake** | builds llama.cpp and whisper.cpp |
| **C++ toolchain** | the linker Rust needs |

### macOS

```bash
xcode-select --install
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
brew install cmake node
```

Then **open a new terminal** so `PATH` picks up rustup, and run `npm run setup`.

Works on both Apple Silicon and Intel. For Metal GPU acceleration on Apple
Silicon, use `npm run tauri:dev:metal` instead of `npm start`.

### Windows

```powershell
winget install OpenJS.NodeJS
winget install Rustlang.Rustup
winget install Kitware.CMake
winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Then open a new terminal and run `npm run setup`.

### Linux

```bash
sudo apt install build-essential cmake nodejs npm \
  libwebkit2gtk-4.1-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

---

## Running

| command | what it does |
|---|---|
| `npm start` | run the app in development |
| `npm run build:app` | build a distributable |
| `npm run setup` | re-check prerequisites, reinstall dependencies |

**The first run takes 20–45 minutes.** It compiles llama.cpp and whisper.cpp
from source. Later runs start in seconds — the compiled output is cached in
`src-tauri/target/`, which is git-ignored, so a fresh clone pays that cost once.

---

## If something goes wrong

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
