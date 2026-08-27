/**
 * Bringing a SillyTavern chat-completion preset into LettuceAI.
 *
 * `sillytavern.ts` does the conversion and stays pure; this module is the part
 * that touches the app — picking a file, reading it, and persisting the result
 * as a prompt template.
 *
 * A SillyTavern preset carries both halves of a generation setup, so importing
 * one produces a whole LettuceAI preset: its prompt blocks become the backing
 * template, its sampler values become the preset's generation settings, and
 * the pair is saved together under the file's name.
 */

import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";

import type { Preset } from "../storage/schemas";
import { createPreset } from "./store";
import { importSillyTavernPresetJson, type ImportNote } from "./sillytavern";

export interface PresetImportResult {
  /** The preset that was created, already saved and selectable. */
  preset: Preset;
  /** How many prompt blocks made it across. */
  entryCount: number;
  notes: ImportNote[];
  /** Basename of the imported file, for the confirmation message. */
  fileName: string;
}

export class PresetImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PresetImportError";
  }
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/** Strip the extension so "My Preset.json" becomes the template name. */
function templateNameFromFile(path: string): string {
  return baseName(path).replace(/\.json$/i, "").trim() || "Imported preset";
}

/**
 * Prompt for a preset file and import it.
 *
 * Resolves to null when the user dismisses the picker, throws
 * PresetImportError when the file cannot be used.
 */
export async function importSillyTavernPresetFromFile(): Promise<PresetImportResult | null> {
  const selected = await open({
    multiple: false,
    filters: [{ name: "SillyTavern preset", extensions: ["json"] }],
  });
  if (!selected || typeof selected !== "string") return null;

  let text: string;
  try {
    text = await readTextFile(selected);
  } catch (error) {
    throw new PresetImportError(`Could not read the file: ${(error as Error).message}`);
  }

  return await importSillyTavernPresetText(text, templateNameFromFile(selected), baseName(selected));
}

/**
 * Import from text that has already been read. Split out so the conversion can
 * be exercised without a file dialog, and so a paste-in path can reuse it.
 */
export async function importSillyTavernPresetText(
  text: string,
  name: string,
  fileName = "pasted preset",
): Promise<PresetImportResult> {
  const converted = importSillyTavernPresetJson(text, { name });
  if (!converted.ok) {
    throw new PresetImportError(converted.error);
  }

  const { preset: imported } = converted;
  let preset: Preset;
  try {
    // The whole point of a preset is that the sampler values and the prompt
    // blocks arrive together, so both halves are saved in one go.
    preset = await createPreset({
      name: imported.name,
      source: "sillytavern",
      generation: imported.generation,
      entries: imported.template.entries,
    });
  } catch (error) {
    // Tauri rejects with a bare string, which has no `.message` — reading one
    // is how this surfaced as "Could not save the preset: undefined".
    const detail =
      typeof error === "string" ? error : ((error as Error)?.message ?? String(error));
    throw new PresetImportError(`Could not save the preset: ${detail}`);
  }

  return {
    preset,
    entryCount: imported.template.entries.length,
    notes: imported.notes,
    fileName,
  };
}

/** Split notes for display: problems first, detail behind them. */
export function summariseNotes(notes: ImportNote[]): {
  mapped: ImportNote[];
  skipped: ImportNote[];
  warnings: ImportNote[];
  headline: string;
} {
  const mapped = notes.filter((note) => note.kind === "mapped");
  const skipped = notes.filter((note) => note.kind === "skipped");
  const warnings = notes.filter((note) => note.kind === "warning");

  const parts: string[] = [];
  if (skipped.length > 0) parts.push(`${skipped.length} not supported`);
  if (warnings.length > 0) parts.push(`${warnings.length} to check`);
  const headline = parts.length > 0 ? `Imported, ${parts.join(", ")}.` : "Imported cleanly.";

  return { mapped, skipped, warnings, headline };
}
