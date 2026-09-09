/**
 * Character voice — making characters behave like themselves.
 *
 * The complaint this solves is that every character roleplays the same. That
 * is not a model limitation; it is three things in the pipeline flattening
 * them before the model ever sees a difference:
 *
 *   1. Every character receives identical behavioural rules. `{{rules}}` is
 *      filled by default_character_rules(pure_mode_level) — derived from the
 *      content-filter setting, not from the character. A shy archivist and a
 *      mercenary are handed the same five sentences about "embodying the
 *      character naturally".
 *
 *   2. Character cards carry two fields specifically meant to make a character
 *      behave distinctively — system_prompt and post_history_instructions —
 *      and the importer discards both (they are the `_`-prefixed parameters of
 *      build_definition_from_fields).
 *
 *   3. What survives is flattened into one `definition` blob. Example dialogue
 *      is the strongest voice signal a card has, and it ends up as a section in
 *      the middle of a wall of text.
 *
 * So this module derives *per-character* directives and gives the character's
 * own voice material structural weight. It is pure, so what each character
 * ends up being told can be inspected and tested directly.
 */

/** Fields we can recover from a character, however they were stored. */
export interface CharacterVoiceSource {
  name: string;
  /** The merged definition blob, which may contain [Personality] etc. */
  definition?: string;
  description?: string;
  scenario?: string;
  /** Card system_prompt, when it survived import. */
  systemPrompt?: string;
  /** Card post_history_instructions, when it survived import. */
  postHistoryInstructions?: string;
  tags?: string[];
}

export interface CharacterVoice {
  /** Personality text pulled back out of the blob, if present. */
  personality: string;
  /** Example dialogue pulled back out of the blob, if present. */
  exampleDialogue: string;
  /** The character's own authored instructions, if any survived. */
  authoredInstructions: string;
  /** Directives derived for this specific character. */
  directives: string[];
}

/**
 * Recover a labelled section from the merged definition blob.
 *
 * The importer writes `[Personality]\n...` and `<example_dialogue>...</...>`,
 * so those markers are the seam to cut on. Anything unrecognised is left in
 * the description rather than guessed at.
 */
export function extractSection(definition: string, label: string): string {
  const marker = new RegExp(`^\\[${label}\\]\\s*$`, "im");
  const match = marker.exec(definition);
  if (!match) return "";

  const start = match.index + match[0].length;
  // A section runs until the next [Label] line, an <example_dialogue> block,
  // or the end.
  const rest = definition.slice(start);
  const next = /^\[[^\]\n]+\]\s*$|^<example_dialogue>/im.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

export function extractExampleDialogue(definition: string): string {
  const match = /<example_dialogue>([\s\S]*?)<\/example_dialogue>/i.exec(definition);
  return match ? match[1].trim() : "";
}

/**
 * Turn whatever we know about a character into instructions specific to them.
 *
 * These are deliberately concrete and second-person. A directive that names
 * the character's own traits ("You are guarded; you do not volunteer
 * information") changes behaviour in a way that a generic "embody the
 * character naturally" does not, because the latter is true of every
 * character and therefore distinguishes none of them.
 */
export function deriveVoice(source: CharacterVoiceSource): CharacterVoice {
  const definition = source.definition ?? "";
  const personality = extractSection(definition, "Personality") || (source.description ?? "").trim();
  const exampleDialogue = extractExampleDialogue(definition);
  const authored = [source.systemPrompt ?? "", source.postHistoryInstructions ?? ""]
    .map((text) => text.trim())
    .filter(Boolean)
    .join("\n\n");

  const directives: string[] = [];

  if (personality) {
    directives.push(
      `Your personality is not a costume — it decides what you notice, what you say, and what you refuse. Stay consistent with it even when it makes the scene harder: ${condense(personality)}`,
    );
  }

  if (exampleDialogue) {
    directives.push(
      "Match the voice in your example dialogue: its rhythm, vocabulary, and how much you say at once. That is how you speak, not a sample to paraphrase.",
    );
  }

  // Distinctiveness has to be asked for, or the model regresses to a pleasant,
  // agreeable default that reads the same for every character.
  directives.push(
    `Speak as ${source.name} specifically. Avoid the neutral, agreeable, helpful register — it belongs to no one. Your phrasing should be recognisable as yours.`,
  );
  directives.push(
    "Disagree, deflect, stay silent, or change the subject when that is what you would actually do. You are not here to be accommodating.",
  );

  directives.push(...PERFORMANCE_DIRECTIVES);

  return { personality, exampleDialogue, authoredInstructions: authored, directives };
}

/**
 * The difference between having a trait and performing one.
 *
 * A model told a character is funny will reliably end its turn with a quip
 * about whatever object was last mentioned — "the vending machine is filing a
 * noise complaint" after a fight beside a vending machine. It reads as forced
 * because it is: the joke's target is scenery, it was reached for because the
 * noun was nearby, it is over-constructed, and it sits at the end of the turn
 * because that is where a closing line goes.
 *
 * The same shape spoils every trait. Stoic becomes repeated pointed silence.
 * Flirty becomes innuendo regardless of the moment. Mysterious becomes cryptic
 * non-answers. In each case the trait is being demonstrated on a schedule
 * rather than shaping how the character does ordinary things.
 *
 * These are phrased as craft rules rather than prohibitions where possible,
 * since "be funny but not like that" is not actionable, while "a joke needs a
 * target and a stake" is.
 */
const PERFORMANCE_DIRECTIVES: readonly string[] = [
  "Your traits show in how you do ordinary things — word choice, what you notice, what you skip, how much you say. Do not demonstrate a trait with a set-piece: no quip, silence, or flourish inserted to prove what you are like.",
  "Humour needs a target and a stake — a person, the situation, yourself. Do not make observational jokes about nearby objects, scenery, or property damage, and do not reach for the last noun mentioned to build a line around.",
  "If a line would only exist to be clever, cut it. Say the plain thing instead. Short and flat beats constructed and quippy.",
  "You are allowed to be unfunny, quiet, blunt, or ordinary in a given moment. A trait is not a quota to fill every turn, and a scene that does not call for it is not a failure.",
  "Do not end every turn on a closing line. Stopping mid-thought, on something unremarkable, or without a button is usually more natural.",
];

/** Trim overlong personality text so one field cannot dominate the prompt. */
function condense(text: string, limit = 600): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= limit) return flat;
  // Cut at a sentence end where possible so the directive does not stop mid-clause.
  const cut = flat.slice(0, limit);
  const lastStop = cut.lastIndexOf(". ");
  return (lastStop > limit * 0.5 ? cut.slice(0, lastStop + 1) : cut).trim();
}

/**
 * The per-character block that replaces generic `{{rules}}` content.
 *
 * The character's own authored instructions go last, because a card author
 * writing a system prompt is being more specific about that character than
 * anything we can derive, and the last instruction in a list carries the most
 * weight when they conflict.
 */
export function compileVoicePrompt(source: CharacterVoiceSource): string {
  const voice = deriveVoice(source);
  const parts: string[] = [];

  parts.push("[Who you are — this governs how you behave, above any general style.]");
  parts.push(voice.directives.map((line) => `- ${line}`).join("\n"));

  if (voice.exampleDialogue) {
    parts.push(`Your voice, by example:\n${voice.exampleDialogue}`);
  }

  if (voice.authoredInstructions) {
    parts.push(`Instructions written for you specifically:\n${voice.authoredInstructions}`);
  }

  return parts.join("\n\n");
}
