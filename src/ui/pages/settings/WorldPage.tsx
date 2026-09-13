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
import { ChevronDown, Globe, RotateCcw, Trash2 } from "lucide-react";

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
import {
  applyWorldProfile,
  deleteWorldProfile,
  getActiveWorldProfileId,
  listWorldProfiles,
  profileMatches,
  saveWorldProfile,
} from "../../../core/world/profiles";
import type { WorldProfile } from "../../../core/storage/schemas";

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


/* ── Era picker ──────────────────────────────────────────────────────────
 * Grouped rather than one flat row: there are enough settings now that a
 * single wrapped block of buttons is a wall to scan. The groups are how people
 * actually look for a period — roughly when, or what kind of story.
 * ---------------------------------------------------------------------- */

const ERA_GROUPS: readonly { label: string; options: readonly { value: WorldInput["era"]; label: string }[] }[] = [
  {
    label: "Historical",
    options: [
      { value: "ancientWorld", label: "Ancient world" },
      { value: "darkAges", label: "Dark Ages" },
      { value: "medieval", label: "Medieval" },
      { value: "renaissance", label: "Renaissance" },
      { value: "ageOfSail", label: "Age of sail" },
      { value: "victorian", label: "Victorian" },
      { value: "wildWest", label: "Wild West" },
      { value: "worldWar1", label: "WWI" },
      { value: "roaringTwenties", label: "1920s" },
      { value: "worldWar2", label: "WWII" },
      { value: "coldWar", label: "Cold War" },
      { value: "eighties", label: "1980s" },
      { value: "modern", label: "Modern" },
    ],
  },
  {
    label: "Japan",
    options: [
      { value: "sengoku", label: "Sengoku" },
      { value: "edo", label: "Edo" },
      { value: "meiji", label: "Meiji" },
      { value: "taisho", label: "Taishō" },
    ],
  },
  {
    label: "Speculative",
    options: [
      { value: "nearFuture", label: "Near future" },
      { value: "cyberpunk", label: "Cyberpunk" },
      { value: "steampunk", label: "Steampunk" },
      { value: "dieselpunk", label: "Dieselpunk" },
      { value: "postApocalyptic", label: "Post-apocalyptic" },
      { value: "space", label: "Space" },
      { value: "solarpunk", label: "Solarpunk" },
      { value: "highFantasy", label: "High fantasy" },
      { value: "urbanFantasy", label: "Urban fantasy" },
      { value: "superhero", label: "Superhero" },
    ],
  },
];

function EraPicker({
  value,
  onChange,
}: {
  value: WorldInput["era"];
  onChange: (value: WorldInput["era"]) => void;
}) {
  const chosen = ERA_GROUPS.flatMap((group) => group.options).find((o) => o.value === value);
  return (
    <Card>
      <div className="text-sm font-medium text-fg">Era</div>
      <div className="mt-0.5 text-[11px] leading-relaxed text-fg/45">
        Constrains technology, language and what exists in the world.
        {chosen ? ` Currently: ${chosen.label}.` : " Nothing chosen."}
      </div>

      <button
        type="button"
        onClick={() => onChange("unset")}
        className={cn(
          "mt-3 rounded-lg border px-3 py-2 text-xs font-medium",
          interactive.transition.fast,
          value === "unset"
            ? "border-accent/40 bg-accent/20 text-accent"
            : "border-fg/10 bg-fg/5 text-fg/60 hover:bg-fg/10 hover:text-fg",
        )}
      >
        Unset
      </button>

      {ERA_GROUPS.map((group) => (
        <div key={group.label} className="mt-3">
          <div className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-fg/30">
            {group.label}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {group.options.map((option) => (
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
        </div>
      ))}
    </Card>
  );
}


/* ── World profiles ──────────────────────────────────────────────────────
 * World rules are global, so running two stories at once leaves one of them
 * configured wrong — a Taisho story point is actively harmful in a modern-day
 * game. Profiles make switching a click instead of re-entering twenty toggles.
 * ---------------------------------------------------------------------- */

function WorldProfiles({
  settings,
  onApply,
}: {
  settings: WorldInput;
  onApply: (loaded: WorldInput) => void;
}) {
  const [profiles, setProfiles] = useState<WorldProfile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setProfiles(await listWorldProfiles());
    setActiveId(await getActiveWorldProfileId());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const active = profiles.find((profile) => profile.id === activeId) ?? null;
  // Shown so it is obvious when switching away would discard changes.
  const edited = active ? !profileMatches(active, settings) : false;

  return (
    <Section
      title="Profiles"
      hint="Save these rules under a name and switch between stories without re-entering everything."
    >
      <Card>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={active ? active.name : "Demon Slayer"}
            className={cn(
              "min-w-0 flex-1 rounded-lg border bg-fg/[0.03] px-3 py-2 text-xs text-fg",
              "border-fg/10 placeholder:text-fg/25 focus:border-accent/40 focus:outline-none",
            )}
          />
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              const chosen = name.trim() || active?.name || "";
              if (!chosen) {
                toast.error("Name it first", "Give the profile a name so you can find it again.");
                return;
              }
              setBusy(true);
              try {
                await saveWorldProfile(chosen, settings);
                setName("");
                await refresh();
                toast.success("Saved", `“${chosen}” now holds these rules.`);
              } catch (error) {
                toast.error("Could not save", String(error));
              } finally {
                setBusy(false);
              }
            }}
            className={cn(
              "shrink-0 rounded-lg border px-3 py-2 text-xs font-medium",
              "border-accent/40 bg-accent/20 text-accent hover:bg-accent/25",
              "disabled:cursor-not-allowed disabled:opacity-45",
              interactive.transition.fast,
            )}
          >
            {active && !name.trim() ? "Update" : "Save"}
          </button>
        </div>

        {profiles.length > 0 ? (
          <div className="mt-3 space-y-1.5">
            {profiles.map((profile) => {
              const isActive = profile.id === activeId;
              return (
                <div
                  key={profile.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2",
                    isActive ? "border-accent/40 bg-accent/10" : "border-fg/10 bg-fg/[0.03]",
                  )}
                >
                  <button
                    type="button"
                    onClick={async () => {
                      const loaded = await applyWorldProfile(profile.id);
                      if (loaded) {
                        onApply(loaded);
                        await refresh();
                        toast.success("Loaded", profile.name);
                      }
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate text-xs font-medium text-fg">
                      {profile.name}
                      {isActive && edited ? (
                        <span className="ml-2 text-[10px] font-normal text-fg/40">edited</span>
                      ) : null}
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${profile.name}`}
                    onClick={async () => {
                      await deleteWorldProfile(profile.id);
                      await refresh();
                      toast.success("Deleted", profile.name);
                    }}
                    className={cn(
                      "shrink-0 rounded-md p-1.5 text-fg/35 hover:bg-danger/10 hover:text-danger",
                      interactive.transition.fast,
                    )}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-3 text-[11px] leading-relaxed text-fg/40">
            No profiles yet. Set the rules below, then save them under a name.
          </div>
        )}
      </Card>
    </Section>
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
          <WorldProfiles settings={settings} onApply={(loaded) => setSettings(loaded)} />

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
            <EraPicker value={settings.era} onChange={(value) => void patch({ era: value })} />
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
              description="Others may refuse you, argue, leave, or act against your interests — and they aren't here to agree with you or find your ideas good."
              checked={settings.npcAutonomy}
              onChange={(value) => void patch({ npcAutonomy: value })}
            />
            <ChoiceRow
              label="Who moves first?"
              description="How much other characters act on their own wants instead of waiting on you."
              value={settings.initiative}
              onChange={(value) => void patch({ initiative: value })}
              options={[
                { value: "follow", label: "They react", hint: "They respond to what you do and rarely act first." },
                { value: "balanced", label: "Both", hint: "They start things, make requests, arrive and leave on their own timing." },
                { value: "drive", label: "They drive", hint: "They go after what they want without waiting for an opening or permission." },
              ]}
            />
            <ToggleRow
              label="A no is a no"
              description="When someone refuses or walks away, that stands — it isn't an obstacle that wears down if you keep pushing."
              checked={settings.realRefusal}
              onChange={(value) => void patch({ realRefusal: value })}
            />
            <ToggleRow
              label="Things happen without you"
              description="Events continue elsewhere; you may return to a changed situation."
              checked={settings.offscreenEvents}
              onChange={(value) => void patch({ offscreenEvents: value })}
            />
            <ToggleRow
              label="The scene stays put"
              description="Positions, what people are holding, distance and elapsed time stay consistent. Nobody acts from where they aren't, and travel takes as long as it takes."
              checked={settings.physicalContinuity}
              onChange={(value) => void patch({ physicalContinuity: value })}
            />
          </Section>

          <Section
            title="Where the story stands"
            hint="Lorebooks usually document a whole story while you play an early part of it. This stops the ending leaking into the beginning."
          >
            <Card>
              <div className="text-sm font-medium text-fg">Current point in the story</div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-fg/45">
                Describe where things are right now. Anything later than this is treated as not yet
                written.
              </div>
              <textarea
                value={settings.storyPoint}
                onChange={(event) => setSettings({ ...settings, storyPoint: event.target.value })}
                onBlur={(event) => void patch({ storyPoint: event.target.value })}
                rows={2}
                placeholder="The Final Selection arc. Seven days on Mount Fujikasane have just begun."
                className={cn(
                  "mt-3 w-full resize-y rounded-lg border bg-fg/[0.03] px-3 py-2 text-xs text-fg",
                  "border-fg/10 placeholder:text-fg/25 focus:border-accent/40 focus:outline-none",
                )}
              />
            </Card>
            <ToggleRow
              label="No knowledge of what comes later"
              description="Characters can't know, hint at, or act on anything from after this point — even when the lorebook describes it. Background still works; future events don't."
              checked={settings.noFutureKnowledge}
              onChange={(value) => void patch({ noFutureKnowledge: value })}
            />
            <ToggleRow
              label="React as if for the first time"
              description="Surprise and wrong guesses are correct when that's what someone standing there would genuinely feel."
              checked={settings.firstTimeReactions}
              onChange={(value) => void patch({ firstTimeReactions: value })}
            />
          </Section>

          <Section
            title="Turns and actions"
            hint="Stops the AI resolving a whole attack sequence while you just watch. It ends its reply while the outcome is still open, so you get to answer."
          >
            <ToggleRow
              label="Turn-based action"
              description="The AI stops at the first moment you could react — a strike mid-swing, a leap still in the air — instead of narrating through to the result. It also stops writing what your character does in response."
              checked={settings.turnBasedAction}
              onChange={(value) => void patch({ turnBasedAction: value })}
            />
            {settings.turnBasedAction ? (
              <ChoiceRow
                label="How much per reply"
                description="How far the AI may take a scene before handing it back to you."
                value={settings.actionScope}
                onChange={(value) => void patch({ actionScope: value })}
                options={[
                  { value: "beat", label: "One action", hint: "An opponent commits to a single thing, then it's your move." },
                  { value: "exchange", label: "Short exchange", hint: "A move and its immediate answer, then it stops." },
                  { value: "free", label: "Free", hint: "The scene runs as far as it naturally goes." },
                ]}
              />
            ) : null}
            <ToggleRow
              label="Actions are attempts, not results"
              description={
                "Everything you write is weighed against what your character can actually do — writing “I catch it” does not make it happen. Saying “I try” marks uncertainty, but leaving it out never guarantees success."
              }
              checked={settings.weighActions}
              onChange={(value) => void patch({ weighActions: value })}
            />
            <ToggleRow
              label="Actions stop where they fail"
              description={
                "A sentence like “I run to her, get to the car and pull away” is read as four steps, each checked against the state you're actually in. With a shot leg the run becomes a stumble and the car is never reached — the rest doesn't happen just because you wrote it."
              }
              checked={settings.actionGating}
              onChange={(value) => void patch({ actionGating: value })}
            />
            <ToggleRow
              label="Knowledge firewall"
              description="Opponents don't know your weaknesses, fears or limits unless they learned them in the story. They have to work them out mid-fight — probing your defence, watching which side you favour, pressing your mistakes."
              checked={settings.knowledgeFirewall}
              onChange={(value) => void patch({ knowledgeFirewall: value })}
            />
            <ToggleRow
              label="Realistic resolution"
              description="Fights are decided by comparing strength, speed, reach, gear and training. Stamina drains, armour costs agility, and a wounded arm keeps making weaker strikes."
              checked={settings.realisticResolution}
              onChange={(value) => void patch({ realisticResolution: value })}
            />
            <ToggleRow
              label="Everyone stays present"
              description="Other people in the scene keep doing things while two characters talk — reacting, losing patience, interrupting — instead of standing frozen until spoken to."
              checked={settings.livingScenes}
              onChange={(value) => void patch({ livingScenes: value })}
            />
            <ToggleRow
              label="Distance and time are real"
              description="Crossing a city takes as long as it takes, wounds need days rather than a scene, and nobody arrives just because the moment calls for them."
              checked={settings.timeAndDistance}
              onChange={(value) => void patch({ timeAndDistance: value })}
            />
            <ToggleRow
              label="Never write your character's thoughts"
              description="The AI describes what is said and done to you, then stops. It won't tell you what you felt, noticed or realised."
              checked={settings.noUserInteriority}
              onChange={(value) => void patch({ noUserInteriority: value })}
            />
            <ToggleRow
              label="Consequences persist"
              description="Promises, debts, grudges and favours are remembered and come back — whether or not it's convenient."
              checked={settings.consequencesPersist}
              onChange={(value) => void patch({ consequencesPersist: value })}
            />
            <ToggleRow
              label="No time skips"
              description="Stays in the present moment instead of jumping to “later that evening” without you."
              checked={settings.noTimeSkips}
              onChange={(value) => void patch({ noTimeSkips: value })}
            />
            <ToggleRow
              label="Don't ask what you do next"
              description="Ends on something happening in the world rather than “What do you do?”."
              checked={settings.noPromptingTheUser}
              onChange={(value) => void patch({ noPromptingTheUser: value })}
            />
            <ToggleRow
              label="No repeated phrasing"
              description="Stops the AI reusing its own distinctive images and sentence shapes — the same silence described as heavy three scenes running."
              checked={settings.noSelfRepetition}
              onChange={(value) => void patch({ noSelfRepetition: value })}
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

          <Section
            title="Boundaries and trust"
            hint="Without these the world bends to whoever moves first: a stranger walks up and every touch simply works, because the AI resolves reaching for a person the same way it resolves reaching for an object."
          >
            <ToggleRow
              label="Contact is theirs to answer"
              description="Touching, holding, kissing, carrying or leading someone are requests made with the body — the other person decides how they land, and the AI has to settle that before writing the contact happening. Gentleness isn't consent."
              checked={settings.contactNeedsWillingness}
              onChange={(value) => void patch({ contactNeedsWillingness: value })}
            />
            <ToggleRow
              label="Strangers stay strangers"
              description="How close someone is allowed tracks how well they're actually known, not how the scene is going. Familiarity is earned across the story — and using a name you were never told makes people warier, not closer."
              checked={settings.familiarityIsEarned}
              onChange={(value) => void patch({ familiarityIsEarned: value })}
            />
            <ToggleRow
              label="People read danger"
              description="Who is this, are they armed, how did they get here unheard, where are the exits. Being impressed or attracted doesn't switch caution off — on a first meeting caution usually wins."
              checked={settings.charactersReadDanger}
              onChange={(value) => void patch({ charactersReadDanger: value })}
            />
          </Section>

          <Section
            title="Attraction and intimacy"
            hint="About who the character is in these scenes, not how explicit they get — that stays with the content filter in Security."
          >
            <ToggleRow
              label="Desire is theirs"
              description="They can want you before you want them, say it first, reach first, ask for more — and equally lose interest, decline, or stop partway. Neither waits on your cue."
              checked={settings.intimacyAgency}
              onChange={(value) => void patch({ intimacyAgency: value })}
            />
            <ToggleRow
              label="Specific, not scripted"
              description="What happens follows from these two people and their history. Bodies are awkward, timing is off, people talk in their normal voice — and no two scenes run the same order."
              checked={settings.intimacyRealism}
              onChange={(value) => void patch({ intimacyRealism: value })}
            />
          </Section>

          <Section
            title="How people speak"
            hint="The loudest tell that you're talking to a model is that every line is composed. Real speech is short, plain, and often badly put together."
          >
            <ChoiceRow
              label="Dialogue"
              description="How polished spoken lines are allowed to be."
              value={settings.dialogueStyle}
              onChange={(value) => void patch({ dialogueStyle: value })}
              options={[
                {
                  value: "cinematic",
                  label: "Cinematic",
                  hint: "Composed, quotable lines, the way they're written for screen.",
                },
                {
                  value: "natural",
                  label: "Natural",
                  hint: "One job per line. No \u201ceither\u2026 or\u2026\u201d, no neat summings-up. People are allowed to be inarticulate.",
                },
                {
                  value: "unpolished",
                  label: "Unpolished",
                  hint: "Short and blunt. The obvious reply first \u2014 \u201cWho are you.\u201d \u2014 and no one gets the last word.",
                },
              ]}
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
            <ToggleRow
              label="Plain description"
              description="At most one comparison a reply and none in a fast moment, and it stops handing your own imagery and phrasing back to you."
              checked={settings.restrainedProse}
              onChange={(value) => void patch({ restrainedProse: value })}
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
                {([0, 2000, 4000, 8000, 16000, 20000, 25000, 30000, 35000] as const).map((value) => (
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
                      ? `${compiled.split("\n").filter((line) => line.startsWith("- ")).length} rules added to every reply, roughly ${Math.round(compiled.length / 4 / 10) * 10} tokens.`
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
