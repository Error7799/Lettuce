/**
 * SillyTavern chat-completion preset import.
 *
 * A SillyTavern preset is a flat JSON object of roughly sixty sampler and
 * behaviour keys, plus two arrays that together describe the prompt:
 *
 *   prompts[]      every prompt block the preset knows about, keyed by an
 *                  `identifier`. A block is either free text (it has
 *                  `content`) or a *marker* — a placeholder telling ST to
 *                  splice in something it generates itself, such as the
 *                  character description or the chat history.
 *   prompt_order[] the order and enabled state of those blocks, stored per
 *                  character id. 100000 is the global default and 100001 the
 *                  group-chat default; real presets ship one or both.
 *
 * LettuceAI's SystemPromptTemplate is already shaped like ST's prompt
 * manager — entries carry `role`, `content`, `enabled`, `injectionPosition`
 * and `injectionDepth`, which line up one-for-one — so the free-text blocks
 * convert directly. Markers are the interesting part: LettuceAI splices the
 * same content in through template variables (`{{char.desc}}`, `{{lorebook}}`
 * …), so each marker becomes a small entry containing just its variable.
 *
 * Everything that cannot be represented is reported rather than dropped
 * silently — see `ImportNote`. This module is deliberately dependency-free
 * (type-only imports) so it can be exercised outside the Tauri runtime.
 */

import type {
  PromptEntryPosition,
  PromptEntryRole,
  PromptTemplateType,
  SystemPromptEntry,
} from "../storage/schemas";

/* ── Input shape ─────────────────────────────────────────────────────────
 * Read tolerantly. Presets in the wild are hand-edited, come from a dozen
 * forks, and routinely carry string "true" where a boolean belongs.
 * ---------------------------------------------------------------------- */

export interface SillyTavernPromptBlock {
  identifier?: unknown;
  name?: unknown;
  role?: unknown;
  content?: unknown;
  marker?: unknown;
  system_prompt?: unknown;
  injection_position?: unknown;
  injection_depth?: unknown;
  forbid_overrides?: unknown;
  enabled?: unknown;
}

export interface SillyTavernPreset {
  prompts?: unknown;
  prompt_order?: unknown;
  [key: string]: unknown;
}

/* ── Output shape ────────────────────────────────────────────────────────*/

/** The slice of LettuceAI's model settings a chat-completion preset can fill. */
export interface ImportedGenerationSettings {
  temperature?: number | null;
  topP?: number | null;
  topK?: number | null;
  maxOutputTokens?: number | null;
  contextLength?: number | null;
  frequencyPenalty?: number | null;
  presencePenalty?: number | null;
}

export type ImportNoteKind = "mapped" | "skipped" | "warning";

export interface ImportNote {
  kind: ImportNoteKind;
  /** The ST identifier or settings key this note is about. */
  subject: string;
  message: string;
}

export interface ImportedPreset {
  name: string;
  source: "sillytavern";
  template: {
    name: string;
    promptType: PromptTemplateType;
    content: string;
    entries: SystemPromptEntry[];
    condensePromptEntries: boolean;
  };
  generation: ImportedGenerationSettings;
  notes: ImportNote[];
}

/* ── Coercion helpers ────────────────────────────────────────────────────*/

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asTrimmed(value: unknown): string | null {
  const raw = asString(value);
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/** ST writes booleans as real booleans, as "true"/"false", and as 0/1. */
function asBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (lowered === "true") return true;
    if (lowered === "false") return false;
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Clamp into a range, so a preset built for another app can't produce an
 *  out-of-range value that LettuceAI's schema would later reject. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function asRole(value: unknown): PromptEntryRole {
  const raw = asString(value)?.toLowerCase();
  if (raw === "user" || raw === "assistant" || raw === "system") return raw;
  return "system";
}

/* ── Marker mapping ──────────────────────────────────────────────────────
 * ST markers name content ST splices in; LettuceAI splices the equivalent in
 * through a template variable. `null` means LettuceAI has no equivalent and
 * the block is reported as skipped.
 * ---------------------------------------------------------------------- */

interface MarkerMapping {
  /** LettuceAI template variable, or null when there is no equivalent. */
  variable: string | null;
  /** Shown in the import report. */
  note?: string;
}

const MARKER_MAP: Record<string, MarkerMapping> = {
  charDescription: { variable: "{{char.desc}}" },
  charPersonality: {
    variable: "{{char.desc}}",
    note: "LettuceAI keeps personality inside the character description, so this shares {{char.desc}}.",
  },
  scenario: { variable: "{{scene}}" },
  personaDescription: { variable: "{{persona.desc}}" },
  worldInfoBefore: { variable: "{{lorebook}}" },
  worldInfoAfter: { variable: "{{lorebook}}" },
  dialogueExamples: {
    variable: null,
    note: "LettuceAI has no example-dialogue slot; put examples in the character description instead.",
  },
  enhanceDefinitions: {
    variable: null,
    note: "This is a SillyTavern built-in instruction with no LettuceAI equivalent.",
  },
};

/** The anchor that splits pre-history from post-history instructions. */
const CHAT_HISTORY_MARKER = "chatHistory";

/* ── Variable translation ────────────────────────────────────────────────
 * Free-text blocks are written against SillyTavern's macro vocabulary.
 * LettuceAI's is namespaced, so the text has to be translated or the prompt
 * arrives with dead placeholders in it. Longest-first, so {{char}} does not
 * eat the start of a longer name.
 * ---------------------------------------------------------------------- */

const VARIABLE_MAP: ReadonlyArray<readonly [RegExp, string]> = [
  [/\{\{\s*original\s*\}\}/gi, ""],
  [/\{\{\s*personality\s*\}\}/gi, "{{char.desc}}"],
  [/\{\{\s*description\s*\}\}/gi, "{{char.desc}}"],
  [/\{\{\s*scenario\s*\}\}/gi, "{{scene}}"],
  [/\{\{\s*persona\s*\}\}/gi, "{{persona.desc}}"],
  [/\{\{\s*wiBefore\s*\}\}/gi, "{{lorebook}}"],
  [/\{\{\s*wiAfter\s*\}\}/gi, "{{lorebook}}"],
  [/\{\{\s*loreBefore\s*\}\}/gi, "{{lorebook}}"],
  [/\{\{\s*loreAfter\s*\}\}/gi, "{{lorebook}}"],
  [/\{\{\s*charPrompt\s*\}\}/gi, "{{char.desc}}"],
  [/\{\{\s*mesExamples\s*\}\}/gi, ""],
  [/\{\{\s*time\s*\}\}/gi, "{{time_full}}"],
  // Bare names last: they are prefixes of nothing, but keep the order stable.
  [/\{\{\s*char\s*\}\}/gi, "{{char.name}}"],
  [/\{\{\s*user\s*\}\}/gi, "{{persona.name}}"],
];

/** Rewrite ST macros into LettuceAI's vocabulary. */
export function normalizePromptVariables(content: string): string {
  let result = content;
  for (const [pattern, replacement] of VARIABLE_MAP) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/** Macros with no LettuceAI equivalent, reported so the user can fix them. */
const UNTRANSLATED_MACRO = /\{\{\s*(mesExamples|original|charJailbreak|group|model|idle_duration|input|lastMessage[A-Za-z]*)\s*\}\}/gi;

/* ── Sampler mapping ─────────────────────────────────────────────────────*/

interface SamplerMapping {
  key: keyof ImportedGenerationSettings;
  min: number;
  max: number;
  integer?: boolean;
  /** ST uses this value to mean "unset". */
  unsetWhen?: number;
}

const SAMPLER_MAP: Record<string, SamplerMapping> = {
  temperature: { key: "temperature", min: 0, max: 2 },
  top_p: { key: "topP", min: 0, max: 1 },
  top_k: { key: "topK", min: 1, max: 500, integer: true, unsetWhen: 0 },
  openai_max_tokens: { key: "maxOutputTokens", min: 1, max: 1_000_000, integer: true },
  openai_max_context: { key: "contextLength", min: 0, max: 100_000_000, integer: true },
  frequency_penalty: { key: "frequencyPenalty", min: -2, max: 2 },
  presence_penalty: { key: "presencePenalty", min: -2, max: 2 },
};

/**
 * Sampler keys SillyTavern carries that LettuceAI has no cross-provider home
 * for — its equivalents live on provider-specific settings (llama.cpp,
 * Ollama) rather than on the model. Reported so nothing vanishes quietly.
 */
const UNSUPPORTED_SAMPLERS: Record<string, string> = {
  min_p: "LettuceAI exposes min-p per backend (llama.cpp / Ollama) rather than per model.",
  top_a: "LettuceAI has no top-a control.",
  repetition_penalty:
    "LettuceAI exposes repetition penalty per backend (llama.cpp / Ollama) rather than per model.",
  seed: "LettuceAI sets the seed per backend rather than per preset.",
};

/* ── Prompt order ────────────────────────────────────────────────────────*/

interface OrderEntry {
  identifier: string;
  enabled: boolean;
}

/**
 * Pick the ordering to import. 100000 is ST's global default; 100001 is the
 * group default. Prefer the global one, fall back to whatever exists.
 */
function selectOrder(raw: unknown, notes: ImportNote[]): OrderEntry[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const groups = raw.filter((g): g is Record<string, unknown> => !!g && typeof g === "object");
  const preferred =
    groups.find((g) => asNumber(g.character_id) === 100000) ??
    groups.find((g) => asNumber(g.character_id) === 100001) ??
    groups[0];
  if (!preferred) return null;

  const chosenId = asNumber(preferred.character_id);
  if (chosenId !== 100000 && groups.length > 1) {
    notes.push({
      kind: "warning",
      subject: "prompt_order",
      message: `No global ordering (character_id 100000) found; imported the one for character_id ${chosenId ?? "unknown"}.`,
    });
  }

  const order = preferred.order;
  if (!Array.isArray(order)) return null;

  const result: OrderEntry[] = [];
  for (const item of order) {
    if (!item || typeof item !== "object") continue;
    const identifier = asTrimmed((item as Record<string, unknown>).identifier);
    if (!identifier) continue;
    result.push({
      identifier,
      enabled: asBool((item as Record<string, unknown>).enabled) ?? true,
    });
  }
  return result.length > 0 ? result : null;
}

/* ── Conversion ──────────────────────────────────────────────────────────*/

function makeEntry(init: {
  name: string;
  role: PromptEntryRole;
  content: string;
  enabled: boolean;
  position: PromptEntryPosition;
  depth: number;
  systemPrompt: boolean;
}): SystemPromptEntry {
  return {
    id: newId(),
    name: init.name,
    role: init.role,
    content: init.content,
    enabled: init.enabled,
    injectionPosition: init.position,
    injectionDepth: init.depth,
    systemPrompt: init.systemPrompt,
  } as SystemPromptEntry;
}

let idCounter = 0;
function newId(): string {
  const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof cryptoRef?.randomUUID === "function") return cryptoRef.randomUUID();
  idCounter += 1;
  return `st-import-${Date.now().toString(36)}-${idCounter}`;
}

export interface ConvertOptions {
  /** Name for the resulting template. Defaults to the preset's own name. */
  name?: string;
}

/**
 * Convert a parsed SillyTavern chat-completion preset into the pieces
 * LettuceAI stores: a prompt template and a set of generation settings.
 *
 * Never throws on malformed input — anything unreadable becomes a note.
 */
export function convertSillyTavernPreset(
  raw: SillyTavernPreset,
  options: ConvertOptions = {},
): ImportedPreset {
  const notes: ImportNote[] = [];
  const name = options.name?.trim() || asTrimmed(raw.name) || "Imported preset";

  /* Generation settings */
  const generation: ImportedGenerationSettings = {};
  for (const [stKey, mapping] of Object.entries(SAMPLER_MAP)) {
    const value = asNumber(raw[stKey]);
    if (value === null) continue;
    if (mapping.unsetWhen !== undefined && value === mapping.unsetWhen) continue;
    const clamped = clamp(value, mapping.min, mapping.max);
    generation[mapping.key] = mapping.integer ? Math.round(clamped) : clamped;
    if (clamped !== value) {
      notes.push({
        kind: "warning",
        subject: stKey,
        message: `Value ${value} is outside LettuceAI's range and was clamped to ${clamped}.`,
      });
    }
  }

  for (const [stKey, reason] of Object.entries(UNSUPPORTED_SAMPLERS)) {
    const value = asNumber(raw[stKey]);
    // ST's "unset" values: 0 for the sampler cutoffs, -1 for seed, 1 for
    // repetition penalty. Only report a setting the user actually changed.
    const isDefault =
      value === null ||
      value === 0 ||
      (stKey === "seed" && value === -1) ||
      (stKey === "repetition_penalty" && value === 1);
    if (isDefault) continue;
    notes.push({ kind: "skipped", subject: stKey, message: `${reason} (was ${value})` });
  }

  /* Prompt blocks */
  const blocks = new Map<string, SillyTavernPromptBlock>();
  if (Array.isArray(raw.prompts)) {
    for (const block of raw.prompts) {
      if (!block || typeof block !== "object") continue;
      const identifier = asTrimmed((block as SillyTavernPromptBlock).identifier);
      if (!identifier) continue;
      blocks.set(identifier, block as SillyTavernPromptBlock);
    }
  }

  const order = selectOrder(raw.prompt_order, notes);
  // With no ordering, fall back to the order the blocks were declared in.
  const sequence: OrderEntry[] =
    order ?? [...blocks.keys()].map((identifier) => ({ identifier, enabled: true }));

  if (blocks.size === 0) {
    notes.push({
      kind: "warning",
      subject: "prompts",
      message: "The file contains no prompt blocks; only generation settings were imported.",
    });
  }

  const entries: SystemPromptEntry[] = [];
  let seenHistory = false;
  let lorebookUsed = false;

  for (const step of sequence) {
    const block = blocks.get(step.identifier);
    if (!block) {
      notes.push({
        kind: "warning",
        subject: step.identifier,
        message: "Listed in prompt_order but missing from prompts; skipped.",
      });
      continue;
    }

    const label = asTrimmed(block.name) ?? step.identifier;

    /* The history anchor: everything after it is a post-history instruction. */
    if (step.identifier === CHAT_HISTORY_MARKER) {
      seenHistory = true;
      notes.push({
        kind: "mapped",
        subject: step.identifier,
        message: "Used as the history anchor — later blocks import as in-chat injections.",
      });
      continue;
    }

    const isMarker = asBool(block.marker) === true;

    if (isMarker) {
      const mapping = MARKER_MAP[step.identifier];
      if (!mapping || mapping.variable === null) {
        notes.push({
          kind: "skipped",
          subject: step.identifier,
          message: mapping?.note ?? "No LettuceAI equivalent for this SillyTavern marker.",
        });
        continue;
      }
      if (mapping.variable === "{{lorebook}}") {
        if (lorebookUsed) {
          notes.push({
            kind: "skipped",
            subject: step.identifier,
            message: "LettuceAI has a single lorebook slot, already placed by an earlier block.",
          });
          continue;
        }
        lorebookUsed = true;
      }
      entries.push(
        makeEntry({
          name: label,
          role: "system",
          content: mapping.variable,
          enabled: step.enabled,
          position: seenHistory ? "inChat" : "relative",
          depth: 0,
          systemPrompt: true,
        }),
      );
      notes.push({
        kind: "mapped",
        subject: step.identifier,
        message: mapping.note ?? `Mapped to ${mapping.variable}.`,
      });
      continue;
    }

    /* Free-text block — the direct case, and the one user presets rely on. */
    const rawContent = asString(block.content) ?? "";
    const content = normalizePromptVariables(rawContent);
    if (content !== rawContent) {
      notes.push({
        kind: "mapped",
        subject: step.identifier,
        message: "SillyTavern macros were rewritten into LettuceAI's equivalents.",
      });
    }
    const leftovers = [...new Set(rawContent.match(UNTRANSLATED_MACRO) ?? [])];
    if (leftovers.length > 0) {
      notes.push({
        kind: "warning",
        subject: step.identifier,
        message: `No LettuceAI equivalent for ${leftovers.join(", ")} — edit this block after importing.`,
      });
    }
    if (!content.trim()) {
      notes.push({
        kind: "skipped",
        subject: step.identifier,
        message: "Empty prompt block.",
      });
      continue;
    }

    // ST: injection_position 1 means "absolute", i.e. injected into the chat
    // at a depth rather than sitting in the preamble.
    const explicitAbsolute = asNumber(block.injection_position) === 1;
    const depth = Math.max(0, Math.round(asNumber(block.injection_depth) ?? 0));
    const position: PromptEntryPosition = explicitAbsolute || seenHistory ? "inChat" : "relative";

    entries.push(
      makeEntry({
        name: label,
        role: asRole(block.role),
        content,
        enabled: step.enabled,
        position,
        depth: position === "inChat" ? depth : 0,
        systemPrompt: asBool(block.system_prompt) ?? true,
      }),
    );
  }

  if (!seenHistory && entries.length > 0) {
    notes.push({
      kind: "warning",
      subject: CHAT_HISTORY_MARKER,
      message: "No chat-history marker found; every block imported ahead of the conversation.",
    });
  }

  return {
    name,
    source: "sillytavern",
    template: {
      name,
      // Untyped: see the note in presets/store.ts createPreset.
      promptType: "undefined" as PromptTemplateType,
      // Entries carry the prompt; the legacy single-string body stays empty.
      content: "",
      entries,
      condensePromptEntries: false,
    },
    generation,
    notes,
  };
}

/**
 * Parse and convert in one step. Returns a typed failure rather than throwing,
 * so a bad file surfaces in the import UI instead of breaking it.
 */
export function importSillyTavernPresetJson(
  text: string,
  options: ConvertOptions = {},
): { ok: true; preset: ImportedPreset } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `Not valid JSON: ${(error as Error).message}` };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "This file is not a SillyTavern preset object." };
  }

  const record = parsed as SillyTavernPreset;
  const looksLikePreset =
    "prompts" in record ||
    "prompt_order" in record ||
    "chat_completion_source" in record ||
    "openai_max_tokens" in record ||
    "temperature" in record;
  if (!looksLikePreset) {
    return {
      ok: false,
      error: "This JSON does not look like a SillyTavern chat-completion preset.",
    };
  }

  return { ok: true, preset: convertSillyTavernPreset(record, options) };
}
