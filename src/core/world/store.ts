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
import { compileWorldPrompt, type WorldSettings } from "./settings";

/** The stored shape minus the derived field. */
export type WorldInput = Omit<WorldSettingsState, "compiledPrompt">;

export async function getWorldSettings(): Promise<WorldSettingsState> {
  const state = await getAppState();
  return state.world;
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
