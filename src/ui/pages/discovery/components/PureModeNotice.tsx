/**
 * Says out loud that Discovery results are being filtered.
 *
 * Pure Mode narrows Discovery twice over: the catalogue is queried with
 * `nsfw: false` so the API withholds cards before they are ever sent, and
 * anything flagged that slips through is dropped again on the Rust side. Both
 * are correct. What was missing is that neither is visible — the grid simply
 * has fewer things in it, which reads as a broken integration rather than as a
 * setting doing its job, and there is nothing on the page connecting the gap to
 * the switch that caused it.
 *
 * So this is not a bypass. It states what is happening and points at the
 * control, and the decision stays where it was.
 */

import { ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { cn, interactive } from "../../../design-tokens";

export function PureModeNotice({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5",
        "border-fg/10 bg-fg/5",
        className,
      )}
    >
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      <div className="min-w-0 text-[11px] leading-relaxed text-fg/55">
        <span className="font-medium text-fg/75">Pure Mode is on,</span> so some characters are
        hidden here and the catalogue is asked to leave them out entirely. Change it in{" "}
        <Link
          to="/settings/security"
          className={cn("font-medium text-accent underline underline-offset-2", interactive.transition.fast)}
        >
          Settings → Security
        </Link>
        .
      </div>
    </div>
  );
}
