/**
 * The catalogue Discovery is currently browsing.
 *
 * Persisted in localStorage rather than app settings: it is a per-device view
 * preference, not something that should travel in a settings export or need a
 * schema migration.
 */

import { useCallback, useEffect, useState } from "react";

import {
  DEFAULT_PROVIDER_ID,
  DISCOVERY_PROVIDERS,
  getProvider,
  type DiscoveryProvider,
} from "../../../../core/discovery/providers/registry";

const STORAGE_KEY = "lettuce.discovery.provider";
/** Marks that the one-off move off the dead Character Tavern API has run. */
const CT_MIGRATION_KEY = "lettuce.discovery.ctMigrated";

function readStored(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);

    // Character Tavern's API went fully 404 — listing, search and import alike.
    // Anyone whose saved source predates that is pinned to a catalogue that
    // cannot return anything, so move them across once. Done once and recorded,
    // so re-picking it by hand afterwards still sticks and this reverses itself
    // cleanly if the site comes back.
    if (stored === "character-tavern" && !localStorage.getItem(CT_MIGRATION_KEY)) {
      localStorage.setItem(CT_MIGRATION_KEY, "1");
      localStorage.setItem(STORAGE_KEY, DEFAULT_PROVIDER_ID);
      return DEFAULT_PROVIDER_ID;
    }

    // Guard against a provider that has since been removed.
    if (stored && DISCOVERY_PROVIDERS.some((provider) => provider.id === stored)) {
      return stored;
    }
  } catch {
    // Private windows and locked-down webviews throw on access.
  }
  return DEFAULT_PROVIDER_ID;
}

export function useDiscoveryProvider(): {
  provider: DiscoveryProvider;
  providerId: string;
  setProviderId: (id: string) => void;
  providers: readonly DiscoveryProvider[];
} {
  const [providerId, setProviderIdState] = useState<string>(readStored);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, providerId);
    } catch {
      // Not being able to remember the choice is not worth failing over.
    }
  }, [providerId]);

  const setProviderId = useCallback((id: string) => {
    setProviderIdState(getProvider(id).id);
  }, []);

  return {
    provider: getProvider(providerId),
    providerId,
    setProviderId,
    providers: DISCOVERY_PROVIDERS,
  };
}
