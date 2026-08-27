/**
 * Preset storage.
 *
 * SillyTavern's preset model, on LettuceAI's storage. A preset is a *named
 * bundle* of a generation setup: sampler values plus an ordered set of prompt
 * blocks. You switch between them, and the whole setup changes at once —
 * which is the thing LettuceAI had no equivalent for, since its sampler values
 * lived on a Model and its prompt blocks on a SystemPromptTemplate, with no
 * way to name, save or swap the pair.
 *
 * A preset points at a prompt template rather than owning a copy of the
 * blocks, so the existing prompt engine, editor and export paths keep working
 * untouched. Presets themselves live in AppState, which the Rust side stores
 * as an opaque JSON blob — so none of this needs a backend change.
 */

import { getAppState, withAppState } from "../storage/appState";
import {
  addOrUpdateModel,
  readSettings,
  saveAdvancedModelSettings,
  setPromptTemplate,
} from "../storage/repo";
import { createPromptTemplate, deletePromptTemplate, getPromptTemplate } from "../prompts/service";
import type {
  Model,
  Preset,
  PresetGeneration,
  PresetSource,
  RegexRule,
  Settings,
  SystemPromptEntry,
} from "../storage/schemas";

function newId(): string {
  const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof cryptoRef?.randomUUID === "function") return cryptoRef.randomUUID();
  return `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function listPresets(): Promise<Preset[]> {
  const state = await getAppState();
  return [...(state.presets ?? [])].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getPreset(id: string): Promise<Preset | null> {
  const state = await getAppState();
  return (state.presets ?? []).find((preset) => preset.id === id) ?? null;
}

export async function getDefaultPresetId(): Promise<string | null> {
  const state = await getAppState();
  return state.defaultPresetId ?? null;
}

/**
 * The preset new chats start from. Passing an id that no longer exists clears
 * the default rather than leaving a dangling reference behind.
 */
export async function setDefaultPreset(id: string | null): Promise<void> {
  await withAppState((state) => {
    if (id === null) {
      state.defaultPresetId = null;
      return;
    }
    const exists = (state.presets ?? []).some((preset) => preset.id === id);
    state.defaultPresetId = exists ? id : null;
  });
}

export interface CreatePresetInit {
  name: string;
  description?: string;
  source?: PresetSource;
  generation?: PresetGeneration;
  /** Prompt blocks for a new backing template. Ignored if promptTemplateId is set. */
  entries?: SystemPromptEntry[];
  /** Reuse an existing template instead of creating one. */
  promptTemplateId?: string;
  regexes?: RegexRule[];
}

/**
 * Create a preset, minting a backing prompt template unless one is supplied.
 */
export async function createPreset(init: CreatePresetInit): Promise<Preset> {
  const name = init.name.trim();
  if (!name) throw new Error("A preset needs a name.");

  let promptTemplateId = init.promptTemplateId;
  if (!promptTemplateId) {
    // "undefined" is the untyped prompt-set kind. The typed ones — directChat
    // and friends — are validated against a fixed list of required variables
    // ({{scene}}, {{char.name}}, {{key_memories}} …), which an imported or
    // hand-built preset has no reason to contain. LettuceAI's own prompt-set
    // import uses "undefined" for the same reason.
    const template = await createPromptTemplate(name, "undefined", "", init.entries ?? [], false);
    promptTemplateId = template.id;
  }

  const now = Date.now();
  const preset: Preset = {
    id: newId(),
    name,
    description: init.description,
    source: init.source ?? "lettuce",
    promptTemplateId,
    generation: init.generation ?? {},
    regexes: init.regexes ?? [],
    createdAt: now,
    updatedAt: now,
  };

  await withAppState((state) => {
    state.presets = [...(state.presets ?? []), preset];
    // The first preset becomes the default, so importing one is enough to use it.
    if (!state.defaultPresetId) state.defaultPresetId = preset.id;
  });

  return preset;
}

export async function updatePreset(
  id: string,
  updates: Partial<Pick<Preset, "name" | "description" | "generation" | "regexes">>,
): Promise<void> {
  await withAppState((state) => {
    const preset = (state.presets ?? []).find((entry) => entry.id === id);
    if (!preset) return;
    if (updates.name !== undefined) {
      const trimmed = updates.name.trim();
      if (trimmed) preset.name = trimmed;
    }
    if (updates.description !== undefined) preset.description = updates.description;
    if (updates.generation !== undefined) {
      preset.generation = { ...preset.generation, ...updates.generation };
    }
    if (updates.regexes !== undefined) {
      preset.regexes = updates.regexes.map((rule) => ({ ...rule }));
    }
    preset.updatedAt = Date.now();
  });
}

/**
 * Delete a preset. Its backing prompt template goes too unless another preset
 * shares it — deleting a template out from under a second preset would leave
 * that one pointing at nothing.
 */
export async function deletePreset(id: string): Promise<void> {
  let templateToDelete: string | null = null;

  await withAppState((state) => {
    const presets = state.presets ?? [];
    const target = presets.find((preset) => preset.id === id);
    if (!target) return;

    const stillReferenced = presets.some(
      (preset) => preset.id !== id && preset.promptTemplateId === target.promptTemplateId,
    );
    if (!stillReferenced) templateToDelete = target.promptTemplateId;

    state.presets = presets.filter((preset) => preset.id !== id);
    if (state.defaultPresetId === id) {
      state.defaultPresetId = state.presets[0]?.id ?? null;
    }
  });

  if (templateToDelete) {
    try {
      await deletePromptTemplate(templateToDelete);
    } catch {
      // A protected built-in template refuses deletion; the preset is gone
      // either way, which is what was asked for.
    }
  }
}

/** Copy a preset, including a fresh copy of its prompt blocks. */
export async function duplicatePreset(id: string): Promise<Preset | null> {
  const source = await getPreset(id);
  if (!source) return null;

  const template = await getPromptTemplate(source.promptTemplateId);
  return await createPreset({
    name: `${source.name} copy`,
    description: source.description,
    source: source.source,
    generation: { ...source.generation },
    regexes: (source.regexes ?? []).map((rule) => ({ ...rule })),
    entries: template?.entries ?? [],
  });
}

/* ── Export / import ─────────────────────────────────────────────────────
 * A preset travels as one file, the way SillyTavern's do — sampler values and
 * prompt blocks together, so sharing a setup means sharing one thing.
 * ---------------------------------------------------------------------- */

export interface PresetExport {
  version: 1;
  kind: "lettuce_preset";
  name: string;
  description?: string;
  generation: PresetGeneration;
  regexes: RegexRule[];
  entries: SystemPromptEntry[];
}

export async function exportPreset(id: string): Promise<string> {
  const preset = await getPreset(id);
  if (!preset) throw new Error("Preset not found.");
  const template = await getPromptTemplate(preset.promptTemplateId);

  const payload: PresetExport = {
    version: 1,
    kind: "lettuce_preset",
    name: preset.name,
    description: preset.description,
    generation: preset.generation,
    regexes: preset.regexes ?? [],
    entries: template?.entries ?? [],
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Import a preset previously exported from LettuceAI. SillyTavern files go
 * through `importSillyTavernPresetFromFile` instead — this one is deliberately
 * strict, because a wrong guess here would produce a silently broken preset.
 */
export async function importPresetJson(text: string): Promise<Preset> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Not valid JSON: ${(error as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("That file is not a LettuceAI preset.");
  }

  const record = parsed as Partial<PresetExport>;
  if (record.kind !== "lettuce_preset") {
    throw new Error("That file is not a LettuceAI preset.");
  }
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (!name) throw new Error("The preset has no name.");

  return await createPreset({
    name,
    description: typeof record.description === "string" ? record.description : undefined,
    generation: record.generation ?? {},
    regexes: Array.isArray(record.regexes) ? record.regexes : [],
    entries: Array.isArray(record.entries) ? record.entries : [],
  });
}

/* ── Applying a preset ───────────────────────────────────────────────────
 * This is what makes a preset actually reach the model.
 *
 * The Rust engine resolves generation settings through a precedence chain —
 * session, then model, then app-wide settings (see resolve_temperature in
 * chat_manager/execution/mod.rs). Writing only to the app-wide tier is not
 * enough: any model with its own advancedModelSettings, which is the normal
 * case once you have tuned one, shadows it completely and the preset silently
 * does nothing.
 *
 * So a preset is written to *both* the model tier and the app-wide tier. The
 * model tier is what actually takes effect; the app-wide copy is the baseline
 * a newly added model inherits.
 *
 * The seven sampler keys below are the preset's to own, so applying one
 * *clears* any it does not set rather than merging over the top. Otherwise a
 * value from a previously applied preset would linger and quietly affect
 * generation. Everything else — llama.cpp tuning, image-generation settings —
 * is left untouched on both tiers.
 * ---------------------------------------------------------------------- */

const PRESET_OWNED_KEYS = [
  "temperature",
  "topP",
  "topK",
  "maxOutputTokens",
  "contextLength",
  "frequencyPenalty",
  "presencePenalty",
] as const;

export async function applyPreset(id: string): Promise<Preset> {
  const preset = await getPreset(id);
  if (!preset) throw new Error("Preset not found.");

  const template = await getPromptTemplate(preset.promptTemplateId);
  if (!template) {
    throw new Error(
      `"${preset.name}" points at a prompt template that no longer exists. Re-import or recreate it.`,
    );
  }

  const settings = await readSettings();

  /** Overlay the preset's seven keys, clearing the ones it leaves unset. */
  const withPresetKeys = <T extends Record<string, unknown>>(base: T): T => {
    const merged: Record<string, unknown> = { ...base };
    for (const key of PRESET_OWNED_KEYS) {
      const value = preset.generation?.[key];
      if (value === undefined || value === null) {
        delete merged[key];
      } else {
        merged[key] = value;
      }
    }
    return merged as T;
  };

  // App-wide baseline.
  await saveAdvancedModelSettings(
    withPresetKeys((settings.advancedModelSettings ?? {}) as Record<string, unknown>) as
      Settings["advancedModelSettings"],
  );

  // Every model, so the preset applies whichever one is selected and no
  // leftover per-model value shadows it.
  for (const model of settings.models ?? []) {
    await addOrUpdateModel({
      ...model,
      advancedModelSettings: withPresetKeys(
        (model.advancedModelSettings ?? {}) as Record<string, unknown>,
      ) as Model["advancedModelSettings"],
    });
  }

  await setPromptTemplate(preset.promptTemplateId);
  await setDefaultPreset(preset.id);

  return preset;
}

/**
 * Which preset the app is currently generating with, or null if the app-wide
 * template has since been pointed somewhere else by hand.
 */
export async function getActivePreset(): Promise<Preset | null> {
  const [settings, activeId] = await Promise.all([readSettings(), getDefaultPresetId()]);
  if (!activeId) return null;
  const preset = await getPreset(activeId);
  if (!preset) return null;
  return settings.promptTemplateId === preset.promptTemplateId ? preset : null;
}
