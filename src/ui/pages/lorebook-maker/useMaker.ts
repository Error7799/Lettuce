/**
 * The Maker's state machine, kept out of the view.
 *
 * Building a lorebook from a wiki is three decisions in sequence — which wiki,
 * which story, which pages — and each one narrows the next. Holding that here
 * means the view can stay a rendering of the current step rather than a pile of
 * interdependent flags, and the scoping logic can be read without scrolling
 * past markup.
 */

import { useCallback, useMemo, useState } from "react";

import {
  entryFromPage,
  fetchPages,
  fetchThumbnails,
  listCategory,
  listSections,
  listWorks,
  resolveWiki,
  scopeWork,
  searchWiki,
  type ScopedPage,
  type ScrapedEntry,
  type WikiArc,
  type WikiSection,
  type WikiSite,
  type WikiWork,
} from "../../../core/wiki";

export type Step = "connect" | "work" | "browse";
export type Busy =
  | null
  | "resolving"
  | "works"
  | "scoping"
  | "sections"
  | "listing"
  | "building"
  | "saving";

/** A page offered in the picker, with whatever evidence we have for it. */
export interface Candidate {
  title: string;
  thumbnail?: string;
  /** Set when the page came from a scope scan rather than a plain category. */
  seeds?: number;
  of?: number;
  debut?: boolean;
}

export function useMaker() {
  const [step, setStep] = useState<Step>("connect");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const [site, setSite] = useState<WikiSite | null>(null);
  const [works, setWorks] = useState<WikiWork[]>([]);
  const [work, setWork] = useState<WikiWork | null>(null);
  const [arc, setArc] = useState<WikiArc | null>(null);
  const [sections, setSections] = useState<WikiSection[]>([]);

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [scoped, setScoped] = useState<ScopedPage[] | null>(null);
  const [picked, setPicked] = useState<Map<string, ScrapedEntry>>(new Map());

  /** How much of a story something must appear in to count as part of it. */
  const [minShare, setMinShare] = useState(0.12);
  /** How long each entry's text may run. */
  const [entryLength, setEntryLength] = useState<"brief" | "standard" | "full">("standard");

  const maxChars = entryLength === "brief" ? 600 : entryLength === "full" ? 2400 : 1200;

  const fail = (err: unknown) => setError(err instanceof Error ? err.message : String(err));

  /* ── Step 1: point at a wiki ───────────────────────────────────────── */

  const connect = useCallback(async (target: string) => {
    setError(null);
    setBusy("resolving");
    setProgress("Reading the wiki…");
    try {
      const resolved = await resolveWiki(target);
      setSite(resolved);
      setStep("work");

      setBusy("works");
      setProgress("Working out which stories this wiki covers…");
      const [found, foundSections] = await Promise.all([
        listWorks(resolved.api),
        listSections(resolved.api).catch(() => [] as WikiSection[]),
      ]);
      setWorks(found);
      setSections(foundSections);
    } catch (err) {
      fail(err);
      setStep("connect");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }, []);

  /* ── Step 2: choose a story ────────────────────────────────────────── */

  /**
   * Scan a work's own instalments and keep what they point at.
   *
   * This is the step that stops a franchise wiki handing back every cast at
   * once: the scan only ever reads chapters filed under *this* work, so a
   * spin-off's characters cannot appear in the parent's results, whatever the
   * shared categories say.
   */
  const chooseWork = useCallback(
    async (chosen: WikiWork, narrowTo?: WikiArc | null) => {
      if (!site) return;
      setWork(chosen);
      setArc(narrowTo ?? null);
      setScoped(null);
      setCandidates([]);
      setStep("browse");

      const categories = narrowTo ? [narrowTo.category] : chosen.instalmentCategories;
      if (categories.length === 0) {
        // A film or novel with no instalments to read. Browsing still works.
        setError(null);
        return;
      }

      setError(null);
      setBusy("scoping");
      setProgress(`Reading ${chosen.name}'s ${narrowTo ? narrowTo.name : chosen.instalmentKind.toLowerCase()}…`);
      try {
        const rows = await scopeWork(site.api, categories, { minShare });
        setScoped(rows);
        setProgress("Fetching art…");
        const thumbs = await fetchThumbnails(
          site.api,
          rows.slice(0, 120).map((r) => r.title),
        ).catch(() => ({}) as Record<string, string>);
        setCandidates(
          rows.map((row) => ({
            title: row.title,
            thumbnail: thumbs[row.title],
            seeds: row.seeds,
            of: row.of,
            debut: row.debut,
          })),
        );
      } catch (err) {
        fail(err);
      } finally {
        setBusy(null);
        setProgress(null);
      }
    },
    [site, minShare],
  );

  /** Re-run the scan at a different strictness without starting over. */
  const rescope = useCallback(
    async (share: number) => {
      setMinShare(share);
      if (work) await chooseWork(work, arc);
    },
    [work, arc, chooseWork],
  );

  /* ── Step 3: browse and pick ───────────────────────────────────────── */

  const openSection = useCallback(
    async (section: WikiSection) => {
      if (!site) return;
      setError(null);
      setScoped(null);
      setBusy("listing");
      setProgress(`Listing ${section.label.toLowerCase()}…`);
      try {
        const rows = await listCategory(site.api, section.category, 300);
        const thumbs = await fetchThumbnails(
          site.api,
          rows.slice(0, 120).map((r) => r.title),
        ).catch(() => ({}) as Record<string, string>);
        setCandidates(rows.map((row) => ({ title: row.title, thumbnail: thumbs[row.title] })));
      } catch (err) {
        fail(err);
      } finally {
        setBusy(null);
        setProgress(null);
      }
    },
    [site],
  );

  const search = useCallback(
    async (query: string) => {
      if (!site || !query.trim()) return;
      setError(null);
      setScoped(null);
      setBusy("listing");
      try {
        const rows = await searchWiki(site.api, query, 40);
        const thumbs = await fetchThumbnails(
          site.api,
          rows.map((r) => r.title),
        ).catch(() => ({}) as Record<string, string>);
        setCandidates(rows.map((row) => ({ title: row.title, thumbnail: thumbs[row.title] })));
      } catch (err) {
        fail(err);
      } finally {
        setBusy(null);
      }
    },
    [site],
  );

  const buildEntries = useCallback(
    async (titles: string[]) => {
      if (!site || titles.length === 0) return { added: 0, skipped: 0 };
      setBusy("building");
      try {
        const next = new Map(picked);
        let added = 0;
        let skipped = 0;
        // Batched so a fifty-page pick is a handful of requests, with the count
        // moving as they land rather than one long silence.
        for (let i = 0; i < titles.length; i += 20) {
          const slice = titles.slice(i, i + 20);
          setProgress(`Reading ${Math.min(i + slice.length, titles.length)} of ${titles.length}…`);
          const pages = await fetchPages(site.api, slice);
          for (const page of pages) {
            const entry = entryFromPage(page, maxChars);
            if (entry) {
              next.set(entry.title, entry);
              added += 1;
            } else {
              skipped += 1;
            }
          }
          setPicked(new Map(next));
        }
        return { added, skipped };
      } finally {
        setBusy(null);
        setProgress(null);
      }
    },
    [site, picked, maxChars],
  );

  const unpick = useCallback((title: string) => {
    setPicked((current) => {
      const next = new Map(current);
      next.delete(title);
      return next;
    });
  }, []);

  /** Back to the story list, keeping the wiki already resolved. */
  const backToWorks = useCallback(() => {
    setStep("work");
    setWork(null);
    setArc(null);
    setScoped(null);
    setCandidates([]);
    setError(null);
  }, []);

  const reset = useCallback(() => {
    setStep("connect");
    setSite(null);
    setWorks([]);
    setWork(null);
    setArc(null);
    setSections([]);
    setCandidates([]);
    setScoped(null);
    setError(null);
  }, []);

  const entries = useMemo(() => [...picked.values()], [picked]);

  /**
   * Roughly what this book will cost per message.
   *
   * Worth showing while picking rather than after saving: lorebook text is
   * injected into every reply, and Lettuce has a budget setting that silently
   * drops the lowest-priority entries once a book runs past it. Seeing the
   * number climb is what stops a two-hundred-entry franchise dump being built
   * in the first place.
   */
  const tokenEstimate = useMemo(
    () =>
      Math.round(
        entries.reduce((total, entry) => total + entry.content.length + entry.keywords.join("").length, 0) / 4,
      ),
    [entries],
  );

  /** Entries whose keys collide, which would fire two entries on one word. */
  const keyCollisions = useMemo(() => {
    const seen = new Map<string, string[]>();
    for (const entry of entries) {
      for (const key of entry.keywords) {
        const lower = key.toLowerCase();
        seen.set(lower, [...(seen.get(lower) ?? []), entry.title]);
      }
    }
    return [...seen.entries()].filter(([, titles]) => titles.length > 1);
  }, [entries]);

  return {
    step,
    busy,
    error,
    progress,
    site,
    works,
    work,
    arc,
    sections,
    candidates,
    scoped,
    picked,
    entries,
    tokenEstimate,
    keyCollisions,
    minShare,
    entryLength,
    setEntryLength,
    connect,
    chooseWork,
    rescope,
    openSection,
    search,
    buildEntries,
    unpick,
    backToWorks,
    setPicked,
    reset,
    setError,
  };
}
