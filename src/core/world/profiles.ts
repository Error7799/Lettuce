/**
 * World profiles — saved sets of world rules you can switch between.
 *
 * World settings are global, so running two stories at once means one of them
 * is always configured wrong. A Demon Slayer game wants Taishō, a story point
 * in the Final Selection arc and no future knowledge; a modern-day crime RPG
 * wants none of that and would be actively broken by it. Re-entering twenty
 * toggles on every switch is not a workable answer.
 *
 * A profile is the whole set of rules under a name. Save the one you have,
 * switch to another in a click, come back later and it is exactly as you left
 * it.
 *
 * This is deliberately not per-chat automatic binding. That needs session-level
 * storage and a decision about what happens when a chat is opened on another
 * device; profiles solve the practical problem — switching — without that.
 */

import { getAppState, withAppState } from "../storage/appState";
import type { WorldProfile } from "../storage/schemas";
import { compileWorldPrompt, type WorldSettings } from "./settings";
export { profileMatches } from "./settings";
import type { WorldInput } from "./store";

function newId(): string {
  const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof cryptoRef?.randomUUID === "function") return cryptoRef.randomUUID();
  return `world-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function listWorldProfiles(): Promise<WorldProfile[]> {
  const state = await getAppState();
  return [...(state.worldProfiles ?? [])].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getActiveWorldProfileId(): Promise<string | null> {
  const state = await getAppState();
  return state.activeWorldProfileId ?? null;
}

/**
 * Save the current world rules under a name.
 *
 * Saving over an existing name updates it rather than creating a duplicate —
 * "Demon Slayer" appearing three times is a worse outcome than losing the
 * older copy, which the user can see and re-save anyway.
 */
export async function saveWorldProfile(name: string, settings: WorldInput): Promise<WorldProfile> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A profile needs a name.");

  let saved: WorldProfile | null = null;
  const now = Date.now();

  await withAppState((state) => {
    const profiles = state.worldProfiles ?? [];
    // `enabled` is not part of a profile: whether world rules are on at all is
    // a separate switch from which rules they are, and carrying it would let
    // loading a profile silently turn the whole system off.
    const { enabled: _ignored, ...rules } = settings;
    const existing = profiles.find(
      (profile) => profile.name.toLowerCase() === trimmed.toLowerCase(),
    );

    if (existing) {
      existing.settings = rules;
      existing.updatedAt = now;
      saved = existing;
    } else {
      const profile: WorldProfile = {
        id: newId(),
        name: trimmed,
        settings: rules,
        createdAt: now,
        updatedAt: now,
      };
      state.worldProfiles = [...profiles, profile];
      saved = profile;
    }
    state.activeWorldProfileId = saved.id;
  });

  if (!saved) throw new Error("Could not save the profile.");
  return saved;
}

/**
 * Load a profile over the current settings.
 *
 * Returns the merged settings so the caller can render them immediately rather
 * than re-reading. `compiledPrompt` is rebuilt here for the same reason it is
 * rebuilt on every save: it is what the prompt engine actually injects, and a
 * stale one would mean loading a profile changed the UI but not the model.
 */
export async function applyWorldProfile(id: string): Promise<WorldInput | null> {
  let applied: WorldInput | null = null;

  await withAppState((state) => {
    const profile = (state.worldProfiles ?? []).find((entry) => entry.id === id);
    if (!profile) return;

    const merged = { ...state.world, ...profile.settings };
    merged.compiledPrompt = compileWorldPrompt(merged as WorldSettings);
    state.world = merged;
    state.activeWorldProfileId = profile.id;

    const { compiledPrompt: _ignored, ...rest } = merged;
    applied = rest as WorldInput;
  });

  return applied;
}

export async function deleteWorldProfile(id: string): Promise<void> {
  await withAppState((state) => {
    state.worldProfiles = (state.worldProfiles ?? []).filter((profile) => profile.id !== id);
    if (state.activeWorldProfileId === id) state.activeWorldProfileId = null;
  });
}

export async function renameWorldProfile(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  await withAppState((state) => {
    const profile = (state.worldProfiles ?? []).find((entry) => entry.id === id);
    if (!profile) return;
    profile.name = trimmed;
    profile.updatedAt = Date.now();
  });
}
