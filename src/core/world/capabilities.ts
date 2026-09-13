/**
 * What your character can actually do.
 *
 * The world rules ask the model to resolve actions "against what their
 * character has actually demonstrated, their physical limits, their current
 * condition" — and then hand it nothing to check. A persona is one free-text
 * description, so the model infers ability from vibes, which is why a declared
 * action either always works or fails arbitrarily. Neither is the game.
 *
 * This gives those rules something concrete. It is deliberately not a stat
 * block with numbers: numbers invite arithmetic the model cannot do
 * consistently, and "Strength 14" means nothing without a system behind it.
 * Instead it is short factual statements — what you are good at, what you
 * cannot do, what you are carrying, what is currently wrong with you — which
 * is exactly the shape a language model can reason over.
 *
 * The last field matters most in practice: limits. Models are far better at
 * respecting a stated impossibility than at inferring one.
 */

export interface PersonaCapabilities {
  /** Trained or proven skills. One per line. */
  skills: string;
  /** Things this character genuinely cannot do. One per line. */
  limits: string;
  /** Carried equipment that plausibly changes outcomes. */
  equipment: string;
  /** Standing physical state — old injuries, conditions, fitness. */
  condition: string;
  /** Anything else that should weigh on what succeeds. */
  notes: string;
}

export const EMPTY_CAPABILITIES: PersonaCapabilities = {
  skills: "",
  limits: "",
  equipment: "",
  condition: "",
  notes: "",
};

/** Split a textarea into clean lines, dropping bullets people paste in. */
function lines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean);
}

export function hasCapabilities(capabilities: PersonaCapabilities): boolean {
  return Object.values(capabilities).some((value) => value.trim().length > 0);
}

/**
 * Render the sheet as the block appended to the persona description.
 *
 * Limits are stated last and in absolute terms, because a list that ends on
 * what is possible reads as an invitation. The closing instruction ties the
 * sheet back to resolution explicitly — without it the model treats the block
 * as flavour text and carries on granting whatever was written.
 */
export function compileCapabilities(capabilities: PersonaCapabilities): string {
  const sections: string[] = [];

  const skills = lines(capabilities.skills);
  if (skills.length > 0) {
    sections.push(`Can do:\n${skills.map((item) => `- ${item}`).join("\n")}`);
  }

  const equipment = lines(capabilities.equipment);
  if (equipment.length > 0) {
    sections.push(`Carrying:\n${equipment.map((item) => `- ${item}`).join("\n")}`);
  }

  const condition = lines(capabilities.condition);
  if (condition.length > 0) {
    sections.push(`Physical state:\n${condition.map((item) => `- ${item}`).join("\n")}`);
  }

  const notes = lines(capabilities.notes);
  if (notes.length > 0) {
    sections.push(notes.map((item) => `- ${item}`).join("\n"));
  }

  const limits = lines(capabilities.limits);
  if (limits.length > 0) {
    sections.push(`Cannot do — these are absolute:\n${limits.map((item) => `- ${item}`).join("\n")}`);
  }

  if (sections.length === 0) return "";

  return [
    "[What this character can actually do. Resolve their attempted actions against this, not against what the writing sounds confident about.]",
    "",
    sections.join("\n\n"),
    "",
    "An action outside this sheet fails, or succeeds only partly and at a cost. Say which.",
  ].join("\n");
}

/* ── Suggestions ─────────────────────────────────────────────────────────
 * A blank sheet is hard to start. These are shapes rather than content — the
 * point is to show the level of specificity that works, since "strong" is
 * useless to a model and "can carry a grown adult at a jog" is not.
 * ---------------------------------------------------------------------- */

export interface CapabilityExample {
  id: string;
  label: string;
  capabilities: PersonaCapabilities;
}

export const CAPABILITY_EXAMPLES: readonly CapabilityExample[] = [
  {
    id: "ordinary",
    label: "Ordinary person",
    capabilities: {
      skills: "Drives competently\nTalks their way out of most trouble\nDecent memory for faces",
      limits:
        "No combat training at all\nCannot fight an armed person and win\nPanics under real threat",
      equipment: "Phone, wallet, keys",
      condition: "Reasonably fit, tires after a few minutes of hard effort",
      notes: "",
    },
  },
  {
    id: "fighter",
    label: "Trained fighter",
    capabilities: {
      skills:
        "Years of hand-to-hand training\nReads an opponent's stance and intent\nComfortable with a blade\nKeeps working while hurt",
      limits:
        "Cannot beat several armed opponents at once\nNo ranged skill\nCannot outrun a vehicle",
      equipment: "A knife, worn where it can be reached quickly",
      condition: "Old shoulder injury — overhead reach on the right is weak",
      notes: "Fights to end things fast rather than to look impressive",
    },
  },
  {
    id: "powered",
    label: "Supernatural",
    capabilities: {
      skills: "Can deflect incoming force away from their body\nSenses when a technique is used nearby",
      limits:
        "The deflection needs a gap — contact already made cannot be undone\nUsing it heavily causes headaches and then nosebleeds\nCannot affect anything they cannot see",
      equipment: "",
      condition: "Untrained, running on instinct — no formal technique",
      notes: "Does not know the proper names for anything they can do",
    },
  },
];
