/**
 * World — the rules this world runs on.
 *
 * Replaces the preset system. A preset was a wall of prompt blocks you had to
 * author or import; this asks the questions directly and writes the prompt for
 * you.
 *
 * Every control shows the *consequence* rather than the jargon — "You can die"
 * rather than "plot armour: none" — because the point is to describe the world
 * you want, not to learn the vocabulary. The compiled prompt is visible at the
 * bottom, so there is no mystery about what the model is actually told.
 *
 * Literal strings rather than t() keys throughout: adding keys would mean
 * editing all 19 locale files, and an untranslated key reads worse than plain
 * English.
 */

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Globe, RotateCcw } from "lucide-react";

import { cn, interactive } from "../../design-tokens";
import { Switch } from "../../components/Switch";
import { toast } from "../../components/toast";
import {
  getWorldSettings,
  previewWorldPrompt,
  saveWorldSettings,
  getLorebookBudget,
  saveLorebookBudget,
  WORLD_STARTING_POINTS,
  type WorldInput,
} from "../../../core/world/store";
import { DEFAULT_WORLD_SETTINGS } from "../../../core/world/settings";

/* ── Small building blocks ───────────────────────────────────────────────*/

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-fg/35">
        {title}
      </h2>
      {hint ? <p className="mb-2 px-1 text-[11px] leading-relaxed text-fg/40">{hint}</p> : null}
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className={cn("rounded-xl border px-4 py-3", "border-fg/10 bg-fg/5")}>{children}</div>;
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-fg">{label}</div>
          <div className="mt-0.5 text-[11px] leading-relaxed text-fg/45">{description}</div>
        </div>
        <div className="shrink-0 pt-0.5">
          <Switch checked={checked} onChange={onChange} aria-label={label} />
        </div>
      </div>
    </Card>
  );
}

function ChoiceRow<T extends string>({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description: string;
  value: T;
  options: readonly { value: T; label: string; hint?: string }[];
  onChange: (value: T) => void;
}) {
  const active = options.find((option) => option.value === value);
  return (
    <Card>
      <div className="text-sm font-medium text-fg">{label}</div>
      <div className="mt-0.5 text-[11px] leading-relaxed text-fg/45">{description}</div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-lg border px-3 py-2 text-xs font-medium",
              interactive.transition.fast,
              value === option.value
                ? "border-accent/40 bg-accent/20 text-accent"
                : "border-fg/10 bg-fg/5 text-fg/60 hover:bg-fg/10 hover:text-fg",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {/* The chosen option's consequence, so the effect is legible without
          having to read the compiled prompt. */}
      {active?.hint ? (
        <div className="mt-2 text-[11px] leading-relaxed text-fg/40">{active.hint}</div>
      ) : null}
    </Card>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────*/

export function WorldPage() {
  const [settings, setSettings] = useState<WorldInput | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [budget, setBudget] = useState(0);

  useEffect(() => {
    void (async () => {
      try {
        const stored = await getWorldSettings();
        const { compiledPrompt: _ignored, ...rest } = stored;
        setSettings(rest);
        setBudget(await getLorebookBudget());
      } catch (error) {
        toast.error("Could not load world settings", String(error));
        setSettings({ ...DEFAULT_WORLD_SETTINGS });
      }
    })();
  }, []);

  // Optimistic: the switch moves immediately and the write follows, because a
  // toggle that waits on disk feels broken.
  const patch = useCallback(async (changes: Partial<WorldInput>) => {
    setSettings((current) => (current ? { ...current, ...changes } : current));
    try {
      await saveWorldSettings(changes);
    } catch (error) {
      toast.error("Could not save", String(error));
    }
  }, []);

  if (!settings) {
    return <div className="px-4 py-6 text-sm text-fg/40">Loading…</div>;
  }

  const compiled = previewWorldPrompt(settings);
  const off = !settings.enabled;

  return (
    <div className="flex h-full flex-col">
      <section className="flex-1 space-y-6 overflow-y-auto px-3 pb-6 pt-3">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium text-fg">
                <Globe className="h-4 w-4 text-accent" />
                World rules
              </div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-fg/45">
                Decide how this world behaves — how dangerous it is, what era it is, whether it
                revolves around you. These are added to every reply the AI writes.
              </div>
            </div>
            <div className="shrink-0 pt-0.5">
              <Switch
                checked={settings.enabled}
                onChange={(value) => void patch({ enabled: value })}
                aria-label="Enable world rules"
              />
            </div>
          </div>
        </Card>

        {off ? (
          <p className="px-1 text-[11px] leading-relaxed text-fg/40">
            Turn this on to set the world's rules. While it is off, nothing below affects the AI.
          </p>
        ) : null}

        <div className={cn("space-y-6", off && "pointer-events-none opacity-40")}>
          <Section
            title="Start from"
            hint="A whole set of rules in one click. You can adjust anything afterwards."
          >
            <div className="flex flex-wrap gap-1.5">
              {WORLD_STARTING_POINTS.map((point) => (
                <button
                  key={point.id}
                  type="button"
                  title={point.description}
                  onClick={() => {
                    void patch(point.settings);
                    toast.success(point.name, point.description);
                  }}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-xs font-medium",
                    "border-fg/10 bg-fg/5 text-fg/70 hover:bg-fg/10 hover:text-fg",
                    interactive.transition.fast,
                  )}
                >
                  {point.name}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Danger">
            <ChoiceRow
              label="How dangerous is this world?"
              description="Sets how seriously harm and threat are treated."
              value={settings.lethality}
              onChange={(value) => void patch({ lethality: value })}
              options={[
                { value: "safe", label: "Safe", hint: "Threats are atmosphere. You don't get seriously hurt." },
                { value: "realistic", label: "Realistic", hint: "Injuries are real and take time to heal." },
                { value: "harsh", label: "Harsh", hint: "Mistakes cost something lasting." },
                { value: "lethal", label: "Lethal", hint: "Deadly situations resolve deadly. No last-second rescue." },
              ]}
            />
            <ChoiceRow
              label="Plot armour"
              description="Whether the story protects you from what would otherwise happen."
              value={settings.plotArmour}
              onChange={(value) => void patch({ plotArmour: value })}
              options={[
                { value: "full", label: "Protected", hint: "You will not be permanently harmed." },
                { value: "some", label: "Some", hint: "You can be hurt, but survive the survivable." },
                { value: "none", label: "None", hint: "You are as vulnerable as anyone. You can die." },
              ]}
            />
            <ToggleRow
              label="Actions can fail"
              description="What you attempt doesn't automatically succeed."
              checked={settings.actionsCanFail}
              onChange={(value) => void patch({ actionsCanFail: value })}
            />
          </Section>

          <Section title="Setting">
            <ChoiceRow
              label="Era"
              description="Constrains technology, language and what exists in the world."
              value={settings.era}
              onChange={(value) => void patch({ era: value })}
              options={[
                { value: "unset", label: "Unset" },
                { value: "medieval", label: "Medieval" },
                { value: "renaissance", label: "Renaissance" },
                { value: "victorian", label: "Victorian" },
                { value: "modern", label: "Modern" },
                { value: "nearFuture", label: "Near future" },
                { value: "cyberpunk", label: "Cyberpunk" },
                { value: "space", label: "Space" },
                { value: "postApocalyptic", label: "Post-apocalyptic" },
                { value: "highFantasy", label: "High fantasy" },
              ]}
            />
            <Card>
              <div className="text-sm font-medium text-fg">Extra setting detail</div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-fg/45">
                Anything specific about where and when this happens. Works with or without an era
                above.
              </div>
              <textarea
                value={settings.eraDetail}
                onChange={(event) => setSettings({ ...settings, eraDetail: event.target.value })}
                onBlur={(event) => void patch({ eraDetail: event.target.value })}
                rows={2}
                placeholder="A drowned city where the tides keep time"
                className={cn(
                  "mt-3 w-full resize-y rounded-lg border bg-fg/[0.03] px-3 py-2 text-xs text-fg",
                  "border-fg/10 placeholder:text-fg/25 focus:border-accent/40 focus:outline-none",
                )}
              />
            </Card>
            <ToggleRow
              label="Hold to the era"
              description="Nothing from a later period appears unless the story establishes it."
              checked={settings.enforceEra}
              onChange={(value) => void patch({ enforceEra: value })}
            />
          </Section>

          <Section title="Tracking">
            <ChoiceRow
              label="Track your stats"
              description="Whether the AI keeps score of your condition and belongings."
              value={settings.statTracking}
              onChange={(value) => void patch({ statTracking: value })}
              options={[
                { value: "off", label: "Off", hint: "Nothing is tracked." },
                { value: "light", label: "In the story", hint: "Reflected in the writing, no status block." },
                { value: "full", label: "Status line", hint: "A short [Status] line after each reply." },
              ]}
            />
            {settings.statTracking !== "off" ? (
              <>
                <ToggleRow
                  label="Health and injuries"
                  description="Physical condition, wounds, exhaustion."
                  checked={settings.trackHealth}
                  onChange={(value) => void patch({ trackHealth: value })}
                />
                <ToggleRow
                  label="Inventory"
                  description="What you're carrying."
                  checked={settings.trackInventory}
                  onChange={(value) => void patch({ trackInventory: value })}
                />
                <ToggleRow
                  label="Money and resources"
                  description="Coin, fuel, ammunition, supplies."
                  checked={settings.trackMoney}
                  onChange={(value) => void patch({ trackMoney: value })}
                />
                <ToggleRow
                  label="Relationships"
                  description="How other characters regard you."
                  checked={settings.trackRelationships}
                  onChange={(value) => void patch({ trackRelationships: value })}
                />
                <ToggleRow
                  label="Time"
                  description="Time of day and how much has passed."
                  checked={settings.trackTime}
                  onChange={(value) => void patch({ trackTime: value })}
                />
              </>
            ) : null}
          </Section>

          <Section title="How the world treats you">
            <ChoiceRow
              label="Does the world revolve around you?"
              description="Whether events centre on you or carry on regardless."
              value={settings.worldFocus}
              onChange={(value) => void patch({ worldFocus: value })}
              options={[
                { value: "protagonist", label: "You're the centre", hint: "Events involve you and matter to you." },
                { value: "balanced", label: "Balanced", hint: "You matter, but so does everyone else." },
                { value: "indifferent", label: "Indifferent", hint: "The world has its own business. You're one person in it." },
              ]}
            />
            <ToggleRow
              label="People have their own agendas"
              description="Others may refuse you, argue, leave, or act against your interests."
              checked={settings.npcAutonomy}
              onChange={(value) => void patch({ npcAutonomy: value })}
            />
            <ToggleRow
              label="Things happen without you"
              description="Events continue elsewhere; you may return to a changed situation."
              checked={settings.offscreenEvents}
              onChange={(value) => void patch({ offscreenEvents: value })}
            />
          </Section>

          <Section
            title="Neutrality"
            hint="Left alone, models moralise and steer toward comfort. An unbiased world has to be asked for."
          >
            <ToggleRow
              label="Don't moralise"
              description="Events are presented without judgement. Characters may have opinions; the narration doesn't."
              checked={settings.moralNeutrality}
              onChange={(value) => void patch({ moralNeutrality: value })}
            />
            <ToggleRow
              label="No reassurance"
              description="Tension is left unresolved when that's where the scene ends."
              checked={settings.noReassurance}
              onChange={(value) => void patch({ noReassurance: value })}
            />
            <ToggleRow
              label="No mind-reading"
              description="Characters only know what they've seen, been told, or could infer."
              checked={settings.noOmniscience}
              onChange={(value) => void patch({ noOmniscience: value })}
            />
          </Section>

          <Section title="Writing">
            <ChoiceRow
              label="Tone"
              description="The register the narration is written in."
              value={settings.tone}
              onChange={(value) => void patch({ tone: value })}
              options={[
                { value: "neutral", label: "Neutral" },
                { value: "warm", label: "Warm" },
                { value: "grim", label: "Grim" },
              ]}
            />
            <ChoiceRow
              label="Reply length"
              description="How much the AI writes each turn."
              value={settings.responseLength}
              onChange={(value) => void patch({ responseLength: value })}
              options={[
                { value: "brief", label: "Brief" },
                { value: "moderate", label: "Moderate" },
                { value: "detailed", label: "Detailed" },
              ]}
            />
            <ChoiceRow
              label="Pacing"
              description="How quickly scenes move."
              value={settings.pacing}
              onChange={(value) => void patch({ pacing: value })}
              options={[
                { value: "fast", label: "Fast" },
                { value: "steady", label: "Steady" },
                { value: "slow", label: "Slow" },
              ]}
            />
            <Card>
              <div className="text-sm font-medium text-fg">Your own rules</div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-fg/45">
                Anything else, one per line. Added to the prompt exactly as written.
              </div>
              <textarea
                value={settings.customRules}
                onChange={(event) => setSettings({ ...settings, customRules: event.target.value })}
                onBlur={(event) => void patch({ customRules: event.target.value })}
                rows={3}
                placeholder={"Magic always costs something\nNo one uses my real name"}
                className={cn(
                  "mt-3 w-full resize-y rounded-lg border bg-fg/[0.03] px-3 py-2 text-xs text-fg",
                  "border-fg/10 placeholder:text-fg/25 focus:border-accent/40 focus:outline-none",
                )}
              />
            </Card>
          </Section>

          <Section
            title="Lorebook budget"
            hint="Caps how much lorebook text is added per message. Lorebooks with many 'always active' entries can otherwise spend most of the context before the scene even starts."
          >
            <Card>
              <div className="text-sm font-medium text-fg">Maximum lorebook tokens</div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-fg/45">
                When the entries that fire exceed this, the lowest-priority ones are dropped.
                Unlimited keeps the old behaviour.
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {([0, 2000, 4000, 8000, 16000] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => void saveLorebookBudget(value).then(() => setBudget(value))}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-xs font-medium",
                      interactive.transition.fast,
                      budget === value
                        ? "border-accent/40 bg-accent/20 text-accent"
                        : "border-fg/10 bg-fg/5 text-fg/60 hover:bg-fg/10 hover:text-fg",
                    )}
                  >
                    {value === 0 ? "Unlimited" : `${value / 1000}k`}
                  </button>
                ))}
              </div>
            </Card>
          </Section>

          {/* Showing the compiled text is the difference between trusting the
              toggles and being able to check them. */}
          <Section title="What the AI is told">
            <Card>
              <button
                type="button"
                onClick={() => setShowPrompt((value) => !value)}
                className="flex w-full items-center justify-between gap-2 text-left"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-fg">Exact wording</div>
                  <div className="mt-0.5 text-[11px] leading-relaxed text-fg/45">
                    {compiled
                      ? `${compiled.split("\n").filter((line) => line.startsWith("- ")).length} rules added to every reply.`
                      : "No rules are being added."}
                  </div>
                </div>
                <ChevronDown
                  className={cn("h-4 w-4 shrink-0 text-fg/40", interactive.transition.fast, showPrompt && "rotate-180")}
                />
              </button>
              {showPrompt ? (
                <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-fg/10 bg-fg/[0.03] p-3 text-[11px] leading-relaxed text-fg/60">
                  {compiled || "Nothing yet."}
                </pre>
              ) : null}
            </Card>

            <button
              type="button"
              onClick={() => {
                void patch({ ...DEFAULT_WORLD_SETTINGS, enabled: settings.enabled });
                toast.success("Reset", "World rules are back to their defaults.");
              }}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium",
                "border-fg/10 bg-fg/5 text-fg/60 hover:bg-fg/10 hover:text-fg",
                interactive.transition.fast,
              )}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset to defaults
            </button>
          </Section>
        </div>
      </section>
    </div>
  );
}
