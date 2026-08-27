/**
 * The catalogues Discovery can browse.
 *
 * Order is the order they appear in the source picker. Character Tavern stays
 * first because it is the built-in one people already have results from.
 */

import { characterTavernProvider } from "./characterTavern";
import { chubProvider } from "./chub";
import type { DiscoveryProvider } from "./types";

export const DISCOVERY_PROVIDERS: readonly DiscoveryProvider[] = [
  characterTavernProvider,
  chubProvider,
];

export const DEFAULT_PROVIDER_ID = characterTavernProvider.id;

export function getProvider(id: string | null | undefined): DiscoveryProvider {
  return DISCOVERY_PROVIDERS.find((provider) => provider.id === id) ?? characterTavernProvider;
}

export * from "./types";
