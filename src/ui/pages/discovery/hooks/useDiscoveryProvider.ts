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

function readStored(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
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
