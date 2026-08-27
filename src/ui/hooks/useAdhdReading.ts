/**
 * Current ADHD Reader intensity, kept in step with settings.
 *
 * Reads once on mount and then follows the settings-updated event, so changing
 * the setting re-renders open chats immediately rather than on next navigation.
 */

import { useEffect, useState } from "react";

import { getAppState } from "../../core/storage/appState";
import { SETTINGS_UPDATED_EVENT } from "../../core/storage/repo";
import type { BionicIntensity } from "../../core/adhd/bionic";

export function useAdhdReading(): BionicIntensity {
  const [intensity, setIntensity] = useState<BionicIntensity>("off");

  useEffect(() => {
    let cancelled = false;

    const read = async () => {
      try {
        const state = await getAppState();
        if (!cancelled) setIntensity(state.adhdReading ?? "off");
      } catch {
        // Settings unreadable: leave rendering untouched rather than guessing.
      }
    };

    void read();
    window.addEventListener(SETTINGS_UPDATED_EVENT, read);
    return () => {
      cancelled = true;
      window.removeEventListener(SETTINGS_UPDATED_EVENT, read);
    };
  }, []);

  return intensity;
}
