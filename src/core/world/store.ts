/**
 * Saving world settings.
 *
 * Every write recompiles `compiledPrompt` from the toggles. That field is what
 * the Rust prompt engine actually injects, so recompiling on save is the thing
 * that makes a toggle take effect — saving settings without recompiling would
 * leave the model reading the previous world's rules, which is worse than the
 * feature not existing.
 */

import { getAppState, withAppState } from "../storage/appState";
import type { WorldSettingsState } from "../storage/schemas";
import { compileWorldPrompt, compileWorldReminder, type WorldSettings } from "./settings";

/** The stored shape minus the derived field. */
export type WorldInput = Omit<WorldSettingsState, "compiledPrompt" | "compiledReminder">;

export async function getWorldSettings(): Promise<WorldSettingsState> {
  return await ensureWorldPromptCurrent();
}

/**
 * Recompile the stored prompt when it no longer matches the toggles.
 *
 * `compiledPrompt` is only written on save, so a world configured before a rule
 * existed keeps the text it was compiled with — the new rule sits in the
 * toggles and never reaches the model. Nothing prompts a re-save either: the
 * settings look correct, because they are; it is the derived text that is
 * behind. Users would simply find that a documented rule does nothing.
 *
 * This already bit the turn-based combat release, whose four settings were
 * added to worlds that had been compiled before they existed.
 *
 * Called on app start and on every settings read. Writes only on a real
 * mismatch, so the ordinary path is one string comparison and no disk touch.
 */
export async function ensureWorldPromptCurrent(): Promise<WorldSettingsState> {
  const world = (await getAppState()).world;

  const fresh = compileWorldPrompt(world as WorldSettings);
  const freshReminder = compileWorldReminder(world as WorldSettings);
  if (fresh === world.compiledPrompt && freshReminder === world.compiledReminder) return world;

  try {
    await withAppState((draft) => {
      draft.world = { ...draft.world, compiledPrompt: fresh, compiledReminder: freshReminder };
    });
  } catch {
    // A failed rewrite is not worth blocking startup or a settings read — the
    // caller still gets correct toggles, and the next save fixes the text.
  }
  return { ...world, compiledPrompt: fresh, compiledReminder: freshReminder };
}

/** Recompile the prompt for a set of toggles without saving. Used for preview. */
export function previewWorldPrompt(settings: WorldInput): string {
  return compileWorldPrompt(settings as WorldSettings);
}

/**
 * Persist toggles and the text they compile to.
 *
 * Accepts a partial patch so a single switch does not have to send the whole
 * object, and recompiles from the merged result rather than the patch.
 */
export async function saveWorldSettings(patch: Partial<WorldInput>): Promise<WorldSettingsState> {
  let saved: WorldSettingsState | null = null;

  await withAppState((state) => {
    const merged = { ...state.world, ...patch };
    merged.compiledPrompt = compileWorldPrompt(merged as WorldSettings);
    merged.compiledReminder = compileWorldReminder(merged as WorldSettings);
    state.world = merged;
    saved = merged;
  });

  // withAppState always runs the mutator, so this is defensive rather than
  // expected — but returning a stale object here would be a silent bug.
  return saved ?? (await getWorldSettings());
}

/* ── Starting points ─────────────────────────────────────────────────────
 * A blank set of toggles is a poor starting position: the interesting
 * combinations are not obvious, and the difference between "harsh" and
 * "lethal + no plot armour + indifferent world" is exactly what a newcomer
 * cannot guess. These are whole configurations, applied in one click and then
 * adjusted.
 * ---------------------------------------------------------------------- */

export interface WorldStartingPoint {
  id: string;
  name: string;
  description: string;
  settings: Partial<WorldInput>;
}

export const WORLD_STARTING_POINTS: readonly WorldStartingPoint[] = [
  {
    id: "grimdark",
    name: "Grimdark survival",
    description: "Lethal, indifferent, no protection. Mistakes are permanent.",
    settings: {
      lethality: "lethal",
      plotArmour: "none",
      actionsCanFail: true,
      worldFocus: "indifferent",
      npcAutonomy: true,
      offscreenEvents: true,
      moralNeutrality: true,
      noReassurance: true,
      noOmniscience: true,
      tone: "grim",
      statTracking: "light",
      trackHealth: true,
      trackInventory: true,
      initiative: "drive",
      realRefusal: true,
      physicalContinuity: true,
      turnBasedAction: true,
      actionScope: "beat",
      weighActions: true,
      actionGating: true,
      knowledgeFirewall: true,
      realisticResolution: true,
      dialogueStyle: "unpolished",
      restrainedProse: true,
      contactNeedsWillingness: true,
      familiarityIsEarned: true,
      charactersReadDanger: true,
    },
  },
  {
    id: "living",
    name: "Living world",
    description: "People talk like people, act on their own wants, and fights are fair.",
    settings: {
      dialogueStyle: "natural",
      restrainedProse: true,
      initiative: "balanced",
      realRefusal: true,
      physicalContinuity: true,
      contactNeedsWillingness: true,
      familiarityIsEarned: true,
      charactersReadDanger: true,
      intimacyAgency: true,
      intimacyRealism: true,
      turnBasedAction: true,
      actionScope: "beat",
      weighActions: true,
      actionGating: true,
      knowledgeFirewall: true,
      realisticResolution: true,
      npcAutonomy: true,
      offscreenEvents: true,
      worldFocus: "balanced",
      moralNeutrality: true,
      noOmniscience: true,
      lethality: "realistic",
      plotArmour: "none",
      actionsCanFail: true,
      tone: "neutral",
    },
  },
  {
    id: "cozy",
    name: "Cozy",
    description: "Low stakes and warm. Nothing terrible happens to you.",
    settings: {
      lethality: "safe",
      plotArmour: "full",
      actionsCanFail: false,
      worldFocus: "protagonist",
      offscreenEvents: false,
      noReassurance: false,
      tone: "warm",
      pacing: "slow",
      statTracking: "off",
      initiative: "balanced",
      turnBasedAction: false,
      weighActions: false,
      realisticResolution: false,
      dialogueStyle: "natural",
    },
  },
  {
    id: "gritty",
    name: "Gritty realism",
    description: "Consequences stick and people have their own agendas.",
    settings: {
      lethality: "harsh",
      plotArmour: "some",
      actionsCanFail: true,
      worldFocus: "balanced",
      npcAutonomy: true,
      offscreenEvents: true,
      moralNeutrality: true,
      noOmniscience: true,
      tone: "neutral",
      initiative: "balanced",
      realRefusal: true,
      physicalContinuity: true,
      contactNeedsWillingness: true,
      familiarityIsEarned: true,
      charactersReadDanger: true,
      turnBasedAction: true,
      actionScope: "exchange",
      weighActions: true,
      actionGating: true,
      realisticResolution: true,
      dialogueStyle: "natural",
      restrainedProse: true,
    },
  },
  {
    id: "dungeon",
    name: "Dungeon crawl",
    description: "Tracked resources, real danger, a world that keeps score.",
    settings: {
      lethality: "harsh",
      plotArmour: "none",
      actionsCanFail: true,
      statTracking: "full",
      trackHealth: true,
      trackInventory: true,
      trackMoney: true,
      trackTime: true,
      worldFocus: "balanced",
      npcAutonomy: true,
      era: "highFantasy",
      enforceEra: true,
      physicalContinuity: true,
      turnBasedAction: true,
      actionScope: "beat",
      weighActions: true,
      actionGating: true,
      knowledgeFirewall: true,
      realisticResolution: true,
    },
  },
  {
    id: "neutral",
    name: "Strictly neutral",
    description: "No moralising, no steering, no comfort the scene has not earned.",
    settings: {
      moralNeutrality: true,
      noReassurance: true,
      noOmniscience: true,
      worldFocus: "indifferent",
      npcAutonomy: true,
      plotArmour: "none",
      tone: "neutral",
      initiative: "drive",
      realRefusal: true,
      contactNeedsWillingness: true,
      familiarityIsEarned: true,
      charactersReadDanger: true,
      intimacyAgency: true,
      weighActions: true,
      actionGating: true,
      knowledgeFirewall: true,
      realisticResolution: true,
      dialogueStyle: "natural",
      restrainedProse: true,
    },
  },
];

/* ── Lorebook budget ─────────────────────────────────────────────────────
 * Read by the Rust prompt engine as app_state.lorebookBudget.maxTokens.
 * 0 means uncapped, matching the behaviour before the cap existed.
 * -------------------------------------------------------------------- */

export async function getLorebookBudget(): Promise<number> {
  const state = await getAppState();
  return state.lorebookBudget?.maxTokens ?? 0;
}

export async function saveLorebookBudget(maxTokens: number): Promise<void> {
  await withAppState((state) => {
    state.lorebookBudget = { maxTokens: Math.max(0, Math.round(maxTokens)) };
  });
}
