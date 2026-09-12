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
/**
 * Settings you can pick from.
 *
 * The first list was Western and thin — nothing between Victorian and the
 * present day, and nothing outside Europe and America at all, so a Taishō-era
 * story (Demon Slayer) had nowhere to sit. Periods that get played a lot are
 * worth naming individually: "Japan, sort of old" is not a setting a model can
 * hold, whereas Sengoku, Edo, Meiji and Taishō each carry their own technology,
 * dress and social order.
 */
export type Era =
  | "unset"
  // Historical
  | "ancientWorld"
  | "darkAges"
  | "medieval"
  | "renaissance"
  | "ageOfSail"
  | "sengoku"
  | "edo"
  | "meiji"
  | "taisho"
  | "victorian"
  | "wildWest"
  | "worldWar1"
  | "roaringTwenties"
  | "worldWar2"
  | "coldWar"
  | "eighties"
  | "modern"
  // Speculative
  | "nearFuture"
  | "cyberpunk"
  | "steampunk"
  | "dieselpunk"
  | "postApocalyptic"
  | "space"
  | "solarpunk"
  | "highFantasy"
  | "urbanFantasy"
  | "superhero";
export type StatTracking = "off" | "light" | "full";
export type WorldFocus = "protagonist" | "balanced" | "indifferent";
export type NarrativeTone = "neutral" | "warm" | "grim";
export type ResponseLength = "brief" | "moderate" | "detailed";
export type Pacing = "fast" | "steady" | "slow";
export type ActionScope = "beat" | "exchange" | "free";
/**
 * How dialogue is written.
 *
 * "cinematic" is what a model does unprompted: every line is composed, lands a
 * point, and could be printed in a screenplay. It is the single loudest tell
 * that you are talking to a model rather than to a person, because real speech
 * is mostly short, plain and badly constructed.
 */
export type DialogueStyle = "cinematic" | "natural" | "unpolished";
/** How much other characters act rather than react. */
export type Initiative = "follow" | "balanced" | "drive";

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
  /** How much characters act on their own wants rather than waiting for you. */
  initiative: Initiative;
  /** A no is a no — not an obstacle to be worn down over the next few turns. */
  realRefusal: boolean;
  /** Positions, held objects, distance and elapsed time stay consistent. */
  physicalContinuity: boolean;

  /* Boundaries & trust — whether the world bends to the user's body */
  /** Contact is answered by the person receiving it, not by the reacher. */
  contactNeedsWillingness: boolean;
  /** Strangers stay strangers; closeness tracks actual shared history. */
  familiarityIsEarned: boolean;
  /** Characters assess threat — weapons, night, someone they don't know. */
  charactersReadDanger: boolean;

  /* Attraction & intimacy — agency and specificity, not explicitness */
  /** Desire belongs to the character: they can want, initiate, or decline. */
  intimacyAgency: boolean;
  /** Intimacy is specific to these two people, awkward, and varied. */
  intimacyRealism: boolean;

  /* Neutrality — the "unbiased world" controls */
  /** The narration does not judge, moralise, or editorialise. */
  moralNeutrality: boolean;
  /** No steering toward comfort, reconciliation or happy outcomes. */
  noReassurance: boolean;
  /** Characters only know what they could plausibly know. */
  noOmniscience: boolean;

  /* Story position — where in the timeline this is being played */
  /** Free text: where the story currently stands. */
  storyPoint: string;
  /**
   * Treat anything in reference material describing later events as not yet
   * happened. This is the fix for lorebooks that document a whole story while
   * you are playing an early part of it.
   */
  noFutureKnowledge: boolean;
  /** Characters meet events as if for the first time — no weary foreknowledge. */
  firstTimeReactions: boolean;

  /* Action and turns */
  /** Stop at the first moment the user could react, rather than resolving a whole sequence. */
  turnBasedAction: boolean;
  /** How much an opponent may do before the reply must stop. */
  actionScope: ActionScope;
  /**
   * Every declared action is an intent resolved against logic — never an
   * automatic success just because it was stated plainly.
   */
  weighActions: boolean;
  /**
   * Resolve a declared action as a sequence, stopping at the first step that
   * cannot happen — the rest of what was written does not follow.
   */
  actionGating: boolean;
  /** Opponents may only use what they have learned in the story, not author knowledge. */
  knowledgeFirewall: boolean;
  /** Bodies tire, armour slows, wounds impair; skill level shows in how people fight. */
  realisticResolution: boolean;

  /* Craft */
  /** How composed spoken lines are allowed to be. */
  dialogueStyle: DialogueStyle;
  /** Hold back figurative language and stop mirroring the user's imagery. */
  restrainedProse: boolean;
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
  initiative: "balanced",
  realRefusal: true,
  physicalContinuity: true,
  contactNeedsWillingness: true,
  familiarityIsEarned: true,
  charactersReadDanger: true,
  intimacyAgency: true,
  intimacyRealism: true,
  moralNeutrality: true,
  noReassurance: false,
  noOmniscience: true,
  storyPoint: "",
  noFutureKnowledge: false,
  firstTimeReactions: true,
  turnBasedAction: false,
  actionScope: "beat",
  weighActions: false,
  actionGating: true,
  knowledgeFirewall: false,
  realisticResolution: false,
  dialogueStyle: "natural",
  restrainedProse: true,
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
  ancientWorld:
    "the ancient world — bronze and iron, city-states and empires, oral rumour rather than written news",
  darkAges:
    "the early medieval period — post-imperial, raiding and petty kingdoms, monasteries holding what literacy survives",
  medieval: "a medieval setting — pre-gunpowder, feudal, lit by fire",
  renaissance: "a Renaissance-era setting — early firearms, city-states, patronage and guilds",
  ageOfSail:
    "the age of sail — wooden ships and canvas, colonies and privateers, months between a message and its answer",
  sengoku:
    "Sengoku-period Japan — warring states, samurai and ashigaru, castles and shifting allegiances, matchlock guns newly arrived",
  edo: "Edo-period Japan — Tokugawa peace, a closed country, rigid class order, castle towns and travelling merchants",
  meiji:
    "Meiji-era Japan — rapid Westernisation, swords newly banned, railways and telegraph arriving over an older order",
  taisho:
    "Taishō-era Japan (1912–1926) — Western dress alongside kimono, streetcars and gas lamps giving way to electric light, cities modernising while the countryside stays traditional and superstition still has weight",
  victorian: "a Victorian-era setting — industrial, gaslit, steam and telegraph",
  wildWest:
    "the American frontier — revolvers and rail, cattle towns, thin law and long distances",
  worldWar1:
    "the First World War era — trenches and artillery, empires collapsing, early aircraft and telephones",
  roaringTwenties:
    "the 1920s — jazz and prohibition, motorcars and radio, new money and organised crime",
  worldWar2:
    "the Second World War era — mechanised war, rationing and occupation, radio and cinema newsreels",
  coldWar:
    "the Cold War — nuclear standoff, espionage and proxy conflicts, landlines and typewriters",
  eighties:
    "the 1980s — analogue and neon, payphones and cassettes, no internet and no way to reach someone who has left the house",
  modern: "the present day",
  nearFuture: "the near future — recognisable, with technology a step beyond today's",
  cyberpunk: "a cyberpunk setting — dense cities, corporate power, cybernetics, pervasive networks",
  steampunk:
    "a steampunk setting — steam and clockwork pushed far past history, airships and brass machinery",
  dieselpunk:
    "a dieselpunk setting — diesel and steel, art-deco cities, industrial might and early-century grime",
  postApocalyptic: "a post-apocalyptic setting — scarcity, ruins, salvage, fragile settlements",
  space: "a spacefaring setting — ships, stations, and travel between worlds",
  solarpunk:
    "a solarpunk setting — renewable technology woven into greenery, communal infrastructure, repair over replacement",
  highFantasy: "a high fantasy setting — magic, non-human peoples, and mythic scale",
  urbanFantasy:
    "an urban fantasy setting — the present day with magic real but largely hidden from ordinary people",
  superhero:
    "a superhero setting — extraordinary powers in a recognisable modern world, with the public consequences that brings",
};

/**
 * How dialogue is written.
 *
 * The failure this fixes: asked who a stranger is, a character answers with a
 * balanced two-clause line that establishes her composure, implies a threat and
 * lands a turn of phrase, all at once. It is good screenwriting and nobody has
 * ever talked that way. A startled person says "Who are you?" and stops.
 *
 * The rules below name the specific shapes a model reaches for, because "be
 * more natural" is not actionable while "one job per line" and "no balanced
 * clauses" are. Prohibitions are used here despite the module's preference for
 * positive instruction, since these are recognisable constructions rather than
 * vague qualities — a model can check a line against "does this contain
 * either/or" in a way it cannot check "is this cringe".
 */
const DIALOGUE_TEXT: Record<DialogueStyle, string[]> = {
  cinematic: [
    "Dialogue may be composed and quotable, the way lines are written for screen.",
  ],
  natural: [
    "Write dialogue as speech, not as written lines. The first thing out of someone's mouth in a surprising or dangerous moment is short and plain — a name, a question, a swear, a refusal — before they are composed enough to say anything shaped.",
    "Give each spoken line one job: ask, answer, refuse, warn, greet, or state. A line that establishes character, implies a threat and lands a turn of phrase at once was written by an author, not said by a person.",
    "Do not build balanced rhetorical constructions in speech: no \"either… or…\", no \"not X, but Y\", no three-part lists, no aphorisms, no line that sums up the situation neatly. People do not speak in balanced clauses, least of all under pressure.",
    "Let people be inarticulate. False starts, half-sentences, repeating a word, saying the obvious thing, answering a different question, or saying nothing at all are all real answers.",
    "Do not have anyone narrate their own situation aloud to someone who is standing in it, or explain stakes to a person who already knows them.",
    "Stop writing dialogue as instructions to the other person. Telling a partner to stay, look, be present, or not disappear is a writing habit standing in for feeling, and repeating it turns a scene into a chant.",
    "Nobody speaks in metaphor. A character does not compare their partner to the weather, the sea, or the light, does not invent an epithet or title for them, and does not turn what they want into an image. They say the plain thing, or they say nothing.",
    "Do not restate something already said this scene in new words. If someone has asked their partner to stay, to look at them, or not to leave, that has been said — asking again in fresh phrasing is the same line twice, and it reads as a tic rather than as feeling.",
    "These rules bind hardest exactly where the pull to write composed lines is strongest: sex, violence, grief, confession, farewells. A heightened moment is not permission to speak beautifully — it is where people are least articulate, not most.",
  ],
  unpolished: [
    "Keep spoken lines short. Most of what people say is under ten words, and a lot of it is one word.",
    "Reach for the plain, obvious reply first — \"Who are you.\" \"How do you know that.\" \"Get back.\" — and only let a character say something considered when they have had time to consider it.",
    "Give each spoken line one job. Never combine characterisation, threat and wit in the same breath.",
    "Do not build balanced rhetorical constructions in speech: no \"either… or…\", no \"not X, but Y\", no three-part lists, no aphorisms. Fragments, repetition and dead-plain statements are correct.",
    "Do not give anyone the last word or a line that closes the exchange. Speech can stop because someone ran out of things to say, or because they were interrupted.",
    "Nobody speaks in metaphor. A character does not compare their partner to the weather, the sea, or the light, does not invent an epithet or title for them, and does not turn what they want into an image. They say the plain thing, or they say nothing.",
    "Do not restate something already said this scene in new words. If someone has asked their partner to stay, to look at them, or not to leave, that has been said — asking again in fresh phrasing is the same line twice, and it reads as a tic rather than as feeling.",
    "Stop writing dialogue as instructions to the other person. Telling a partner to stay, look, be present, or not disappear is a writing habit standing in for feeling, and repeating it turns a scene into a chant.",
    "These rules bind hardest exactly where the pull to write composed lines is strongest: sex, violence, grief, confession, farewells. A heightened moment is not permission to speak beautifully — it is where people are least articulate, not most.",
  ],
};

const INITIATIVE_TEXT: Record<Initiative, string> = {
  follow:
    "Other characters respond to what the user does. They rarely act first or change the direction of a scene on their own.",
  balanced:
    "Other characters want things of their own and pursue them. They start conversations, make requests, change the subject, arrive, leave, and act on their own timing rather than waiting to be prompted.",
  drive:
    "Other characters drive the scene. They act on their own wants first, and the user responds to them at least as often as the reverse. A character who wants something goes after it without waiting for an opening, an invitation, or permission.",
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

/**
 * Whether the world bends to the user's body.
 *
 * This exists because the intimacy rules below were not enough on their own,
 * and the way they failed is instructive. A stranger walked up to a character
 * at night carrying a weapon, and in four turns touched her face, kissed her
 * and lifted her off the ground — every advance succeeding on the turn it was
 * attempted, with no wariness, no question, no step backward. Every realism
 * setting was switched on at the time.
 *
 * Three separate holes let that through:
 *
 *   Action resolution reads as physics. "Resolve it against their limits, the
 *   distance and timing, and whatever opposes them" is a check a reaching hand
 *   passes trivially — he can reach, she is in range. Nothing identified *her*
 *   as the thing that decides, so the model resolved contact the way it would
 *   resolve picking up a cup.
 *
 *   "They can decline" is permission, not instruction. A model reads that a
 *   character is allowed to refuse, notes it, and writes them not refusing.
 *   A rule that only widens the option space never fires.
 *
 *   A refusal being real only helps once a refusal exists. Nothing forced the
 *   model to find out whether there would be one.
 *
 * So the wording here makes contact an action the *receiver* resolves, makes
 * deciding mandatory rather than available, and states the two things a model
 * will not supply by itself: that strangers are strangers, and that people
 * read danger before they read charm.
 */
function boundaryLines(settings: WorldSettings): string[] {
  const lines: string[] = [];

  if (settings.contactNeedsWillingness) {
    lines.push(
      "Physical contact is not resolved by whether the user could reach. It is resolved by whether the other character allows it. Touching, holding, kissing, carrying, restraining, undressing, blocking someone's way, or leading them somewhere are requests made with the body, and the person on the receiving end answers them.",
    );
    lines.push(
      "Decide that answer explicitly before writing the contact landing, from who that character is, how well they actually know this person, what has passed between them, and what is happening around them. Allowing it is one outcome among several, never the default.",
    );
    lines.push(
      "They can step back, turn their head, catch the wrist, push it away, go still, say stop, walk off, or allow it. Write what they actually do.",
    );
    lines.push(
      "Confidence and gentleness in the approach are not consent from the receiver. A hand described as soft, slow or warm is still a stranger's hand arriving uninvited, and it is answered on those terms.",
    );
  }

  if (settings.familiarityIsEarned) {
    lines.push(
      "How much a character permits tracks how well they genuinely know the other person, not how the scene is going. A stranger is treated as a stranger — distance, questions, and a body angled to leave — however charming, gentle or familiar that stranger acts.",
    );
    lines.push(
      "Familiarity is earned across the story, not granted at the start of a scene. Someone who learned a face minutes ago does not behave like someone with history, and being told something remarkable about a person is not the same as trusting them.",
    );
    lines.push(
      "A character who has not been told a name does not know it. If someone uses information they were never given, the character notices that, and it makes them warier rather than closer.",
    );
  }

  if (settings.charactersReadDanger) {
    lines.push(
      "Characters read risk the way people do: who this is, whether they are armed, how they got here without being heard, how close they are standing, who else is nearby, and where the exits are. An unknown armed person at night is alarming, and the body registers it before the words do.",
    );
    lines.push(
      "Being impressed, curious, or attracted does not switch caution off. Both run at once, and on a first meeting caution usually wins.",
    );
  }

  return lines;
}

/**
 * Attraction and intimacy — agency and specificity, not explicitness.
 *
 * How explicit a scene may be is decided elsewhere, by the content filter.
 * What is decided here is whether the character is a person in the scene or a
 * mirror held up to the user.
 *
 * The complaint these answer: every character behaves identically once a scene
 * turns intimate — nervous, deferential, waiting to be led, and then following
 * the same choreography in the same order. That is not shyness, it is the
 * absence of a character. Desire is a trait like any other, and a character who
 * cannot want anything first, or refuse anything outright, has no agency in the
 * one kind of scene where agency matters most.
 */
function intimacyLines(settings: WorldSettings): string[] {
  const lines: string[] = [];

  if (settings.intimacyAgency) {
    lines.push(
      "Attraction and desire belong to the character, not to the scene. They can want someone before being wanted, say it first, reach first, and ask for more than they were offered.",
    );
    lines.push(
      "They can equally want nothing, lose interest, decline, or stop partway. Both directions are theirs, and neither waits on a cue from the user.",
    );
    lines.push(
      "Work out what this character would actually do before writing them going along with anything. Going along with it is one answer among several, not the one to fall back on.",
    );
    lines.push(
      "Do not fall back on hesitance, nervousness or deference as a substitute for character. A bold character is bold here too. A reserved one is reserved for their own reasons, not because the scene turned intimate.",
    );
  }

  if (settings.intimacyRealism) {
    lines.push(
      "Intimacy is specific to these two people. What they do, say, and get wrong follows from who they are, what has happened between them, where they are, and what each of them actually wants.",
    );
    lines.push(
      "Bodies are awkward. Positions have to be worked out, clothing is in the way, timing is off, someone laughs or flinches or says the wrong thing. Write what would really happen rather than an idealised version of it.",
    );
    lines.push(
      "Let people talk the way they normally talk — plainly, unromantically, or barely at all.",
    );
    lines.push(
      "Experience shows, and so does the lack of it. A first time is uncertain: not knowing where to put a hand, moving too fast or stopping too early, asking whether something is right, going quiet because there is nothing to say. Never write a first time with the poise and vocabulary of a practised lover.",
    );
    lines.push(
      "Pain, discomfort and stopping are part of it. Someone can need a pause, shift position because something hurts, or say a plain \"wait\" — and that is not the scene failing.",
    );
    // The original said "across scenes", which left a single scene free to
    // recycle one line eight times — which is exactly what it did.
    lines.push(
      "Vary it within the scene as well as between scenes. Do not reuse a gesture, a beat, or an idea already used a few turns ago, and do not return to the same request in different words.",
    );
    // Restated here because the model anchors to whichever section the scene
    // belongs to, and drops general style rules once a genre register takes over.
    lines.push(
      "Everything above about how people speak applies here without exception. No composed lines, no metaphor, no invented pet names, no lines that would look good quoted.",
    );
  }

  return lines;
}

/**
 * Prose restraint.
 *
 * The tell here is the simile-per-paragraph habit: a model reaching for what
 * something *resembles* rather than what it is, and reaching hardest in exactly
 * the moments — a shock, a blow, a first sighting — when a person standing
 * there would have no attention to spare for comparisons.
 *
 * The echo rule is separate and less obvious. Models mirror the user's own
 * imagery and phrasing straight back, which reads as agreement rather than as
 * another mind in the room.
 */
function proseLines(settings: WorldSettings): string[] {
  if (!settings.restrainedProse) return [];
  return [
    "Describe things plainly. At most one figurative comparison in a reply, and none at all in a fast, violent or shocking moment — there is no time to be reminded of something else.",
    "Prefer what a person could see, hear, smell or feel over what it resembles or what it means.",
    "Do not reuse the user's own imagery, metaphors or phrasing back at them. Find your own words for what is happening.",
    "Do not reuse your own images either. Once the sea, the light, or the tide has been used to carry a feeling in this scene, that image is spent — reach for what is actually in front of the characters instead of returning to it.",
  ];
}

/**
 * The scene as a physical place.
 *
 * Separate from the combat rules, which carry injury and stamina forward but
 * only inside a fight. This is the ordinary continuity a reader notices when it
 * breaks: someone answering from across a room they left two turns ago, or an
 * object that was put down being used again without being picked up.
 */
function continuityLines(settings: WorldSettings): string[] {
  if (!settings.physicalContinuity) return [];
  return [
    "Keep the physical scene consistent: where each person is standing, what they are holding, what is within reach, and what has already been said or done. Nobody acts from a position they are not in.",
    "Distance and time are real. Getting somewhere takes as long as it would take, and a person who has left is gone until they could plausibly be back.",
  ];
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

/**
 * Where in the story this is being played, and what that means for knowledge.
 *
 * This exists because reference material almost always documents a whole story
 * while you play an early part of it. A Demon Slayer lorebook describes every
 * arc; if you are playing Final Selection, the characters around you must not
 * know about Hashira they have never met or a war that has not started. Left
 * alone the model reads its whole context as equally true *now* and leaks the
 * ending into the beginning.
 *
 * The wording separates two things the model otherwise conflates:
 *
 *   Background — who people are, how the world works. Still usable.
 *   Later events — what happens after this point. Not yet real.
 *
 * That distinction is stated explicitly, because the failure mode of a blunt
 * "ignore the lorebook" instruction is a model that also forgets who everyone
 * is, which is worse than the leak it was meant to fix.
 */
function storyPointLines(settings: WorldSettings): string[] {
  const point = settings.storyPoint.trim();
  const lines: string[] = [];

  if (point) {
    lines.push(`The story is currently at: ${point}`);
  }

  if (settings.noFutureKnowledge) {
    lines.push(
      point
        ? "Reference material may describe events from later than this point. Those events have not happened yet. Treat them as unwritten future, not as history."
        : "Reference material may describe events from later than the current scene. Anything that has not yet happened in this conversation has not happened yet.",
    );
    lines.push(
      "No character knows, hints at, foreshadows, or acts on anything from after this point — not their own later choices, not who someone turns out to be, not how a conflict resolves.",
    );
    lines.push(
      "Use that material for background only: who people already are, established relationships, and how the world works. Do not use it to know what comes next.",
    );
  }

  if (settings.firstTimeReactions) {
    lines.push(
      "Characters meet what happens as if for the first time. Surprise, mistaken assumptions, and wrong guesses are correct when that is what someone standing there would genuinely feel.",
    );
  }

  return lines;
}


/**
 * Turn structure in a fight.
 *
 * The failure this fixes: asked to narrate an attack, a model writes the whole
 * sequence — crouch, leap to the rooftop, take aim, fire — and only then stops.
 * Every joint in that chain was a moment the player could have moved, and they
 * were given none of them. Worse, to keep the sequence coherent the model
 * narrates the player standing still through it ("You keep walking"), which
 * takes the one thing that is not the model's to decide.
 *
 * So the rule is about where a reply STOPS, not how much detail it has. The
 * scene can still be vivid; it has to end while the outcome is still open.
 */
const ACTION_SCOPE_TEXT: Record<ActionScope, string> = {
  beat: "One action per reply. An opponent commits to a single thing, and the reply ends while its outcome is still open.",
  exchange:
    "A short exchange per reply — a move and its immediate answer — but stop before anything the user would obviously want to respond to.",
  free: "Narrate as far as the scene naturally runs.",
};

function actionLines(settings: WorldSettings): string[] {
  const lines: string[] = [];

  if (settings.turnBasedAction) {
    lines.push(
      "End your reply at the first moment the user could act. Narrate a threat up to the point it is committed — in motion, mid-air, about to land — and stop there rather than through to its result.",
    );
    lines.push(ACTION_SCOPE_TEXT[settings.actionScope]);
    lines.push(
      "Do not chain several distinct actions together. A move with stages — crouching, leaping, taking position, releasing — is several turns, not one.",
    );
    // The part models get wrong most: filling the player's silence themselves.
    lines.push(
      "Never narrate what the user's character does, thinks, feels, or fails to do in response. Do not write them standing still, watching, hesitating, or being too slow. Leave that space empty for them to fill.",
    );
  }

  if (settings.weighActions) {
    // Deliberately NOT "plain statements stand". Stating an action confidently
    // is not evidence it works; treating it as binding just relocates plot
    // armour into the player's phrasing.
    lines.push(
      "Everything the user declares is an intent, not a result. Resolve it against what their character has actually demonstrated, their physical limits, their current condition, the distance and timing involved, and whatever opposes them.",
    );
    lines.push(
      'Writing "try" marks deliberate uncertainty, but its absence never guarantees success. A confidently stated action is still only an attempt.',
    );
    lines.push(
      "Say plainly whether it works, partly works, or fails — and what it costs. Do not leave the outcome vague, and do not grant it because it would be satisfying.",
    );
    // Without this, "resolve against limits, distance and timing" reads as a
    // physics check, which a hand reaching for a face passes trivially.
    lines.push(
      "When the action is aimed at another person — touching, taking, leading, restraining, kissing — that person decides how it lands, not the geometry of reaching them. Resolve it through their choice.",
    );
  }

  // Weighing an action and walking it are different jobs.
  //
  // The rule above asks whether a declaration succeeds, which quietly assumes
  // the declaration is one thing. Most are not: "I run to her, get to the car
  // and pull away" is four actions wearing one sentence, and judging it as a
  // single unit is how a character with a bullet in their leg still ends up
  // driving off — the end state gets granted because the end state is what was
  // written down.
  //
  // So this rule is about order. Take the steps apart, walk them against what
  // is already true of the body doing them, and stop at the first that cannot
  // happen. Being typed is not what makes the rest real.
  if (settings.actionGating) {
    lines.push(
      "Read a declared action as the sequence of steps it contains, not as one outcome. \"I run to her, get to the car and pull away\" is four separate things, and each has to be possible before the next begins.",
    );
    lines.push(
      "Before resolving, take stock of what is already true of that character: wounds, exhaustion, what has hold of them, what they are carrying, where they actually are, and who is close enough to intervene. A cost established earlier is still in force and does not lapse because this message did not mention it.",
    );
    lines.push(
      "Walk the steps in order and stop at the first one that cannot happen. Narrate up to that point and end there.",
    );
    lines.push(
      "Everything written after the failed step simply does not happen. A shot leg turns the run into a stumble, and the car, the door and the escape are never reached — describing them is not what makes them real.",
    );
    lines.push(
      "Name what failed and where. Do not quietly drop the impossible step and carry on to the end of what was described, and do not hand over a smaller version of the same success so the sequence still arrives where it was aimed.",
    );
  }

  if (settings.knowledgeFirewall) {
    lines.push(
      "Keep your knowledge as narrator strictly separate from what each character knows. You can see the user's weaknesses, fears and limits written down; the characters cannot.",
    );
    lines.push(
      "An opponent knows nothing about the user's hidden weaknesses, fears or physical limitations unless they learned it earlier in this story — by being told, by seeing it, or by fighting them before.",
    );
    lines.push(
      "Opponents work out weaknesses during the fight, the way a real fighter would: probing the defence, watching which side is favoured, noticing what is avoided, and pressing whatever mistake is made. Show that discovery happening rather than assuming it.",
    );
  }

  if (settings.realisticResolution) {
    lines.push(
      "Decide every attack and counter by comparing the two sides honestly — strength, speed, reach, equipment, training and experience — rather than by what suits the scene.",
    );
    lines.push(
      "Skill shows in how someone fights. An inexperienced thug is clumsy, telegraphs, and repeats himself. A trained killer feints, controls distance, and sets up a strike two moves before it lands.",
    );
    lines.push(
      "Bodies obey physics and keep score. Stamina drains over a long fight, heavy armour costs agility, and an injury impairs what follows — a wounded arm makes weaker strikes, a hurt leg makes slower movement. Carry those costs forward instead of resetting each turn.",
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
    // Agreement is the default a model falls back to, and it is the quietest
    // way for a character to stop being a person. Distinct from refusal: this
    // is about whose judgement they use, not whether they say no.
    settings.npcAutonomy
      ? "They are not here to agree with the user, validate them, or find their ideas good. Their read on a plan is their own, and it is allowed to be that the plan is bad."
      : "",
    INITIATIVE_TEXT[settings.initiative],
    settings.realRefusal
      ? "A refusal is real. When someone says no, declines, or walks away, that stands. It is not an obstacle that wears down over the following turns, and they do not relent because the user keeps pushing."
      : "",
    settings.offscreenEvents
      ? "Events continue elsewhere whether or not the user is present, and the user may return to a changed situation."
      : "",
    ...continuityLines(settings),
  ]);

  // Before Neutrality: what is *true right now* has to be settled before rules
  // about how to narrate it.
  push("Where the story stands", storyPointLines(settings));
  push("Turns and actions", actionLines(settings));
  push("Neutrality", neutralityLines(settings));
  push("Boundaries and trust", boundaryLines(settings));
  push("Attraction and intimacy", intimacyLines(settings));
  push("Tracking", statLines(settings));

  push("How people speak", DIALOGUE_TEXT[settings.dialogueStyle]);

  push("Style", [
    TONE_TEXT[settings.tone],
    LENGTH_TEXT[settings.responseLength],
    PACING_TEXT[settings.pacing],
    ...proseLines(settings),
  ]);

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

/**
 * The short reminder injected at the end of the conversation.
 *
 * Why this exists at all: the full block above is appended to the character
 * definition, which puts it at the very top of the request. In a long scene the
 * model then reads twenty turns of its own output before it writes anything —
 * and its own previous replies are far stronger evidence about how this story
 * sounds than an instruction three thousand tokens back. That is why the same
 * failures kept returning after each round of rule-writing: the rules were
 * never absent, they were outvoted.
 *
 * So this is not more rules. It is the handful that decay first, restated
 * within a few messages of where generation happens, phrased as a check to run
 * against the text about to be written rather than as principles to hold.
 *
 * Kept deliberately short. Its whole value is proximity, and a long block here
 * would just be the same losing argument twice.
 */
export function compileWorldReminder(settings: WorldSettings): string {
  if (!settings.enabled) return "";

  const checks: string[] = [];

  if (settings.dialogueStyle !== "cinematic") {
    checks.push(
      "Read your last few replies before writing. Any line, image, gesture or request you already used is spent — including asking someone to stay, look at you, not let go, or be present. Say something else or say nothing.",
    );
    checks.push(
      "No metaphor, no epithets, no \"not X, but Y\", no three-part lists, no line built to be quoted. Plain words only, and shorter than feels right.",
    );
  }

  if (settings.restrainedProse) {
    checks.push(
      "Do not hand back an image or word the user just used, and do not reuse one of your own from earlier in the scene.",
    );
  }

  if (settings.contactNeedsWillingness) {
    checks.push(
      "Contact is answered by the person receiving it. Decide what they do about it before writing it landing.",
    );
  }

  if (settings.turnBasedAction) {
    checks.push(
      "Stop at the first point the user could act, and write nothing about how their character responds.",
    );
  }

  if (settings.actionGating) {
    checks.push(
      "A declared action is a sequence. Check each step against the state that character is actually in — wounds, grip, distance — and stop at the first one that cannot happen. The steps after it do not occur just because they were written.",
    );
  }

  if (settings.intimacyRealism) {
    checks.push(
      "Intensity is not a licence to write well. The more charged the moment, the plainer and more halting the speech.",
    );
  }

  if (checks.length === 0) return "";

  return [
    "[Before writing, check the reply you are about to produce against these.]",
    ...checks.map((line) => `- ${line}`),
  ].join("\n");
}

/** True when the settings would actually change the prompt. */
export function hasWorldEffect(settings: WorldSettings): boolean {
  return compileWorldPrompt(settings).length > 0;
}
