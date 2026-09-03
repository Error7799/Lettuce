/**
 * World settings — the rules the world runs on, as toggles.
 *
 * This replaces the preset system. A preset was a wall of prompt blocks you
 * had to author or import; most people do not want to write prompt engineering,
 * they want to say "this world is harsh, I have no plot armour, it's medieval,
 * track my inventory" and have the model actually behave that way.
 *
 * Everything here compiles down to prompt text, because prompt text is the only
 * thing a model reads. The value is that the *phrasing* is written once, here,
 * carefully — instead of every user having to discover which wording works.
 *
 * Two principles run through the wording below:
 *
 *   Say what to DO, not what to avoid. "The world continues without you" beats
 *   "don't make everything about the user" — models follow positive instructions
 *   far more reliably than prohibitions.
 *
 *   Neutrality is a stated rule, not an absence. Left alone, models moralise,
 *   soften consequences and steer toward reassurance. An unbiased world has to
 *   be asked for explicitly.
 *
 * Pure module: no storage, no Tauri, no React. Compiling settings to text is
 * testable on its own, which matters because this is the part that decides
 * whether the toggles do anything at all.
 */

/* ── Option types ────────────────────────────────────────────────────────*/

export type Lethality = "safe" | "realistic" | "harsh" | "lethal";
export type PlotArmour = "full" | "some" | "none";
export type Era =
  | "unset"
  | "medieval"
  | "renaissance"
  | "victorian"
  | "modern"
  | "nearFuture"
  | "cyberpunk"
  | "space"
  | "postApocalyptic"
  | "highFantasy";
export type StatTracking = "off" | "light" | "full";
export type WorldFocus = "protagonist" | "balanced" | "indifferent";
export type NarrativeTone = "neutral" | "warm" | "grim";
export type ResponseLength = "brief" | "moderate" | "detailed";
export type Pacing = "fast" | "steady" | "slow";

export interface WorldSettings {
  enabled: boolean;

  /* Danger & consequence */
  lethality: Lethality;
  plotArmour: PlotArmour;
  /** Actions can simply fail, rather than always advancing the story. */
  actionsCanFail: boolean;

  /* Setting */
  era: Era;
  /** Custom era text, used when era is "unset" but this is filled in. */
  eraDetail: string;
  /** Hold technology, language and social norms to the era. */
  enforceEra: boolean;

  /* Stats */
  statTracking: StatTracking;
  trackHealth: boolean;
  trackInventory: boolean;
  trackMoney: boolean;
  trackRelationships: boolean;
  trackTime: boolean;

  /* World focus & agency */
  worldFocus: WorldFocus;
  /** NPCs pursue their own goals and may refuse, leave, or act against you. */
  npcAutonomy: boolean;
  /** Events happen off-screen whether or not you are present. */
  offscreenEvents: boolean;

  /* Neutrality — the "unbiased world" controls */
  /** The narration does not judge, moralise, or editorialise. */
  moralNeutrality: boolean;
  /** No steering toward comfort, reconciliation or happy outcomes. */
  noReassurance: boolean;
  /** Characters only know what they could plausibly know. */
  noOmniscience: boolean;

  /* Craft */
  tone: NarrativeTone;
  responseLength: ResponseLength;
  pacing: Pacing;
  /** Extra instructions appended verbatim. */
  customRules: string;
}

export const DEFAULT_WORLD_SETTINGS: WorldSettings = {
  enabled: false,
  lethality: "realistic",
  plotArmour: "some",
  actionsCanFail: true,
  era: "unset",
  eraDetail: "",
  enforceEra: true,
  statTracking: "off",
  trackHealth: true,
  trackInventory: true,
  trackMoney: false,
  trackRelationships: false,
  trackTime: false,
  worldFocus: "balanced",
  npcAutonomy: true,
  offscreenEvents: false,
  moralNeutrality: true,
  noReassurance: false,
  noOmniscience: true,
  tone: "neutral",
  responseLength: "moderate",
  pacing: "steady",
  customRules: "",
};

/* ── Wording ─────────────────────────────────────────────────────────────*/

const LETHALITY_TEXT: Record<Lethality, string> = {
  safe: "This world is not dangerous. Threats exist as tension and atmosphere, but the user's character is not seriously harmed.",
  realistic:
    "Danger is real and proportionate. A knife wound is serious, a fall from height is grave, and recovery takes time.",
  harsh:
    "This world is unforgiving. Mistakes cost something lasting — injury, resources, trust, opportunity — and those costs persist rather than being undone.",
  lethal:
    "This world can kill. Lethal situations resolve lethally when that is what the situation warrants, without softening, last-second rescue, or narrative reprieve.",
};

const PLOT_ARMOUR_TEXT: Record<PlotArmour, string> = {
  full: "The user's character is protected by the story. They may be threatened but will not be permanently harmed.",
  some: "The user's character can be hurt and can lose things, but survives events that would plausibly be survivable.",
  none: "The user's character has no special protection. They are as vulnerable as anyone else here, and the story does not intervene to save them. If their choices lead somewhere fatal, narrate that outcome honestly.",
};

const ERA_TEXT: Record<Exclude<Era, "unset">, string> = {
  medieval: "a medieval setting — pre-gunpowder, feudal, lit by fire",
  renaissance: "a Renaissance-era setting — early firearms, city-states, patronage and guilds",
  victorian: "a Victorian-era setting — industrial, gaslit, steam and telegraph",
  modern: "the present day",
  nearFuture: "the near future — recognisable, with technology a step beyond today's",
  cyberpunk: "a cyberpunk setting — dense cities, corporate power, cybernetics, pervasive networks",
  space: "a spacefaring setting — ships, stations, and travel between worlds",
  postApocalyptic: "a post-apocalyptic setting — scarcity, ruins, salvage, fragile settlements",
  highFantasy: "a high fantasy setting — magic, non-human peoples, and mythic scale",
};

const FOCUS_TEXT: Record<WorldFocus, string> = {
  protagonist:
    "The story centres on the user's character. Events tend to involve them and matter to them.",
  balanced:
    "The user's character is one significant person among others. The world accommodates them without revolving around them.",
  indifferent:
    "The world does not care about the user's character. It has its own business, and they are one person inside it with no special claim on events.",
};

const TONE_TEXT: Record<NarrativeTone, string> = {
  neutral: "Narrate plainly, without a moral or emotional slant.",
  warm: "Narrate with warmth — find the humane detail, without softening events.",
  grim: "Narrate with a bleak, unsentimental eye.",
};

const LENGTH_TEXT: Record<ResponseLength, string> = {
  brief: "Keep replies short — a few sentences. Leave room for the user to act.",
  moderate: "Keep replies to a moderate length — a paragraph or two.",
  detailed: "Write fuller replies with sensory and situational detail, without padding.",
};

const PACING_TEXT: Record<Pacing, string> = {
  fast: "Move quickly between beats. Skip over uneventful stretches.",
  steady: "Move at a steady pace, matching scene length to what is happening.",
  slow: "Stay close to the moment. Let scenes unfold at their own speed.",
};

/* ── Compilation ─────────────────────────────────────────────────────────*/

export interface WorldSection {
  heading: string;
  lines: string[];
}

function statLines(settings: WorldSettings): string[] {
  if (settings.statTracking === "off") return [];

  const tracked: string[] = [];
  if (settings.trackHealth) tracked.push("physical condition and injuries");
  if (settings.trackInventory) tracked.push("what they are carrying");
  if (settings.trackMoney) tracked.push("money and resources");
  if (settings.trackRelationships) tracked.push("how others regard them");
  if (settings.trackTime) tracked.push("time of day and elapsed time");

  // "full" with nothing ticked would silently do nothing; fall back to the
  // two that make sense in almost any story rather than emit a dead rule.
  const list = tracked.length > 0 ? tracked : ["physical condition and injuries", "what they are carrying"];

  const lines = [`Keep track of the user's character's ${list.join(", ")}.`];
  if (settings.statTracking === "light") {
    lines.push(
      "Reflect these in the narration when they change or matter. Do not print a status block.",
    );
  } else {
    lines.push(
      "End each reply with a short status line covering only what changed, in the form: [Status] item: value, item: value.",
    );
  }
  return lines;
}

function eraLines(settings: WorldSettings): string[] {
  const custom = settings.eraDetail.trim();
  const base =
    settings.era !== "unset"
      ? ERA_TEXT[settings.era]
      : custom
        ? custom
        : null;
  if (!base) return [];

  const lines = [`This story takes place in ${base}.`];
  // A custom detail refines a chosen era rather than being ignored by it.
  if (settings.era !== "unset" && custom) lines.push(custom);
  if (settings.enforceEra) {
    lines.push(
      "Keep technology, language, clothing and social assumptions consistent with this setting. Nothing from a later period appears unless the story has established it.",
    );
  }
  return lines;
}

function neutralityLines(settings: WorldSettings): string[] {
  const lines: string[] = [];
  if (settings.moralNeutrality) {
    lines.push(
      "Present events without judging them. Do not moralise, add a lesson, or signal approval or disapproval through the narration. Characters may hold opinions; the narration does not.",
    );
  }
  if (settings.noReassurance) {
    lines.push(
      "Do not steer toward comfort or resolution. Leave tension unresolved when that is where the scene ends, and do not offer reassurance the situation has not earned.",
    );
  }
  if (settings.noOmniscience) {
    lines.push(
      "Characters know only what they have seen, been told, or could reasonably infer. Never let a character act on information they have no way of having.",
    );
  }
  return lines;
}

/** Build the structured sections. Exposed so the UI can preview them. */
export function compileWorldSections(settings: WorldSettings): WorldSection[] {
  if (!settings.enabled) return [];

  const sections: WorldSection[] = [];
  const push = (heading: string, lines: string[]) => {
    const kept = lines.filter((line) => line.trim());
    if (kept.length > 0) sections.push({ heading, lines: kept });
  };

  push("Setting", eraLines(settings));

  push("Danger and consequence", [
    LETHALITY_TEXT[settings.lethality],
    PLOT_ARMOUR_TEXT[settings.plotArmour],
    settings.actionsCanFail
      ? "Attempted actions can fail. Success is not automatic; let outcomes follow from what is plausible."
      : "",
  ]);

  push("How the world behaves", [
    FOCUS_TEXT[settings.worldFocus],
    settings.npcAutonomy
      ? "Other characters have their own goals and may refuse, argue, leave, or act against the user's interests when that is what they would do."
      : "",
    settings.offscreenEvents
      ? "Events continue elsewhere whether or not the user is present, and the user may return to a changed situation."
      : "",
  ]);

  push("Neutrality", neutralityLines(settings));
  push("Tracking", statLines(settings));

  push("Style", [TONE_TEXT[settings.tone], LENGTH_TEXT[settings.responseLength], PACING_TEXT[settings.pacing]]);

  const custom = settings.customRules.trim();
  if (custom) push("Additional rules", custom.split("\n").map((line) => line.trim()));

  return sections;
}

/**
 * Render the sections as the prompt block the model receives.
 *
 * Headed and bulleted rather than prose: a model asked to hold a dozen
 * simultaneous constraints keeps them far better as a list than as a
 * paragraph, and the headings give each rule a hook to refer back to.
 */
export function compileWorldPrompt(settings: WorldSettings): string {
  const sections = compileWorldSections(settings);
  if (sections.length === 0) return "";

  const body = sections
    .map((section) => [`${section.heading}:`, ...section.lines.map((line) => `- ${line}`)].join("\n"))
    .join("\n\n");

  return ["[World rules — these govern how this world works and override style habits.]", "", body].join("\n");
}

/** True when the settings would actually change the prompt. */
export function hasWorldEffect(settings: WorldSettings): boolean {
  return compileWorldPrompt(settings).length > 0;
}
