# This is a modified copy of LettuceAI

Upstream: **[LettuceAI/app](https://github.com/LettuceAI/app)** — this fork tracks
version 1.2.0 and keeps its AGPL-3.0 licence (see [LICENSE](LICENSE)).

AGPL-3.0 §5(a) asks that a modified version carry prominent notice of the
changes. This file is that notice.

---

## What was changed

### SillyTavern-style presets  *(new)*

Upstream has no preset concept: sampler values live on a Model, prompt blocks on
a SystemPromptTemplate, and there is no way to name, save or swap the pair. This
adds one.

- **Settings → Presets** — create, duplicate, export, delete, and *apply*.
- **Import from SillyTavern** — reads a chat-completion preset `.json`. Prompt
  blocks become template entries; markers (`charDescription`, `scenario`,
  `worldInfoBefore` …) map onto LettuceAI's template variables; the
  `chatHistory` marker becomes the anchor that splits pre- from post-history
  instructions. Anything unmappable is reported rather than dropped silently.
  Tested against a 414-prompt, 1.5 MB community preset.
- **Regex rules** travel inside a preset, in SillyTavern's own format, so an
  imported setup brings its cleanup rules with it.

Applying a preset writes its sampler values to **both** the model tier and the
app-wide tier. That is deliberate: `chat_manager/execution/mod.rs` resolves
generation settings `session → model → settings`, so writing only to the
app-wide tier is silently shadowed by any model that has its own values.

### ADHD Reader  *(new)*

Bionic reading for message text — bolds the leading characters of each word.
Ported from the SillyTavern ADHD Reader extension, keeping its intensity ratios.
**Settings → Customization → Reading.** Off by default.

Implemented as a transform of the React element tree, *not* a DOM pass. The
original mutates rendered output directly; doing that here corrupts the nodes
React tracks and blanks the chat mid-stream.

### Multi-source Discovery  *(extended)*

Upstream Discovery is hard-coded to character-tavern.com. This adds a provider
seam and a source picker, with **Chub** as a second catalogue — browse, search,
paginate, filter and import, no account needed.

Providers are TypeScript and reach the network through the existing Rust
`api_request` command. The webview cannot call these sites directly: no CORS
headers, and Cloudflare returns 403 without a browser User-Agent.

### Build fix  *(upstream bug)*

`src-tauri/src/chat_manager/mod.rs` re-exported only the `__cmd__*` macros for
its 57 commands. `tauri-macros` 2.6.3 also emits a `__tauri_command_name_*`
macro per command, which the generated handler needs — so the crate did not
compile against its own lockfile. The missing re-exports were added.

---

## Setup

See [SETUP.md](SETUP.md). Short version:

```bash
npm run setup   # checks prerequisites, installs dependencies
npm start       # runs the app
```
