/**
 * Regex rules — SillyTavern's find/replace scripts, running inside LettuceAI.
 *
 * A rule rewrites text on its way past: what you typed, what the model wrote,
 * matched lorebook content, or a reasoning block. SillyTavern ships these as
 * standalone scripts; here they travel *inside a preset*, so importing someone
 * else's setup brings their cleanup rules with it.
 *
 * Two flags decide where a rule bites, and they are easy to get backwards:
 *
 *   markdownOnly  rewrite only what is *shown*. The model still sees the
 *                 original — good for hiding scaffolding from yourself.
 *   promptOnly    rewrite only what is *sent*. You still see the original —
 *                 good for stripping things the model shouldn't read back.
 *
 * Neither flag set means the rule applies to both.
 *
 * This module is pure, so it can be tested without the Tauri runtime.
 */

import type { RegexPlacement, RegexRule } from "../storage/schemas";

/** Which text a rule is being asked to rewrite. */
export const PLACEMENT = {
  userInput: 1,
  aiOutput: 2,
  worldInfo: 5,
  reasoning: 6,
} as const satisfies Record<string, RegexPlacement>;

/** Where in the pipeline the rewrite is happening. */
export type RegexPass = "display" | "prompt";

export interface ApplyOptions {
  placement: RegexPlacement;
  pass: RegexPass;
  /**
   * How far back in the chat this message sits (0 = newest). Rules with a
   * depth window are skipped outside it. Omit when depth is meaningless.
   */
  depth?: number;
}

/**
 * Parse SillyTavern's `/pattern/flags` form into a RegExp.
 *
 * Returns null for an unparseable pattern rather than throwing: one bad rule
 * in an imported preset must not take down the whole message pipeline.
 */
export function parseRegex(input: string): RegExp | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const delimited = /^\/(.+)\/([gimsuy]*)$/s.exec(trimmed);
  try {
    if (delimited) {
      const [, body, flags] = delimited;
      // Always global: SillyTavern replaces every occurrence.
      return new RegExp(body, flags.includes("g") ? flags : `${flags}g`);
    }
    return new RegExp(trimmed, "g");
  } catch {
    return null;
  }
}

/**
 * SillyTavern's replacement dialect on top of JavaScript's: `{{match}}` is the
 * whole match, and `$1`/`$2` behave as usual.
 */
function buildReplacement(replaceString: string): string {
  // A *function* replacer is required here: its return value is inserted
  // literally, with no $-expansion. Passing the string "$&" instead would
  // expand against this inner match and put "{{match}}" straight back.
  return replaceString.replace(/\{\{match\}\}/gi, () => "$&");
}

function trimAway(value: string, trimStrings: string[]): string {
  let result = value;
  for (const needle of trimStrings) {
    if (!needle) continue;
    result = result.split(needle).join("");
  }
  return result;
}

/** Does this rule run for this placement, pass and depth? */
export function ruleApplies(rule: RegexRule, options: ApplyOptions): boolean {
  if (rule.disabled) return false;
  if (!rule.placement.includes(options.placement)) return false;

  // markdownOnly and promptOnly are mutually exclusive in practice; if both
  // are set, treat it as "no restriction" rather than silently doing nothing.
  if (rule.markdownOnly && !rule.promptOnly && options.pass !== "display") return false;
  if (rule.promptOnly && !rule.markdownOnly && options.pass !== "prompt") return false;

  if (options.depth != null) {
    if (rule.minDepth != null && options.depth < rule.minDepth) return false;
    if (rule.maxDepth != null && options.depth > rule.maxDepth) return false;
  }

  return true;
}

/**
 * Run every applicable rule over `text`, in order.
 *
 * A rule that throws at replace time is skipped rather than allowed to break
 * the message — catastrophic backtracking on a hostile pattern is a real risk
 * with imported presets.
 */
export function applyRegexRules(
  text: string,
  rules: readonly RegexRule[],
  options: ApplyOptions,
): string {
  let result = text;

  for (const rule of rules) {
    if (!ruleApplies(rule, options)) continue;

    const pattern = parseRegex(rule.findRegex);
    if (!pattern) continue;

    try {
      pattern.lastIndex = 0;
      result = result.replace(pattern, buildReplacement(rule.replaceString ?? ""));
    } catch {
      continue;
    }

    if (rule.trimStrings?.length) {
      result = trimAway(result, rule.trimStrings);
    }
  }

  return result;
}

/* ── Import / export ─────────────────────────────────────────────────────*/

function newId(): string {
  const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof cryptoRef?.randomUUID === "function") return cryptoRef.randomUUID();
  return `regex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const VALID_PLACEMENTS: readonly number[] = [1, 2, 5, 6];

/**
 * Read a SillyTavern regex script. Tolerant of the field drift between forks,
 * and of the legacy placement values (0 = display-only, 3 = slash command)
 * that have no LettuceAI equivalent.
 */
export function parseSillyTavernRegex(input: unknown): RegexRule | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;

  const scriptName =
    typeof raw.scriptName === "string" && raw.scriptName.trim()
      ? raw.scriptName.trim()
      : "Imported rule";
  const findRegex = typeof raw.findRegex === "string" ? raw.findRegex : "";
  if (!findRegex.trim()) return null;

  const placement = Array.isArray(raw.placement)
    ? raw.placement
        .map((value) => Number(value))
        .filter((value): value is RegexPlacement => VALID_PLACEMENTS.includes(value))
    : [];

  const asBool = (value: unknown) => value === true;
  const asDepth = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  };

  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : newId(),
    scriptName,
    findRegex,
    replaceString: typeof raw.replaceString === "string" ? raw.replaceString : "",
    trimStrings: Array.isArray(raw.trimStrings)
      ? raw.trimStrings.filter((value): value is string => typeof value === "string")
      : [],
    // Default to AI output, which is what the overwhelming majority target.
    placement: placement.length > 0 ? placement : [2],
    disabled: asBool(raw.disabled),
    markdownOnly: asBool(raw.markdownOnly),
    promptOnly: asBool(raw.promptOnly),
    runOnEdit: asBool(raw.runOnEdit),
    minDepth: raw.minDepth == null ? null : asDepth(raw.minDepth),
    maxDepth: raw.maxDepth == null ? null : asDepth(raw.maxDepth),
  };
}

/**
 * Read either a single SillyTavern regex script or an array of them.
 * Returns the rules it could read plus a count of what it could not.
 */
export function importSillyTavernRegexJson(
  text: string,
): { ok: true; rules: RegexRule[]; skipped: number } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `Not valid JSON: ${(error as Error).message}` };
  }

  const candidates = Array.isArray(parsed) ? parsed : [parsed];
  const rules: RegexRule[] = [];
  let skipped = 0;

  for (const candidate of candidates) {
    const rule = parseSillyTavernRegex(candidate);
    if (rule) rules.push(rule);
    else skipped += 1;
  }

  if (rules.length === 0) {
    return { ok: false, error: "No usable regex rules in that file." };
  }
  return { ok: true, rules, skipped };
}

/** Serialise back out in SillyTavern's shape, so rules round-trip. */
export function exportRegexRules(rules: readonly RegexRule[]): string {
  return JSON.stringify(
    rules.map((rule) => ({
      id: rule.id,
      scriptName: rule.scriptName,
      findRegex: rule.findRegex,
      replaceString: rule.replaceString,
      trimStrings: rule.trimStrings,
      placement: rule.placement,
      disabled: rule.disabled,
      markdownOnly: rule.markdownOnly,
      promptOnly: rule.promptOnly,
      runOnEdit: rule.runOnEdit,
      minDepth: rule.minDepth,
      maxDepth: rule.maxDepth,
    })),
    null,
    2,
  );
}
