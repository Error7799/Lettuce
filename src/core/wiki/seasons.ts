/**
 * Browsing a wiki by season or story arc.
 *
 * A flat list of 261 characters is not a list anyone can use. What people
 * actually want is "the characters who were in Season 1", because that is how
 * they remember a show and how they scope a roleplay — playing the Final
 * Selection arc, you do not want a lorebook full of people who appear four
 * seasons later.
 *
 * No wiki records that directly. Nothing says "this character is in Season 2".
 * What every episodic wiki does have is the chain:
 *
 *   season/arc category  ->  episode pages  ->  links out  ->  characters
 *
 * Intersecting an episode's outgoing links with the wiki's own character
 * category is what turns "pages this episode mentions" into "characters who
 * appear in it". The links also contain actors, other episodes and production
 * staff; the intersection drops all of that without needing a heuristic.
 *
 * Verified against both wikis this was built for:
 *   Invincible  261 characters -> 100 in Season 1
 *   Jujutsu Kaisen  140 characters -> 41 in the Kyoto Goodwill Event arc
 *
 * Two shapes exist in the wild and both are handled: seasons as top-level
 * categories (Invincible: "Season 1"…"Season 5"), and arcs nested under a
 * parent (Jujutsu Kaisen: "Episodes by Arc" -> "Shibuya Incident Arc
 * Episodes"). Neither wiki can be assumed, so the grouping is discovered.
 */

import { getJson } from "../discovery/providers/http";

export interface WikiGrouping {
  /** Category title without the "Category:" prefix. */
  id: string;
  /** Display label, tidied of wiki scaffolding. */
  label: string;
  /** Where it was found, which decides how members are read. */
  kind: "season" | "arc";
}

interface CategoryMember {
  title: string;
  ns: number;
}

interface QueryResponse {
  query?: { categorymembers?: CategoryMember[]; allcategories?: { "*"?: string }[] };
  continue?: { cmcontinue?: string; accontinue?: string };
}

interface ParseResponse {
  parse?: { links?: { ns: number; "*"?: string }[] };
}

/** api.php for a fandom host, which is the only shape these wikis share. */
function apiBase(host: string): string {
  return `https://${host.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}/api.php`;
}

async function categoryMembers(
  host: string,
  category: string,
  type: "page" | "subcat" = "page",
): Promise<string[]> {
  const out: string[] = [];
  let cont: string | undefined;

  // Paged: a season category on a long-running show exceeds one response.
  do {
    const response = await getJson<QueryResponse>(apiBase(host), {
      query: {
        action: "query",
        list: "categorymembers",
        cmtitle: category.startsWith("Category:") ? category : `Category:${category}`,
        cmlimit: 500,
        cmtype: type === "subcat" ? "subcat" : undefined,
        format: "json",
        cmcontinue: cont,
      },
    });
    for (const member of response.query?.categorymembers ?? []) {
      if (type === "subcat" || member.ns === 0) out.push(member.title);
    }
    cont = response.continue?.cmcontinue;
  } while (cont);

  return out;
}

/** Strip the scaffolding a category name carries, leaving a readable label. */
export function tidyLabel(title: string): string {
  return title
    .replace(/^Category:/, "")
    .replace(/\s+Episodes$/i, "")
    .trim();
}

/**
 * Find how this wiki groups its episodes.
 *
 * Tries direct season categories first, then a "by arc" parent. Returns an
 * empty list rather than guessing when neither exists — a wrong grouping is
 * worse than none, because it silently produces the wrong characters.
 */
export async function findGroupings(host: string): Promise<WikiGrouping[]> {
  const groupings: WikiGrouping[] = [];

  // Shape one: "Season 1", "Season 2" … as top-level categories.
  try {
    const response = await getJson<QueryResponse>(apiBase(host), {
      query: {
        action: "query",
        list: "allcategories",
        acprefix: "Season ",
        aclimit: 50,
        format: "json",
      },
    });
    for (const entry of response.query?.allcategories ?? []) {
      const name = entry["*"];
      // "Season Finale" and "Seasons" are categories too, and are not seasons.
      if (name && /^Season \d+$/i.test(name.trim())) {
        groupings.push({ id: name, label: name, kind: "season" });
      }
    }
  } catch {
    // A wiki without this category is the normal case, not an error.
  }

  if (groupings.length > 0) {
    groupings.sort((a, b) => {
      const na = Number(/\d+/.exec(a.label)?.[0] ?? 0);
      const nb = Number(/\d+/.exec(b.label)?.[0] ?? 0);
      return na - nb;
    });
    return groupings;
  }

  // Shape two: arcs nested under a parent category.
  for (const parent of ["Episodes by Arc", "Episodes by arc", "Story Arcs", "Arcs"]) {
    try {
      const subcats = await categoryMembers(host, parent, "subcat");
      if (subcats.length > 0) {
        return subcats.map((title) => ({
          id: title,
          label: tidyLabel(title),
          kind: "arc" as const,
        }));
      }
    } catch {
      // Try the next candidate.
    }
  }

  return [];
}

/** Every character page on the wiki, used to filter episode links. */
export async function characterIndex(host: string): Promise<Set<string>> {
  const titles = await categoryMembers(host, "Characters");
  return new Set(titles);
}

export interface GroupingResult {
  /** Character page titles appearing in this season or arc, in wiki order. */
  characters: string[];
  /** Episode pages the characters were drawn from. */
  episodes: string[];
}

/**
 * Characters appearing in one season or arc.
 *
 * `characters` is passed in rather than fetched so browsing several seasons
 * does not re-download the whole character index each time — it is the
 * expensive call, and it does not change between groupings.
 *
 * Episode pages are fetched in small batches. Sequential requests would take
 * a noticeable pause on a twenty-episode season, and unbounded parallelism
 * gets a Fandom host irritated.
 */
export async function charactersInGrouping(
  host: string,
  grouping: WikiGrouping,
  characters: ReadonlySet<string>,
  onProgress?: (done: number, total: number) => void,
): Promise<GroupingResult> {
  const episodes = await categoryMembers(host, grouping.id);
  const found = new Set<string>();
  const batchSize = 5;

  for (let index = 0; index < episodes.length; index += batchSize) {
    const batch = episodes.slice(index, index + batchSize);
    const pages = await Promise.all(
      batch.map(async (title) => {
        try {
          const response = await getJson<ParseResponse>(apiBase(host), {
            query: { action: "parse", page: title, prop: "links", format: "json" },
          });
          return response.parse?.links ?? [];
        } catch {
          // One unreadable episode should not lose the rest of the season.
          return [];
        }
      }),
    );
    for (const links of pages) {
      for (const link of links) {
        const title = link["*"];
        if (link.ns === 0 && title && characters.has(title)) found.add(title);
      }
    }
    onProgress?.(Math.min(index + batchSize, episodes.length), episodes.length);
  }

  return { characters: [...found].sort((a, b) => a.localeCompare(b)), episodes };
}
