/**
 * The catalogues Discovery can browse.
 *
 * Order is the order they appear in the source picker, and the first entry is
 * what a fresh install starts on.
 *
 * Chub leads because Character Tavern's API is gone: every endpoint LettuceAI
 * calls — `/api/homepage/cards`, `/api/character/search`, `/api/character/…` —
 * returns 404, so it cannot list, search or import. It is kept in the list
 * rather than deleted, since the outage may not be permanent and removing it
 * would silently strand anyone whose saved source points at it (getProvider
 * falls back to the default for an unknown id, so a removal would look like
 * their choice being ignored).
 */

import { characterTavernProvider } from "./characterTavern";
import { chubProvider } from "./chub";
import type { DiscoveryProvider } from "./types";

export const DISCOVERY_PROVIDERS: readonly DiscoveryProvider[] = [
  chubProvider,
  characterTavernProvider,
];

export const DEFAULT_PROVIDER_ID = chubProvider.id;

export function getProvider(id: string | null | undefined): DiscoveryProvider {
  return DISCOVERY_PROVIDERS.find((provider) => provider.id === id) ?? chubProvider;
}

export * from "./types";
