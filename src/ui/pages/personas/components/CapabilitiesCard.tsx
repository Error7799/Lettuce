/**
 * What this persona can actually do.
 *
 * The world rules ask the model to resolve attempted actions against a
 * character's real ability, and until now there was nothing to resolve against
 * — a persona is one free-text paragraph, so the model inferred ability from
 * tone and either granted everything or refused arbitrarily.
 *
 * Deliberately prose, not numbers. "Strength 14" means nothing without a system
 * behind it, and invites arithmetic a language model cannot do consistently.
 * Short factual statements are what it can actually reason over.
 *
 * Literal strings rather than t() keys: adding keys would mean editing all 19
 * locale files, and an untranslated key reads worse than plain English.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Swords } from "lucide-react";

import { cn, radius } from "../../../design-tokens";
import { toast } from "../../../components/toast";
import {
  CAPABILITY_EXAMPLES,
  EMPTY_CAPABILITIES,
  compileCapabilities,
  hasCapabilities,
  type PersonaCapabilities,
} from "../../../../core/world/capabilities";
import {
  getPersonaCapabilities,
  savePersonaCapabilities,
} from "../../../../core/world/capabilityStore";

interface FieldSpec {
  key: keyof PersonaCapabilities;
  label: string;
  hint: string;
  placeholder: string;
  rows: number;
}

const FIELDS: readonly FieldSpec[] = [
  {
    key: "skills",
    label: "Can do",
    hint: "Trained or proven abilities. One per line, and be specific — “strong” tells the AI nothing, “can carry an adult at a jog” does.",
    placeholder: "Years of hand-to-hand training\nReads an opponent's stance",
    rows: 3,
  },
  {
    key: "limits",
    label: "Cannot do",
    hint: "The most useful field. Models respect a stated impossibility far better than one they have to infer.",
    placeholder: "No ranged skill\nCannot beat several armed opponents at once",
    rows: 3,
  },
  {
    key: "equipment",
    label: "Carrying",
    hint: "Only things that plausibly change an outcome.",
    placeholder: "A knife, worn where it can be reached quickly",
    rows: 2,
  },
  {
    key: "condition",
    label: "Physical state",
    hint: "Standing injuries, conditions, general fitness.",
    placeholder: "Old shoulder injury — overhead reach on the right is weak",
    rows: 2,
  },
  {
    key: "notes",
    label: "Anything else",
    hint: "Other things that should weigh on what succeeds.",
    placeholder: "Fights to end things fast rather than to look impressive",
    rows: 2,
  },
];

export function CapabilitiesCard({ personaId }: { personaId?: string }) {
  const [sheet, setSheet] = useState<PersonaCapabilities | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!personaId) {
      setSheet({ ...EMPTY_CAPABILITIES });
      return;
    }
    void (async () => {
      try {
        const stored = await getPersonaCapabilities(personaId);
        const { compiled: _ignored, ...fields } = stored;
        setSheet(fields);
      } catch {
        setSheet({ ...EMPTY_CAPABILITIES });
      }
    })();
  }, [personaId]);

  // Written on blur rather than per keystroke: these are paragraphs, and a
  // write per character would be a lot of disk for no benefit.
  const persist = useCallback(
    async (next: PersonaCapabilities) => {
      if (!personaId) return;
      setSaving(true);
      try {
        await savePersonaCapabilities(personaId, next);
      } catch (error) {
        toast.error("Could not save abilities", String(error));
      } finally {
        setSaving(false);
      }
    },
    [personaId],
  );

  if (!sheet) return null;

  const compiled = compileCapabilities(sheet);
  const active = hasCapabilities(sheet);

  return (
    <div className={cn("border border-fg/10 bg-fg/5 p-4", radius.md)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Swords className="h-4 w-4 text-accent" />
            What they can actually do
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-fg/45">
            Used by the World rules that weigh an attempted action against real ability. Without
            this, the AI guesses from tone — which is why declared actions either always work or
            fail at random.
          </p>
        </div>
        {saving ? <Loader2 className="mt-1 h-3.5 w-3.5 shrink-0 animate-spin text-fg/40" /> : null}
      </div>

      {!personaId ? (
        <p className="mt-3 text-[11px] text-fg/40">Save this persona first, then add abilities.</p>
      ) : (
        <>
          {!active ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {CAPABILITY_EXAMPLES.map((example) => (
                <button
                  key={example.id}
                  type="button"
                  onClick={() => {
                    setSheet(example.capabilities);
                    void persist(example.capabilities);
                    toast.success("Filled in", `${example.label} — edit it to fit your character.`);
                  }}
                  className={cn(
                    "border border-fg/10 bg-fg/5 px-3 py-2 text-xs font-medium text-fg/70",
                    "transition hover:bg-fg/10 hover:text-fg",
                    radius.md,
                  )}
                >
                  {example.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-3 space-y-3">
            {FIELDS.map((field) => (
              <div key={field.key}>
                <label className="text-xs font-medium text-fg/80">{field.label}</label>
                <p className="mt-0.5 text-[11px] leading-relaxed text-fg/40">{field.hint}</p>
                <textarea
                  value={sheet[field.key]}
                  rows={field.rows}
                  placeholder={field.placeholder}
                  onChange={(event) => setSheet({ ...sheet, [field.key]: event.target.value })}
                  onBlur={(event) => void persist({ ...sheet, [field.key]: event.target.value })}
                  className={cn(
                    "mt-1.5 w-full resize-y border bg-fg/[0.03] px-3 py-2 text-xs text-fg",
                    "border-fg/10 placeholder:text-fg/25 focus:border-accent/40 focus:outline-none",
                    radius.md,
                  )}
                />
              </div>
            ))}
          </div>

          {compiled ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-[11px] text-fg/45 hover:text-fg/70">
                What the AI is told
              </summary>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap border border-fg/10 bg-fg/[0.03] p-3 text-[11px] leading-relaxed text-fg/60">
                {compiled}
              </pre>
            </details>
          ) : null}
        </>
      )}
    </div>
  );
}
