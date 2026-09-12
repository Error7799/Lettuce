/**
 * Turning wiki pages into lorebook entries.
 *
 * The fetching lives in Rust; this is the part that decides what an entry
 * *says*. Ported from Lorebook Studio's formatter, minus the wikitext template
 * handling — the Rust side asks the wiki for plain text, so what arrives here
 * is prose rather than markup.
 *
 * Two decisions carried over from the original, because both are what make a
 * scraped book usable rather than merely present:
 *
 *   Keys are the names a conversation would really use. A page titled
 *   "Yuji Itadori (character)" is talked about as "Yuji", "Itadori", or the
 *   full name — never as the disambiguated title, which is a filing convention.
 *
 *   Entries are trimmed to what matters. A wiki article runs to thousands of
 *   words of episode-by-episode recap; an entry that long crowds out the
 *   conversation it was meant to support, so the lead section is kept and the
 *   rest dropped.
 */

import { invoke } from "@tauri-apps/api/core";

export interface WikiSite {
  api: string;
  name: string;
  base?: string;
  lang: string;
  /** Set when the pasted link named one article rather than a whole wiki. */
  article?: string;
}

export interface WikiHit {
  title: string;
  snippet?: string;
  thumbnail?: string;
}

export interface WikiPage {
  title: string;
  text: string;
  categories: string[];
  thumbnail?: string;
  url?: string;
  missing: boolean;
}

export interface ScrapedEntry {
  title: string;
  keywords: string[];
  content: string;
  /** Kept so the UI can show what a built entry came from. */
  sourceUrl?: string;
  thumbnail?: string;
}

export async function resolveWiki(target: string): Promise<WikiSite> {
  return await invoke<WikiSite>("wiki_resolve", { target });
}

export async function searchWiki(api: string, query: string, limit = 24): Promise<WikiHit[]> {
  return await invoke<WikiHit[]>("wiki_search", { api, query, limit });
}

export async function listCategory(api: string, category: string, limit = 200): Promise<WikiHit[]> {
  return await invoke<WikiHit[]>("wiki_category", { api, category, limit });
}

export async function fetchPages(api: string, titles: string[]): Promise<WikiPage[]> {
  return await invoke<WikiPage[]>("wiki_fetch_pages", { api, titles });
}

export interface WikiArc {
  name: string;
  category: string;
  count: number;
}

export interface WikiWork {
  name: string;
  /** "series" is the wiki's main story, "spinoff" has its own instalments,
   *  "other" is a film/novel/game with none to scan. */
  kind: "series" | "spinoff" | "other";
  instalmentCategories: string[];
  instalmentKind: string;
  instalmentCount: number;
  thumbnail?: string;
  arcs: WikiArc[];
}

export interface WikiSection {
  label: string;
  category: string;
  count: number;
}

/** One candidate entry, carrying the evidence for including it. */
export interface ScopedPage {
  title: string;
  /** Instalments this appears in. */
  seeds: number;
  /** Instalments sampled, so the share can be shown honestly. */
  of: number;
  debut: boolean;
}

export async function listWorks(api: string): Promise<WikiWork[]> {
  return await invoke<WikiWork[]>("wiki_works", { api });
}

export async function listSections(api: string): Promise<WikiSection[]> {
  return await invoke<WikiSection[]>("wiki_sections", { api });
}

export async function fetchThumbnails(
  api: string,
  titles: string[],
): Promise<Record<string, string>> {
  return await invoke<Record<string, string>>("wiki_fetch_thumbnails", { api, titles });
}

/**
 * Everything belonging to one story, derived from that story's own instalments.
 *
 * `minShare` is the fraction of a work's instalments something must appear in
 * to count as part of it. Exposed rather than fixed because the right threshold
 * depends on the wiki: a tightly-linked one puts the whole cast in every
 * chapter, a sparse one names only who speaks.
 */
export async function scopeWork(
  api: string,
  instalmentCategories: string[],
  opts?: { sample?: number; minShare?: number },
): Promise<ScopedPage[]> {
  return await invoke<ScopedPage[]>("wiki_scope", {
    api,
    instalmentCategories,
    sample: opts?.sample,
    minShare: opts?.minShare,
  });
}

/* ── Entry shaping ───────────────────────────────────────────────────────*/

/** Words too generic to trigger on, however they appear in a title. */
const STOP_KEYS = new Set([
  "the", "a", "an", "of", "and", "or", "in", "on", "at", "to", "for",
  "character", "characters", "episode", "season", "chapter", "arc", "list",
]);

/**
 * Words that mark a title as a place, body or institution rather than a person.
 * Their presence is what stops "Jujutsu High" being split into "Jujutsu".
 */
const PLACE_WORDS = new Set([
  "high", "school", "academy", "college", "university", "institute", "hospital",
  "city", "town", "village", "island", "kingdom", "empire", "republic", "state",
  "temple", "shrine", "church", "hall", "tower", "castle", "palace", "station",
  "district", "prefecture", "province", "county", "street", "road", "bridge",
  "guild", "order", "clan", "corps", "council", "company", "corporation",
  "league", "alliance", "federation", "academy", "association", "society",
  "mountain", "river", "forest", "sea", "ocean", "valley", "desert",
]);

/**
 * The names a conversation would actually use for this page.
 *
 * Wiki titles carry filing information that nobody says out loud —
 * disambiguators in brackets, "List of" prefixes, franchise suffixes after a
 * comma. Those are stripped, then the remaining name is offered whole and, for
 * a personal name, by its parts: people get referred to by first name or
 * surname far more often than in full.
 */
export function keywordsFor(title: string): string[] {
  const cleaned = title
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .replace(/^List of\s+/i, "")
    .replace(/,.*$/, "")
    .trim();

  const keys = new Set<string>();
  if (cleaned) keys.add(cleaned);

  const words = cleaned.split(/\s+/).filter(Boolean);
  // Only split personal-looking names, and err towards not splitting.
  //
  // The two mistakes are not equal. Failing to split a name costs nothing much
  // — the full name still matches — while splitting a place produces an entry
  // that fires on every mention of "Tokyo" or "High" and quietly poisons every
  // conversation set anywhere near it. So this takes two capitalised words with
  // no institutional word among them, and leaves everything else whole:
  // three-word titles are far more often institutions than middle names.
  const looksLikeAName =
    words.length === 2 &&
    words.every((word) => /^[A-Z][\p{L}'’-]*$/u.test(word)) &&
    !words.some((word) => PLACE_WORDS.has(word.toLowerCase()));

  if (looksLikeAName) {
    for (const word of words) {
      if (word.length > 2 && !STOP_KEYS.has(word.toLowerCase())) keys.add(word);
    }
  }

  return [...keys].filter((key) => key.length > 1 && !STOP_KEYS.has(key.toLowerCase()));
}

/**
 * Editorial furniture that is about the article rather than its subject.
 *
 * These sit above the lead on a lot of wiki pages, and without dropping them a
 * scraped entry opens by telling the model that the page needs a cleanup.
 */
const CHROME_PATTERNS: readonly RegExp[] = [
  /^this article (is|may|needs|contains)/i,
  /^this page (is|may|needs|contains)/i,
  /^please (revise|help|note)/i,
  /^for (other uses|the .+), see/i,
  /^not to be confused with/i,
  /^spoiler(s)? (warning|alert)/i,
  /^the following (article|section) contains/i,
  /^\s*(edit|read more|contents|references|external links)\s*$/i,
];

function isWikiChrome(line: string): boolean {
  const trimmed = line.trim();
  return CHROME_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Keep the part of an article worth injecting.
 *
 * Wiki articles front-load the definition and then run for thousands of words
 * of plot recap. The lead is what identifies the subject; everything after the
 * first heading is detail that would spend the context budget without telling
 * the model who it is dealing with.
 */
export function trimToLead(text: string, maxChars = 1200): string {
  // Everything before the first real paragraph is wiki furniture: maintenance
  // banners, navigation, and whatever survived the infobox. Checked against the
  // live Fandom renderer, where an entry that skipped this step opened with
  // "This article is locked from editing to avoid vandalism".
  const startsProse = (line: string) =>
    line.length >= 80 && /[.!?]["')\]]?\s*$/.test(line) && !isWikiChrome(line);

  const lines = text.split(/\n/);
  const firstProse = lines.findIndex(startsProse);
  const body = (firstProse >= 0 ? lines.slice(firstProse) : lines).join("\n");

  const beforeHeading = body.split(/\n(?=[A-Z][^\n]{0,60}\n)/)[0] ?? body;

  const paragraphs = beforeHeading
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^\s*[\[\|{]/.test(p) && !isWikiChrome(p));

  const kept: string[] = [];
  let total = 0;
  for (const paragraph of paragraphs) {
    if (total + paragraph.length > maxChars && kept.length > 0) break;
    kept.push(paragraph);
    total += paragraph.length;
  }

  const joined = kept.join("\n\n").trim();
  if (joined.length <= maxChars) return joined;

  // Cut on a sentence rather than mid-word when a single paragraph overruns.
  const cut = joined.slice(0, maxChars);
  const lastStop = cut.lastIndexOf(". ");
  return (lastStop > maxChars / 2 ? cut.slice(0, lastStop + 1) : cut).trim();
}

/** Build an entry from a fetched page. Returns null for pages with no prose. */
export function entryFromPage(page: WikiPage, maxChars = 1200): ScrapedEntry | null {
  if (page.missing) return null;
  const content = trimToLead(page.text, maxChars);
  if (content.length < 40) return null;

  return {
    title: page.title,
    keywords: keywordsFor(page.title),
    content,
    sourceUrl: page.url,
    thumbnail: page.thumbnail,
  };
}
