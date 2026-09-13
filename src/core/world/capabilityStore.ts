/**
 * Saving capability sheets.
 *
 * Like world settings, the compiled text is stored alongside the fields because
 * the Rust prompt engine injects it verbatim. Recompiling on save is what makes
 * an edit take effect — saving the fields without rebuilding the text would
 * leave the model resolving actions against the previous sheet.
 */

import { getAppState, withAppState } from "../storage/appState";
import type { PersonaCapabilitiesState } from "../storage/schemas";
import {
  EMPTY_CAPABILITIES,
  compileCapabilities,
  type PersonaCapabilities,
} from "./capabilities";

export async function getPersonaCapabilities(
  personaId: string,
): Promise<PersonaCapabilitiesState> {
  const state = await getAppState();
  return state.personaCapabilities?.[personaId] ?? { ...EMPTY_CAPABILITIES, compiled: "" };
}

export async function savePersonaCapabilities(
  personaId: string,
  patch: Partial<PersonaCapabilities>,
): Promise<PersonaCapabilitiesState> {
  let saved: PersonaCapabilitiesState | null = null;

  await withAppState((state) => {
    const current = state.personaCapabilities?.[personaId] ?? {
      ...EMPTY_CAPABILITIES,
      compiled: "",
    };
    const merged = { ...current, ...patch };
    merged.compiled = compileCapabilities(merged);
    state.personaCapabilities = { ...(state.personaCapabilities ?? {}), [personaId]: merged };
    saved = merged;
  });

  return saved ?? (await getPersonaCapabilities(personaId));
}

export async function clearPersonaCapabilities(personaId: string): Promise<void> {
  await withAppState((state) => {
    const next = { ...(state.personaCapabilities ?? {}) };
    delete next[personaId];
    state.personaCapabilities = next;
  });
}
