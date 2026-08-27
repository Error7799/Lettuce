#!/usr/bin/env node
/**
 * One-command setup check.
 *
 * LettuceAI is a Tauri app, so Node alone is not enough — the desktop binary
 * is Rust, and it compiles llama.cpp and whisper.cpp from C++ source. That
 * means a C++ toolchain and CMake on every platform.
 *
 * This script deliberately does NOT install system packages. Those need
 * elevated permissions and are the kind of thing you want to run yourself,
 * knowingly. It checks what is present, prints the exact command for anything
 * missing, and installs the npm dependencies once the rest is in place.
 *
 *   node scripts/setup.mjs      (or: npm run setup)
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:process";

const MAC = platform === "darwin";
const WIN = platform === "win32";
const LINUX = !MAC && !WIN;

const bold = (s) => `[1m${s}[0m`;
const green = (s) => `[32m${s}[0m`;
const red = (s) => `[31m${s}[0m`;
const yellow = (s) => `[33m${s}[0m`;
const dim = (s) => `[2m${s}[0m`;

/** Run a command purely to see whether it exists and succeeds. */
function probe(command) {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
}

const checks = [];
function check(name, version, fixCommand, note) {
  checks.push({ name, version, fixCommand, note });
}

console.log(`\n${bold("LettuceAI setup")}  ${dim(`(${MAC ? "macOS" : WIN ? "Windows" : "Linux"})`)}\n`);

/* ── Node ──────────────────────────────────────────────────────────────── */
const nodeMajor = Number(process.versions.node.split(".")[0]);
check(
  "Node.js",
  nodeMajor >= 20 ? `v${process.versions.node}` : null,
  MAC ? "brew install node" : WIN ? "winget install OpenJS.NodeJS" : "sudo apt install nodejs npm",
  nodeMajor > 0 && nodeMajor < 20 ? `found v${process.versions.node}, needs 20+` : undefined,
);

/* ── Rust ──────────────────────────────────────────────────────────────── */
check(
  "Rust (cargo)",
  probe("cargo --version"),
  MAC || LINUX
    ? "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    : "winget install Rustlang.Rustup",
  "the desktop app itself is Rust",
);

/* ── CMake ─────────────────────────────────────────────────────────────── */
check(
  "CMake",
  probe("cmake --version")?.split("\n")[0],
  MAC ? "brew install cmake" : WIN ? "winget install Kitware.CMake" : "sudo apt install cmake",
  "builds llama.cpp and whisper.cpp",
);

/* ── C++ toolchain ─────────────────────────────────────────────────────── */
if (MAC) {
  // Xcode Command Line Tools provide clang and the linker Rust needs.
  const clt = probe("xcode-select -p");
  check("Xcode Command Line Tools", clt, "xcode-select --install", "provides clang and the linker");
} else if (WIN) {
  const vswhere = `${process.env["ProgramFiles(x86)"]}\\Microsoft Visual Studio\\Installer\\vswhere.exe`;
  const found = existsSync(vswhere)
    ? probe(
        `"${vswhere}" -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property displayName`,
      )
    : null;
  check(
    "MSVC C++ Build Tools",
    found || null,
    'winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"',
    "provides the linker Rust needs",
  );
} else {
  check(
    "C toolchain (cc)",
    probe("cc --version")?.split("\n")[0],
    "sudo apt install build-essential libwebkit2gtk-4.1-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev",
    "plus the GTK/WebKit headers Tauri needs on Linux",
  );
}

/* ── Report ────────────────────────────────────────────────────────────── */
let missing = 0;
for (const { name, version, fixCommand, note } of checks) {
  if (version) {
    console.log(`  ${green("✓")} ${name.padEnd(28)} ${dim(version)}`);
  } else {
    missing += 1;
    console.log(`  ${red("✗")} ${name.padEnd(28)} ${red("missing")}${note ? dim(`  — ${note}`) : ""}`);
    console.log(`      ${yellow(fixCommand)}`);
  }
}

if (missing > 0) {
  console.log(
    `\n${red(`${missing} prerequisite${missing === 1 ? "" : "s"} missing.`)} Install the above, ` +
      `open a new terminal so PATH updates, then run this again.\n`,
  );
  process.exit(1);
}

/* ── Dependencies ──────────────────────────────────────────────────────── */
console.log(`\n${bold("Installing npm dependencies…")}  ${dim("(a few minutes the first time)")}\n`);
const install = spawnSync("npm", ["install", "--no-audit", "--no-fund"], {
  stdio: "inherit",
  shell: true,
});
if (install.status !== 0) {
  console.log(`\n${red("npm install failed.")} See the output above.\n`);
  process.exit(1);
}

console.log(`\n${green("Setup complete.")}\n`);
console.log(`  ${bold("npm start")}    run the app`);
console.log(`  ${bold("npm run build:app")}  build a distributable\n`);
console.log(
  dim(
    "  The first run compiles llama.cpp and whisper.cpp from source and takes\n" +
      "  20-45 minutes. Later runs start in seconds.\n",
  ),
);
