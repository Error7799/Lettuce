import { useEffect } from "react";
import { onBackButtonPress } from "@tauri-apps/api/app";
import { exit } from "@tauri-apps/plugin-process";
import { useLocation } from "react-router-dom";
import { PluginListener } from "@tauri-apps/api/core";
import { getPlatform } from "../../core/utils/platform";
import { resolveBackTarget, Routes, useNavigationManager } from "../navigation";

export function useAndroidBackHandler(options?: {
  canLeave?: () => boolean | Promise<boolean>;
  onRootBack?: () => Promise<void> | void;
  // Optional fallback route to use instead of exiting when there is no history entry.
  fallbackPath?: string;
}) {
  const { back, backOrReplace, go } = useNavigationManager();
  const location = useLocation();

  useEffect(() => {
    // The hardware back button only exists on mobile. `onBackButtonPress`
    // resolves to `plugin:app|registerListener`, which desktop builds do not
    // expose, so calling it there rejects with "app.registerListener not
    // allowed. Command not found".
    //
    // That is not a harmless one-off: `location.key` is in this effect's deps,
    // so the hook re-registers on every navigation and the rejection repeats
    // for the whole session, burying real errors in the console.
    if (getPlatform().type !== "mobile") return;

    let unlisten: PluginListener | undefined;

    (async () => {
      unlisten = await onBackButtonPress(async () => {
        if (options?.canLeave) {
          const ok = await options.canLeave();
          if (!ok) return;
        }
        const stateFrom =
          (location.state as { from?: string } | null | undefined)?.from || undefined;
        const fromParam = new URLSearchParams(location.search).get("from");
        const decodedFrom = fromParam ? decodeURIComponent(fromParam) : undefined;
        const searchFrom = decodedFrom || stateFrom;
        if (searchFrom && searchFrom.startsWith(Routes.discoverSearch)) {
          go(searchFrom, { replace: true });
          return;
        }

        const currentPath = location.pathname + location.search;
        const target = resolveBackTarget(currentPath);
        if (target) {
          go(target, { replace: true });
          return;
        }

        const idx = (window.history.state && (window.history.state as any).idx) ?? 0;
        if (idx > 0) {
          back();
          return;
        }

        const fallback = options?.fallbackPath;
        if (fallback) {
          backOrReplace(fallback);
          return;
        }
        await options?.onRootBack?.();
        await exit(0);
      });
    })();

    return () => {
      unlisten?.unregister();
    };
  }, [
    location.key,
    location.pathname,
    location.search,
    location.state,
    back,
    backOrReplace,
    go,
    options?.canLeave,
    options?.onRootBack,
    options?.fallbackPath,
  ]);
}
