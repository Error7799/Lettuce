import { useEffect, useState } from "react";
import { getAppState } from "../../../../core/storage/appState";

let cachedShowNsfw: boolean | null = null;

/**
 * NSFW content is filtered Rust-side by Pure mode; cards with isNsfw only
 * reach the UI when the user allows them. This controls whether those cards
 * render unblurred.
 */
export function useShowNsfwImages(): boolean {
  const [show, setShow] = useState(cachedShowNsfw ?? false);

  useEffect(() => {
    let cancelled = false;
    getAppState()
      .then((state) => {
        cachedShowNsfw = !state.pureModeEnabled;
        if (!cancelled) setShow(cachedShowNsfw);
      })
      .catch(() => {
        // keep the safe default (blurred)
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return show;
}

/**
 * Whether Pure Mode is currently narrowing what Discovery can show.
 *
 * Same state as `useShowNsfwImages`, asked the other way round, so a page can
 * explain the gap in its results instead of leaving it unexplained. Starts
 * false so nothing flashes on before the real value is known.
 */
export function usePureModeFiltering(): boolean {
  const [filtering, setFiltering] = useState(cachedShowNsfw === null ? false : !cachedShowNsfw);

  useEffect(() => {
    let cancelled = false;
    getAppState()
      .then((state) => {
        cachedShowNsfw = !state.pureModeEnabled;
        if (!cancelled) setFiltering(state.pureModeEnabled === true);
      })
      .catch(() => {
        // Saying nothing is better than claiming a filter that may not be on.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return filtering;
}
