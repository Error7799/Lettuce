/**
 * Bulk editing for lorebooks — ported from Lorebook Studio's Editor.
 *
 * Lorebooks go wrong in bulk, not one entry at a time. A book arrives with two
 * dozen entries marked always-active and spends most of the context before the
 * scene starts; a find-and-replace is needed across forty entries because a
 * name changed; two entries quietly share a keyword and fight over it. Editing
 * those one at a time is the reason people give up and live with the problem.
 *
 * The operations here are Studio's, re-implemented against LettuceAI's own
 * entry shape. Studio stores SillyTavern's raw fields — `constant`,
 * `selective`, `vectorized`, `disable` — while LettuceAI normalises those into
 * `alwaysActive`, `enabled` and a keyword list, so this translates rather than
 * copying, and the strategy names stay the ones people know from SillyTavern.
 *
 * Pure module: every operation takes entries and returns new entries. Nothing
 * reads or writes storage, so the behaviour can be tested exactly, and undo is
 * just keeping the previous array.
 */

/** An entry as LettuceAI stores it. Extra fields are preserved untouched. */
export interface EditableEntry {
  id: string;
  title: string;
  enabled: boolean;
  alwaysActive: boolean;
  keywords: string[];
  content: string;
  priority: number;
  displayOrder: number;
  caseSensitive?: boolean;
  [key: string]: unknown;
}

/**
 * SillyTavern's activation strategies, which is the vocabulary lorebook
 * authors already use.
 *
 * LettuceAI has no vectorised retrieval, so that strategy is deliberately
 * absent rather than accepted and silently treated as something else.
 */
export type Strategy = "normal" | "constant" | "selective";

export function detectStrategy(entry: EditableEntry): Strategy {
  if (entry.alwaysActive) return "constant";
  // "Selective" in SillyTavern means secondary keys must also match. LettuceAI
  // has one keyword list, so the nearest honest reading is an entry that is
  // keyword-driven and has more than one key to satisfy.
  if (!entry.alwaysActive && entry.keywords.length > 1) return "selective";
  return "normal";
}

export function applyStrategy(entry: EditableEntry, strategy: Strategy): EditableEntry {
  return { ...entry, alwaysActive: strategy === "constant" };
}

/* ── Bulk operations ─────────────────────────────────────────────────────
 * Each returns { entries, changed } so the UI can say what happened rather
 * than leaving the user to spot the difference.
 * ---------------------------------------------------------------------- */

export interface BulkResult {
  entries: EditableEntry[];
  changed: number;
}

function mapSelected(
  entries: readonly EditableEntry[],
  selected: ReadonlySet<string>,
  fn: (entry: EditableEntry) => EditableEntry | null,
): BulkResult {
  let changed = 0;
  const next = entries.map((entry) => {
    if (!selected.has(entry.id)) return entry;
    const updated = fn(entry);
    if (updated === null) return entry;
    changed += 1;
    return updated;
  });
  return { entries: next, changed };
}

export function bulkSetStrategy(
  entries: readonly EditableEntry[],
  selected: ReadonlySet<string>,
  strategy: Strategy,
): BulkResult {
  return mapSelected(entries, selected, (entry) => {
    const updated = applyStrategy(entry, strategy);
    // Report only real changes, so "12 changed" means twelve entries differ.
    return updated.alwaysActive === entry.alwaysActive ? null : updated;
  });
}

export function bulkSetEnabled(
  entries: readonly EditableEntry[],
  selected: ReadonlySet<string>,
  enabled: boolean,
): BulkResult {
  return mapSelected(entries, selected, (entry) =>
    entry.enabled === enabled ? null : { ...entry, enabled },
  );
}

export type NumericField = "priority" | "displayOrder";

export function bulkSetNumber(
  entries: readonly EditableEntry[],
  selected: ReadonlySet<string>,
  field: NumericField,
  value: number,
): BulkResult {
  return mapSelected(entries, selected, (entry) =>
    entry[field] === value ? null : { ...entry, [field]: value },
  );
}

export type ReplaceField = "content" | "title" | "keywords";

export interface FindReplaceOptions {
  find: string;
  replace: string;
  fields: readonly ReplaceField[];
  regex?: boolean;
  caseSensitive?: boolean;
}

export interface FindReplaceResult extends BulkResult {
  /** Total individual substitutions, which can exceed `changed`. */
  replacements: number;
  error?: string;
}

/**
 * Find and replace across selected entries.
 *
 * A bad regex returns an error rather than throwing, because this runs from a
 * text box where a half-typed pattern is the normal state, and an exception
 * would take the page down mid-edit.
 */
export function findReplace(
  entries: readonly EditableEntry[],
  selected: ReadonlySet<string>,
  options: FindReplaceOptions,
): FindReplaceResult {
  const { find, replace, fields, regex = false, caseSensitive = false } = options;
  if (!find) return { entries: [...entries], changed: 0, replacements: 0, error: "Nothing to find." };

  let pattern: RegExp;
  try {
    const flags = caseSensitive ? "g" : "gi";
    pattern = regex
      ? new RegExp(find, flags)
      : new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
  } catch (error) {
    return {
      entries: [...entries],
      changed: 0,
      replacements: 0,
      error: `Bad regex: ${(error as Error).message}`,
    };
  }

  let replacements = 0;
  const substitute = (value: string): string => {
    pattern.lastIndex = 0;
    // A function replacer inserts the text literally, so a replacement
    // containing $& or $1 is not re-expanded against the match.
    return value.replace(pattern, () => {
      replacements += 1;
      return replace;
    });
  };

  const result = mapSelected(entries, selected, (entry) => {
    let touched = false;
    const next: EditableEntry = { ...entry };

    for (const field of fields) {
      if (field === "keywords") {
        const updated = entry.keywords.map(substitute);
        if (updated.some((value, index) => value !== entry.keywords[index])) {
          // An emptied keyword would make the entry unreachable, so drop blanks.
          next.keywords = updated.map((value) => value.trim()).filter(Boolean);
          touched = true;
        }
        continue;
      }
      const original = entry[field];
      if (typeof original !== "string") continue;
      const updated = substitute(original);
      if (updated !== original) {
        next[field] = updated;
        touched = true;
      }
    }

    return touched ? next : null;
  });

  return { ...result, replacements };
}

/* ── Diagnostics ─────────────────────────────────────────────────────────*/

export interface DuplicateKey {
  keyword: string;
  entries: { id: string; title: string }[];
}

/**
 * Keywords shared by more than one entry.
 *
 * Two entries on the same keyword both fire, which is usually not intended and
 * is invisible until the context is full of things that do not belong to the
 * scene. Matching is case-insensitive and trimmed because that is how the
 * matcher itself compares them.
 */
export function findDuplicateKeywords(entries: readonly EditableEntry[]): DuplicateKey[] {
  const byKeyword = new Map<string, { id: string; title: string }[]>();

  for (const entry of entries) {
    // A keyword repeated within one entry is not a clash with itself.
    const seen = new Set<string>();
    for (const keyword of entry.keywords) {
      const normalised = keyword.trim().toLowerCase();
      if (!normalised || seen.has(normalised)) continue;
      seen.add(normalised);
      const list = byKeyword.get(normalised) ?? [];
      list.push({ id: entry.id, title: entry.title });
      byKeyword.set(normalised, list);
    }
  }

  return [...byKeyword.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([keyword, list]) => ({ keyword, entries: list }))
    .sort((a, b) => b.entries.length - a.entries.length || a.keyword.localeCompare(b.keyword));
}

export interface LorebookStats {
  total: number;
  enabled: number;
  alwaysActive: number;
  /** Rough token estimate of what always-active entries cost every message. */
  alwaysActiveTokens: number;
  totalTokens: number;
  noKeywords: number;
  empty: number;
}

/**
 * The numbers that matter, led by the always-active cost.
 *
 * That figure is the one that catches the common disaster: a book where half
 * the entries are always on spends its budget before the scene begins, and
 * nothing in the UI otherwise says so.
 */
export function lorebookStats(entries: readonly EditableEntry[]): LorebookStats {
  const tokens = (text: string) => Math.ceil(text.length / 4);
  let alwaysActive = 0;
  let alwaysActiveTokens = 0;
  let totalTokens = 0;
  let enabled = 0;
  let noKeywords = 0;
  let empty = 0;

  for (const entry of entries) {
    const cost = tokens(entry.content);
    totalTokens += cost;
    if (entry.enabled) enabled += 1;
    if (entry.alwaysActive) {
      alwaysActive += 1;
      // Only enabled entries actually reach the prompt.
      if (entry.enabled) alwaysActiveTokens += cost;
    }
    if (entry.keywords.filter((k) => k.trim()).length === 0 && !entry.alwaysActive) noKeywords += 1;
    if (!entry.content.trim()) empty += 1;
  }

  return {
    total: entries.length,
    enabled,
    alwaysActive,
    alwaysActiveTokens,
    totalTokens,
    noKeywords,
    empty,
  };
}

/* ── Filtering ───────────────────────────────────────────────────────────*/

export interface EntryFilter {
  search?: string;
  strategy?: Strategy | "all";
  state?: "all" | "enabled" | "disabled";
}

export function filterEntries(
  entries: readonly EditableEntry[],
  filter: EntryFilter,
): EditableEntry[] {
  const needle = filter.search?.trim().toLowerCase() ?? "";
  return entries.filter((entry) => {
    if (filter.state === "enabled" && !entry.enabled) return false;
    if (filter.state === "disabled" && entry.enabled) return false;
    if (filter.strategy && filter.strategy !== "all" && detectStrategy(entry) !== filter.strategy) {
      return false;
    }
    if (!needle) return true;
    return (
      entry.title.toLowerCase().includes(needle) ||
      entry.content.toLowerCase().includes(needle) ||
      entry.keywords.some((keyword) => keyword.toLowerCase().includes(needle))
    );
  });
}
