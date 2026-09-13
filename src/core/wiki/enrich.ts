/**
 * Enriching a scraped entry with what the infobox knows.
 *
 * `entryFromPage` builds an entry from the lead paragraph alone, which is good
 * prose and a thin character sheet. The infobox holds the rest — age, species,
 * status, affiliations, and the names the cast actually uses — and none of it
 * reaches the lorebook unless it is fetched separately, because the page-fetch
 * endpoint returns rendered extracts rather than source wikitext.
 *
 * This adds one batched call per build and folds the result in. The alias half
 * matters most: an entry keyed only on "Satoru Gojo" never fires in a scene
 * where everyone says "Gojo-sensei" or "the strongest", and a lorebook that
 * never fires is indistinguishable from one that was never made.
 */

import { getJson } from "../discovery/providers/http";
import { parseInfobox, renderFacts, type ParsedInfobox } from "./facts";
import type { ScrapedEntry } from "./index";

interface RevisionsResponse {
  query?: {
    pages?: Record<string, { title?: string; revisions?: { slots?: { main?: { "*"?: string } } }[] }>;
  };
}

/** Section 0 holds the infobox; fetching the whole page would be wasteful. */
const SECTION_ZERO = 0;
/** The API caps a titles= list at 50 for anonymous callers. */
const BATCH = 40;

/**
 * Fetch and parse the infobox for many pages at once.
 *
 * `redirects=1` matters: a wiki's character category is full of redirect
 * titles — "Mark Grayson" resolves to "Invincible" — and without it those
 * pages return nothing at all rather than the article they point at.
 */
export async function fetchInfoboxes(
  api: string,
  titles: readonly string[],
): Promise<Map<string, ParsedInfobox>> {
  const out = new Map<string, ParsedInfobox>();

  for (let index = 0; index < titles.length; index += BATCH) {
    const batch = titles.slice(index, index + BATCH);
    try {
      const response = await getJson<RevisionsResponse>(api, {
        query: {
          action: "query",
          prop: "revisions",
          rvprop: "content",
          rvslots: "main",
          rvsection: SECTION_ZERO,
          redirects: 1,
          titles: batch.join("|"),
          format: "json",
        },
      });

      for (const page of Object.values(response.query?.pages ?? {})) {
        const title = page.title;
        const text = page.revisions?.[0]?.slots?.main?.["*"];
        if (!title || !text) continue;
        const parsed = parseInfobox(text);
        if (parsed.facts.length > 0 || parsed.aliases.length > 0) out.set(title, parsed);
      }
    } catch {
      // A failed batch costs richer entries, not the build. The lead paragraph
      // is already in hand and is what the entry was going to be regardless.
    }
  }

  return out;
}

export interface EnrichOptions {
  /** Include fields that give away later events — status, fate, affiliations. */
  includeSpoilers: boolean;
  /** Add infobox aliases as extra keywords. */
  useAliases: boolean;
  /** Append the fact block to the entry body. */
  includeFacts: boolean;
}

export const DEFAULT_ENRICH: EnrichOptions = {
  includeSpoilers: false,
  useAliases: true,
  includeFacts: true,
};

/**
 * Fold parsed infobox data into an entry.
 *
 * Facts go after the prose rather than before it, so the entry still opens
 * with a sentence that reads. Aliases are merged rather than replacing the
 * title-derived keywords, and deduplicated case-insensitively because "Gojo"
 * and "gojo" arriving from two sources would otherwise both be stored.
 */
export function enrichEntry(
  entry: ScrapedEntry,
  parsed: ParsedInfobox | undefined,
  options: EnrichOptions = DEFAULT_ENRICH,
): ScrapedEntry {
  if (!parsed) return entry;

  let content = entry.content;
  if (options.includeFacts) {
    const facts = options.includeSpoilers
      ? [...parsed.facts, ...parsed.spoilerFacts]
      : parsed.facts;
    const block = renderFacts(facts);
    if (block) content = `${content}\n\n${block}`;
  }

  let keywords = entry.keywords;
  if (options.useAliases && parsed.aliases.length > 0) {
    const seen = new Set(keywords.map((keyword) => keyword.toLowerCase()));
    const added: string[] = [];
    for (const alias of parsed.aliases) {
      const lower = alias.toLowerCase();
      // A one-word alias that is already a keyword adds nothing, and a very
      // long one is a description rather than something anyone will type.
      if (seen.has(lower) || alias.length > 40) continue;
      seen.add(lower);
      added.push(alias);
    }
    if (added.length > 0) keywords = [...keywords, ...added];
  }

  return { ...entry, content, keywords };
}
