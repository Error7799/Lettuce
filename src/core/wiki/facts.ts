/**
 * Pulling structured facts out of a wiki page.
 *
 * The Maker builds entries from the lead paragraph, which reads well and
 * leaves out most of what a roleplay actually needs. A lead says who someone
 * is; it rarely says they are 28, deceased, a first-year at Kyoto, or known to
 * half the cast as "The Strongest". Those live in the infobox, which is
 * wikitext rather than prose and so has to be parsed rather than read.
 *
 * Three things come out of that, all of which change the finished lorebook:
 *
 *   Facts      short attributes worth stating outright, since a model holds
 *              "Status: deceased" far better than the same fact buried in a
 *              paragraph it may or may not still have in context.
 *
 *   Aliases    extra keywords. A character called "The Strongest" throughout
 *              the dialogue will never match an entry keyed only on their
 *              name, which is the single most common reason a lorebook quietly
 *              does nothing.
 *
 *   Spoilers   fields like status and later affiliations give away endings.
 *              Someone playing an early arc wants the character, not the
 *              obituary, so these are separable rather than always included.
 *
 * Pure module: parsing is all string work, so every case below is testable
 * without a network call — which matters because infobox wikitext is a swamp
 * of refs, galleries, templates and HTML that only ever gets messier.
 */

/** One attribute from an infobox, cleaned for reading. */
export interface WikiFact {
  key: string;
  value: string;
}

/** Fields that reveal how a story ends, or where someone finishes up. */
const SPOILER_FIELDS = new Set([
  "status",
  "deceased",
  "death",
  "cause of death",
  "fate",
  "affiliation",
  "previous affiliation",
  "former affiliation",
  "occupation",
  "previous occupation",
  "partner",
  "spouse",
  "children",
]);

/** Fields that are wiki bookkeeping rather than anything about the subject. */
const IGNORED_FIELDS = new Set([
  "image",
  "image1",
  "image2",
  "imagewidth",
  "caption",
  "gallery",
  "tab1",
  "tab2",
  "tab3",
  "color",
  "colour",
  "textcolor",
  "background",
  "header",
  "title",
  "box",
  "manga debut",
  "anime debut",
  "japanese voice",
  "english voice",
  "voice actor",
  "seiyuu",
  "va",
]);

/**
 * Strip the template and markup noise infobox values are wrapped in.
 *
 * Order matters: references and galleries are removed whole before links are
 * unwrapped, because a `{{Ref|...}}` can contain a `[[link]]` and unwrapping
 * first would leave its text stranded in the middle of the value.
 */
export function cleanValue(raw: string): string {
  let value = raw;

  // Galleries are multi-line image lists; nothing in them is prose.
  value = value.replace(/<gallery>[\s\S]*?<\/gallery>/gi, " ");
  // Citation templates, including nested ones, removed innermost-first.
  for (let pass = 0; pass < 4; pass += 1) {
    const next = value.replace(/\{\{\s*(ref|cite|sup|sub|small)\b[^{}]*\}\}/gi, " ");
    if (next === value) break;
    value = next;
  }
  // Any remaining simple template keeps its last parameter, which is usually
  // the display text: {{Nihongo|Gojo|五条}} -> 五条 is wrong, so prefer first.
  value = value.replace(/\{\{[^{}|]*\|([^{}|]*)[^{}]*\}\}/g, "$1");
  value = value.replace(/\{\{[^{}]*\}\}/g, " ");
  // [[Target|Shown]] -> Shown, [[Target]] -> Target.
  value = value.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1");
  value = value.replace(/\[\[([^\]]*)\]\]/g, "$1");
  // External links keep their label.
  value = value.replace(/\[(?:https?:)?\/\/\S+\s+([^\]]*)\]/g, "$1");
  // Line breaks are list separators, and must be turned into commas BEFORE the
  // generic tag strip below — otherwise <br> becomes a space and two values
  // silently run together into one.
  value = value.replace(/\s*<br\s*\/?>\s*/gi, ", ");
  value = value.replace(/<[^>]+>/g, " ");
  value = value.replace(/'''?/g, "");
  value = value.replace(/&nbsp;/gi, " ");
  value = value.replace(/\n+/g, ", ");
  // Anything still holding markup got there through source that does not
  // balance — unclosed links and half-open comments are common in hand-edited
  // list fields like Relatives, and every wiki tested had at least one. Strip
  // the remnants rather than letting them reach the lorebook, where "[[Nolan's
  // father" is worse than simply not saying it.
  value = value.replace(/<!--[\s\S]*?(?:-->|$)/g, " ");
  value = value.replace(/\[\[|\]\]/g, " ");
  value = value.replace(/\{\{|\}\}/g, " ");
  // Bullets and "Heading :" labels are list scaffolding, not values.
  value = value.replace(/(^|,)\s*\*+\s*/g, "$1 ");
  value = value.replace(/(^|,)\s*[A-Z][a-z]+\s+:\s*/g, "$1 ");
  value = value.replace(/\s{2,}/g, " ");
  value = value.replace(/\s*,\s*,+/g, ", ");
  value = value.replace(/\s+,/g, ",");
  return value.replace(/^[\s,;:*-]+|[\s,;:*-]+$/g, "").trim();
}

/** Title-case a field name for display: "cause of death" -> "Cause of death". */
function tidyKey(key: string): string {
  const spaced = key.replace(/_/g, " ").trim().toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export interface ParsedInfobox {
  facts: WikiFact[];
  spoilerFacts: WikiFact[];
  aliases: string[];
}

/**
 * Parse the first infobox out of a page's section-0 wikitext.
 *
 * Splits on top-level pipes only — a value can itself contain `[[a|b]]` or a
 * nested template, and splitting naively on every `|` shreds exactly the
 * fields worth having.
 */
export function parseInfobox(sectionZero: string): ParsedInfobox {
  const block = findInfoboxBlock(sectionZero);
  if (!block) return { facts: [], spoilerFacts: [], aliases: [] };

  const facts: WikiFact[] = [];
  const spoilerFacts: WikiFact[] = [];
  const aliases: string[] = [];

  for (const part of splitTopLevel(block).slice(1)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim().toLowerCase().replace(/_/g, " ");
    // A key spanning lines means the split landed inside a value, not on a
    // real field boundary.
    if (!key || key.includes("\n") || key.includes("\r") || IGNORED_FIELDS.has(key)) continue;

    const value = cleanValue(part.slice(eq + 1));
    // A value that is only punctuation is an empty field the editor left in.
    if (!value || value.length < 2 || !/[\p{L}\p{N}]/u.test(value)) continue;
    // Absurdly long values are usually a mis-parsed body, not an attribute.
    if (value.length > 300) continue;

    if (ALIAS_FIELDS.has(key)) {
      for (const alias of value.split(/,\s*/)) {
        const trimmed = alias.replace(/\s*\([^)]*\)\s*/g, "").replace(/^[*#:;\s]+/, "").trim();
        // Section labels like "Codenames" come through scroll-box wrappers.
        if (trimmed.length > 1 && trimmed.length < 60 && !/:$/.test(trimmed)) {
          aliases.push(trimmed);
        }
      }
      continue;
    }

    const fact = { key: tidyKey(key), value };
    if (SPOILER_FIELDS.has(key)) spoilerFacts.push(fact);
    else facts.push(fact);
  }

  return { facts, spoilerFacts, aliases: [...new Set(aliases)] };
}

const ALIAS_FIELDS = new Set(["alias", "aliases", "other names", "nickname", "nicknames", "codename", "codenames"]);

/**
 * Find the infobox by shape rather than by name.
 *
 * Template names are not portable: Jujutsu Kaisen uses `Character_Infobox`,
 * Invincible uses plain `Character`, and others use `Infobox character` or a
 * house name entirely their own. Matching on "infobox" found nothing on the
 * Invincible wiki and silently returned zero facts for every page.
 *
 * What every infobox does share is shape — far more `key = value` fields than
 * any other template on the page. So the block with the most assignments wins,
 * which needs no per-wiki configuration and degrades to "no facts" rather than
 * to wrong ones.
 */
function findInfoboxBlock(sectionZero: string): string | null {
  let best: string | null = null;
  let bestFields = 0;

  for (let index = 0; index < sectionZero.length - 1; index += 1) {
    if (sectionZero.slice(index, index + 2) !== "{{") continue;

    let depth = 0;
    let end = -1;
    for (let scan = index; scan < sectionZero.length - 1; scan += 1) {
      const pair = sectionZero.slice(scan, scan + 2);
      if (pair === "{{") {
        depth += 1;
        scan += 1;
      } else if (pair === "}}") {
        depth -= 1;
        scan += 1;
        if (depth === 0) {
          end = scan + 1;
          break;
        }
      }
    }
    if (end < 0) continue;

    const candidate = sectionZero
      .slice(index, end)
      .replace(/<gallery[^>]*>[\s\S]*?<\/gallery>/gi, " ")
      .replace(/\}\}\s*$/, "");
    const fields = splitTopLevel(candidate)
      .slice(1)
      .filter((part) => /^\s*[a-z][a-z0-9 _-]{0,30}\s*=/i.test(part)).length;

    // Four is enough to separate an infobox from {{Tabs}} or {{Notice}}.
    if (fields >= 4 && fields > bestFields) {
      best = candidate;
      bestFields = fields;
    }
    index = end - 1;
  }

  return best;
}

/**
 * Split a template body on its top-level pipes.
 *
 * A value can contain `[[a|b]]` or a nested template, and splitting on every
 * pipe shreds exactly the fields worth having.
 */
function splitTopLevel(block: string): string[] {
  const parts: string[] = [];
  let buffer = "";
  let braces = 0;
  let brackets = 0;

  for (let index = 0; index < block.length; index += 1) {
    const pair = block.slice(index, index + 2);
    // Both characters of a delimiter must be consumed together. Counting one
    // at a time miscounts "{{{param}}}" and parser functions like {{#expr:}},
    // leaving the depth wrong for every field that follows.
    if (pair === "{{" || pair === "}}" || pair === "[[" || pair === "]]") {
      if (pair === "{{") braces += 1;
      else if (pair === "}}") braces = Math.max(0, braces - 1);
      else if (pair === "[[") brackets += 1;
      else brackets = Math.max(0, brackets - 1);
      buffer += pair;
      index += 1;
      continue;
    }
    const char = block[index];
    if (char === "|" && braces <= 1 && brackets === 0) {
      parts.push(buffer);
      buffer = "";
    } else {
      buffer += char;
    }
  }
  parts.push(buffer);

  // Repair: a part left holding an unclosed "[[" was split inside a link, so
  // rejoin it with what follows. Unbalanced markup in the source is common
  // enough that bailing out would lose real fields.
  const repaired: string[] = [];
  for (const part of parts) {
    const previous = repaired[repaired.length - 1];
    const opens = (previous?.match(/\[\[/g) ?? []).length;
    const closes = (previous?.match(/\]\]/g) ?? []).length;
    if (previous !== undefined && opens > closes) {
      repaired[repaired.length - 1] = `${previous}|${part}`;
    } else {
      repaired.push(part);
    }
  }
  return repaired;
}

/** Render facts as the compact block appended to an entry. */
export function renderFacts(facts: readonly WikiFact[]): string {
  if (facts.length === 0) return "";
  return facts.map((fact) => `${fact.key}: ${fact.value}`).join("\n");
}

/* ── Keyword safety ──────────────────────────────────────────────────────
 * A keyword that is too short or too common fires constantly and drags its
 * entry into every unrelated scene. The matcher is whole-word, so this is
 * about real words rather than substrings — but "Human", "Order" and "Bar"
 * are real words that appear everywhere.
 * ---------------------------------------------------------------------- */

const RISKY_COMMON_WORDS = new Set([
  "human", "order", "bar", "club", "home", "house", "car", "cars", "boat", "jet",
  "rich", "peak", "crew", "beef", "opp", "rap", "drip", "the", "one", "two",
  "school", "city", "town", "man", "woman", "boy", "girl", "king", "queen",
  "doctor", "master", "sensei", "student", "teacher", "hero", "villain",
]);

export interface KeywordWarning {
  keyword: string;
  reason: string;
}

/**
 * Keywords likely to fire when they should not.
 *
 * Advisory rather than enforced: a wiki about a character actually called
 * "Order" needs that keyword, and silently dropping it would be worse than a
 * warning the user can read and ignore.
 */
export function reviewKeywords(keywords: readonly string[]): KeywordWarning[] {
  const warnings: KeywordWarning[] = [];
  for (const keyword of keywords) {
    const trimmed = keyword.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();

    if (trimmed.length <= 2) {
      warnings.push({ keyword: trimmed, reason: "Very short — will match constantly." });
      continue;
    }
    if (RISKY_COMMON_WORDS.has(lower)) {
      warnings.push({
        keyword: trimmed,
        reason: "Common word — fires in scenes that have nothing to do with this entry.",
      });
      continue;
    }
    if (/^\d+$/.test(trimmed)) {
      warnings.push({ keyword: trimmed, reason: "Just a number — matches any mention of it." });
    }
  }
  return warnings;
}

/* ── Importance ──────────────────────────────────────────────────────────*/

/**
 * Rank pages by how central they are, using inbound links.
 *
 * A wiki's own link graph is a better measure of importance than anything
 * derivable from a page itself: the cast talks about the people who matter.
 * The API caps a count at 500, so above that the ordering is arbitrary — which
 * is fine, since everything in that band is a main character anyway.
 */
export function rankByBacklinks<T extends { title: string }>(
  pages: readonly T[],
  backlinks: ReadonlyMap<string, number>,
): T[] {
  return [...pages].sort((a, b) => {
    const diff = (backlinks.get(b.title) ?? 0) - (backlinks.get(a.title) ?? 0);
    return diff !== 0 ? diff : a.title.localeCompare(b.title);
  });
}

/**
 * A sensible activation strategy from importance.
 *
 * Main characters earn always-on; everyone else is keyword-driven. Getting
 * this right by default is what stops a freshly built book spending its whole
 * budget before the first scene — the failure this whole area keeps producing.
 */
export function suggestAlwaysActive(backlinks: number, threshold = 250): boolean {
  return backlinks >= threshold;
}
