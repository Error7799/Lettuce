/**
 * Lorebook Maker — build entries from public wikis, without an LLM.
 *
 * Ported from the standalone Lorebook Studio, keeping the shape that made it
 * work: a slim bar to say where to look, the pictures filling the middle, and
 * what you have collected kept to one side. The posters *are* the page — a
 * character grid is the one genuinely visual thing here and putting it behind a
 * click was the original's own regret.
 *
 * Three steps, each narrowing the next: which wiki, which story, which pages.
 * The middle step is the one that matters most on a franchise wiki, because
 * `Category:Characters` mixes every cast it has ever documented.
 */

import { useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronLeft,
  Coins,
  Globe,
  Loader2,
  Search,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";

import { cn, interactive } from "../../design-tokens";
import { toast } from "../../components/toast";
import { PageHeader } from "../../components/App";
import { storageBridge } from "../../../core/storage/files";
import { useMaker } from "./useMaker";
import type { WikiWork } from "../../../core/wiki";

export function LorebookMakerPage() {
  const maker = useMaker();
  const [target, setTarget] = useState("");
  const [query, setQuery] = useState("");
  const [books, setBooks] = useState<{ id: string; name: string }[]>([]);
  const [bookId, setBookId] = useState("");
  const [newBookName, setNewBookName] = useState("");
  const [loadedBooks, setLoadedBooks] = useState(false);

  const working = maker.busy !== null;

  if (!loadedBooks) {
    setLoadedBooks(true);
    void storageBridge
      .lorebooksList()
      .then((rows) => setBooks(rows.map((r: any) => ({ id: r.id, name: r.name }))))
      .catch(() => setBooks([]));
  }

  const save = async () => {
    if (maker.entries.length === 0) return;
    try {
      let id = bookId;
      if (!id) {
        const name = newBookName.trim() || maker.work?.name || maker.site?.name || "Scraped lorebook";
        const created: any = await storageBridge.lorebookUpsert({
          id: crypto.randomUUID(),
          name,
          description: maker.site?.base ? `Built from ${maker.site.base}` : "Built from a wiki",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        id = created?.id ?? created;
        setBooks((current) => [...current, { id, name }]);
      }
      const now = Date.now();
      let order = 0;
      for (const entry of maker.entries) {
        await storageBridge.lorebookEntryUpsert({
          id: crypto.randomUUID(),
          lorebookId: id,
          title: entry.title,
          enabled: true,
          alwaysActive: false,
          keywords: entry.keywords,
          caseSensitive: false,
          content: entry.content,
          priority: 0,
          displayOrder: order++,
          createdAt: now,
          updatedAt: now,
        });
      }
      toast.success(`Saved ${maker.entries.length} entries`, "Open it in Library to fine-tune.");
      maker.setPicked(new Map());
      setBookId(id);
      setNewBookName("");
    } catch (err) {
      toast.error("Could not save", String(err));
    }
  };

  return (
    <div className="flex h-full flex-col bg-surface">
      <PageHeader
        title="Lorebook Maker"
        meta={maker.work ? `${maker.site?.name} · ${maker.work.name}` : maker.site?.name}
      />

      {maker.progress ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-fg/10 px-4 py-2 text-[11px] text-fg/50">
          <Loader2 className="h-3 w-3 animate-spin text-accent" />
          {maker.progress}
        </div>
      ) : null}

      {maker.error ? (
        <div className="shrink-0 border-b border-danger/20 bg-danger/5 px-4 py-2 text-[11px] leading-relaxed text-danger">
          {maker.error}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="min-h-0 flex-1 overflow-y-auto">
          {maker.step === "connect" ? (
            <ConnectStep
              target={target}
              setTarget={setTarget}
              busy={working}
              onConnect={() => void maker.connect(target)}
            />
          ) : null}

          {maker.step === "work" ? (
            <WorkStep
              works={maker.works}
              busy={working}
              onPick={(work) => void maker.chooseWork(work)}
              onBack={maker.reset}
            />
          ) : null}

          {maker.step === "browse" ? (
            <BrowseStep maker={maker} query={query} setQuery={setQuery} />
          ) : null}
        </section>

        <Collected maker={maker} books={books} bookId={bookId} setBookId={setBookId}
          newBookName={newBookName} setNewBookName={setNewBookName} onSave={() => void save()} />
      </div>
    </div>
  );
}

/* ── Step 1 ──────────────────────────────────────────────────────────────*/

function ConnectStep({
  target,
  setTarget,
  busy,
  onConnect,
}: {
  target: string;
  setTarget: (value: string) => void;
  busy: boolean;
  onConnect: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <Wand2 className="h-8 w-8 text-accent" />
        <h2 className="text-base font-semibold text-fg">Build a lorebook from a wiki</h2>
        <p className="text-[11px] leading-relaxed text-fg/45">
          Point this at a Fandom wiki or Wikipedia and it reads the pages straight from the
          source. No AI, no API key, nothing sent anywhere.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && onConnect()}
          placeholder="jujutsu-kaisen, or paste any wiki link"
          className={cn(
            "min-w-0 flex-1 rounded-lg border bg-fg/[0.03] px-3 py-2 text-xs text-fg",
            "border-fg/10 placeholder:text-fg/25 focus:border-accent/40 focus:outline-none",
          )}
        />
        <button
          type="button"
          onClick={onConnect}
          disabled={busy || !target.trim()}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium",
            "border-accent/40 bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-40",
            interactive.transition.fast,
          )}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
          Open
        </button>
      </div>

      <p className="mt-3 text-center text-[10px] text-fg/30">
        Try: jujutsu-kaisen · en.wikipedia.org · arcane.fandom.com
      </p>
    </div>
  );
}

/* ── Step 2 ──────────────────────────────────────────────────────────────*/

/**
 * Which story out of the franchise.
 *
 * A wiki documents everything its franchise has ever produced, and picking one
 * story here is what stops the lorebook being a dump of all of them. The main
 * series is listed first because it is almost always what people mean.
 */
/**
 * Everything on the wiki, with no story scoping.
 *
 * Always offered, and on plenty of wikis it is the only thing that can be:
 * scoping is derived from a story's chapters or episodes, and a film wiki has
 * neither. The Moana wiki has no instalment categories at all, so a picker that
 * only listed derived works showed an empty page and stranded the user with
 * nowhere to go.
 */
const WHOLE_WIKI: WikiWork = {
  name: "Everything on this wiki",
  kind: "other",
  instalmentCategories: [],
  instalmentKind: "",
  instalmentCount: 0,
  arcs: [],
};

function WorkStep({
  works,
  busy,
  onPick,
  onBack,
}: {
  works: WikiWork[];
  busy: boolean;
  onPick: (work: WikiWork) => void;
  onBack: () => void;
}) {
  const scannable = works.filter((work) => work.instalmentCategories.length > 0);

  return (
    <div className="px-4 py-4">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 flex items-center gap-1 text-[11px] text-fg/45 hover:text-fg"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Pick a different wiki
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-fg">What is this lorebook about?</h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-fg/45">
            {scannable.length > 0
              ? `This wiki covers ${scannable.length} ${scannable.length === 1 ? "story" : "separate stories"} that can be scoped. Pick one, or take the whole wiki.`
              : busy
                ? "Looking for separate stories…"
                : "No separate stories to scope here, so browse the whole wiki instead."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onPick(WHOLE_WIKI)}
          className={cn(
            "shrink-0 rounded-lg border px-3 py-2 text-xs font-medium",
            "border-accent/40 bg-accent/20 text-accent hover:bg-accent/30",
            interactive.transition.fast,
          )}
        >
          Everything on this wiki →
        </button>
      </div>

      {busy && works.length === 0 ? (
        <div className="grid grid-cols-2 gap-3 pt-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="aspect-[3/4] animate-pulse rounded-xl bg-fg/5" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 pt-4 sm:grid-cols-3 lg:grid-cols-4">
          {works.map((work) => (
            <button
              key={`${work.kind}-${work.name}`}
              type="button"
              onClick={() => onPick(work)}
              className={cn(
                "group relative flex aspect-[3/4] flex-col justify-end overflow-hidden rounded-xl border text-left",
                "border-fg/10 bg-fg/5 hover:border-accent/40",
                interactive.transition.fast,
              )}
            >
              {work.thumbnail ? (
                <img
                  src={work.thumbnail}
                  alt=""
                  loading="lazy"
                  // Fandom's image host answers 404 to any request carrying a
                  // foreign Referer, and a webview sends one by default — so
                  // every poster came back broken until this was suppressed.
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 h-full w-full object-cover opacity-70 group-hover:opacity-90"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <BookOpen className="h-7 w-7 text-fg/15" />
                </div>
              )}
              <div className="relative bg-gradient-to-t from-black/85 to-transparent px-2.5 pb-2.5 pt-6">
                <div className="text-xs font-semibold leading-tight text-white">{work.name}</div>
                <div className="mt-0.5 text-[10px] text-white/60">
                  {work.kind === "series"
                    ? `Main series · ${work.arcs.length} ${work.arcs.length === 1 ? "arc" : "arcs"}`
                    : work.instalmentCount > 0
                      ? `${work.instalmentCount} ${plural(work.instalmentKind, work.instalmentCount)}`
                      : "Browse only"}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Step 3 ──────────────────────────────────────────────────────────────*/

function BrowseStep({
  maker,
  query,
  setQuery,
}: {
  maker: ReturnType<typeof useMaker>;
  query: string;
  setQuery: (value: string) => void;
}) {
  const working = maker.busy !== null;
  const allPicked = maker.candidates.every((c) => maker.picked.has(c.title));

  return (
    <div className="px-4 py-3">
      <button
        type="button"
        onClick={maker.backToWorks}
        className="mb-3 flex items-center gap-1 text-[11px] text-fg/45 hover:text-fg"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> {maker.work?.name}
      </button>

      {/* Arcs — a narrower scope than the whole work. */}
      {maker.work && maker.work.arcs.length > 0 ? (
        <div className="mb-3">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-fg/35">
            Narrow to an arc
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Chip active={!maker.arc} onClick={() => void maker.chooseWork(maker.work!, null)}>
              Whole series
            </Chip>
            {maker.work.arcs.map((arcOption) => (
              <Chip
                key={arcOption.category}
                active={maker.arc?.category === arcOption.category}
                onClick={() => void maker.chooseWork(maker.work!, arcOption)}
              >
                {arcOption.name} <span className="opacity-50">{arcOption.count}</span>
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      {/* Sections — the wiki's own filing, for anything the scan missed. */}
      {maker.sections.length > 0 ? (
        <div className="mb-3">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-fg/35">
            Or browse the whole wiki
          </div>
          <div className="flex flex-wrap gap-1.5">
            {maker.sections.map((section) => (
              <Chip key={section.category} onClick={() => void maker.openSection(section)}>
                {section.label} <span className="opacity-50">{section.count}</span>
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mb-3 flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && void maker.search(query)}
          placeholder="Search this wiki"
          className={cn(
            "min-w-0 flex-1 rounded-lg border bg-fg/[0.03] px-3 py-2 text-xs text-fg",
            "border-fg/10 placeholder:text-fg/25 focus:border-accent/40 focus:outline-none",
          )}
        />
        <button
          type="button"
          onClick={() => void maker.search(query)}
          disabled={working || !query.trim()}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium",
            "border-fg/10 bg-fg/5 text-fg/70 hover:bg-fg/10 disabled:opacity-40",
            interactive.transition.fast,
          )}
        >
          <Search className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* How strict the scope scan was. Exposed because the right answer differs
          per wiki, and a slider beats re-running the whole flow to find out. */}
      {maker.scoped ? (
        <div className="mb-3 rounded-xl border border-fg/10 bg-fg/5 px-3.5 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-medium text-fg/75">
              {maker.scoped.length} in scope
            </div>
            <div className="text-[10px] text-fg/40">
              appears in {Math.round(maker.minShare * 100)}%+ of instalments
            </div>
          </div>
          <input
            type="range"
            min={2}
            max={50}
            value={Math.round(maker.minShare * 100)}
            onChange={(event) => void maker.rescope(Number(event.target.value) / 100)}
            disabled={working}
            className="mt-2 w-full accent-accent"
          />
          <p className="mt-1 text-[10px] leading-relaxed text-fg/35">
            Lower brings in background characters; higher keeps only the core cast.
          </p>
        </div>
      ) : null}

      {maker.candidates.length > 0 ? (
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-fg/35">
            {maker.candidates.length} pages
          </span>
          <button
            type="button"
            onClick={() =>
              void maker
                .buildEntries(
                  maker.candidates.filter((c) => !maker.picked.has(c.title)).map((c) => c.title),
                )
                .then((r) =>
                  r &&
                  toast.success(
                    `Added ${r.added}`,
                    r.skipped ? `${r.skipped} had no usable summary.` : "",
                  ),
                )
            }
            disabled={working || allPicked}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-[11px] font-medium",
              "border-fg/10 bg-fg/5 text-fg/60 hover:bg-fg/10 disabled:opacity-40",
              interactive.transition.fast,
            )}
          >
            Add all
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {maker.candidates.map((candidate) => {
          const chosen = maker.picked.has(candidate.title);
          return (
            <button
              key={candidate.title}
              type="button"
              onClick={() =>
                chosen ? maker.unpick(candidate.title) : void maker.buildEntries([candidate.title])
              }
              disabled={working}
              className={cn(
                "group relative flex aspect-[3/4] flex-col justify-end overflow-hidden rounded-xl border text-left",
                chosen ? "border-accent/60" : "border-fg/10 hover:border-fg/25",
                "bg-fg/5",
                interactive.transition.fast,
              )}
            >
              {candidate.thumbnail ? (
                <img
                  src={candidate.thumbnail}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className={cn(
                    "absolute inset-0 h-full w-full object-cover",
                    chosen ? "opacity-90" : "opacity-70 group-hover:opacity-90",
                  )}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-lg font-semibold text-fg/15">
                  {candidate.title.slice(0, 1)}
                </div>
              )}

              <div
                className={cn(
                  "absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border",
                  chosen ? "border-accent bg-accent text-black" : "border-white/40 bg-black/40",
                )}
              >
                {chosen ? <Check className="h-3 w-3" /> : null}
              </div>

              {/* Across a whole-series scan almost everyone debuts in some
                  instalment, so flagging every one of them said nothing. The
                  badge now marks only the entries the debut actually rescued —
                  too thinly linked to clear the threshold on their own. */}
              {candidate.debut && candidate.of !== undefined && candidate.seeds !== undefined
                && candidate.seeds < Math.max(1, Math.ceil(candidate.of * maker.minShare)) ? (
                <div className="absolute left-1.5 top-1.5 rounded bg-info/80 px-1.5 py-0.5 text-[9px] font-semibold text-black">
                  DEBUTS HERE
                </div>
              ) : null}

              <div className="relative bg-gradient-to-t from-black/85 to-transparent px-2 pb-2 pt-6">
                <div className="truncate text-[11px] font-semibold text-white">{candidate.title}</div>
                {candidate.seeds !== undefined && candidate.of ? (
                  <div className="mt-0.5 text-[9px] text-white/55">
                    in {candidate.seeds} of {candidate.of} read
                  </div>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      {maker.candidates.length === 0 && !working ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <Sparkles className="h-7 w-7 text-fg/20" />
          <p className="max-w-xs text-[11px] leading-relaxed text-fg/40">
            Nothing here yet. Narrow to an arc, browse a category, or search the wiki.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** "1 chapters" reads as a bug even when the count is right. */
function plural(kind: string, count: number): string {
  const lower = kind.toLowerCase();
  return count === 1 ? lower.replace(/s$/, "") : lower;
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-2.5 py-1.5 text-[11px] font-medium",
        interactive.transition.fast,
        active
          ? "border-accent/40 bg-accent/20 text-accent"
          : "border-fg/10 bg-fg/5 text-fg/60 hover:bg-fg/10 hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

/* ── The collected book ──────────────────────────────────────────────────*/

function Collected({
  maker,
  books,
  bookId,
  setBookId,
  newBookName,
  setNewBookName,
  onSave,
}: {
  maker: ReturnType<typeof useMaker>;
  books: { id: string; name: string }[];
  bookId: string;
  setBookId: (value: string) => void;
  newBookName: string;
  setNewBookName: (value: string) => void;
  onSave: () => void;
}) {
  const working = maker.busy !== null;

  return (
    <aside className="flex min-h-0 shrink-0 flex-col border-t border-fg/10 lg:w-80 lg:border-l lg:border-t-0">
      <div className="shrink-0 px-4 py-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.25em] text-fg/35">
          Lorebook — {maker.entries.length} {maker.entries.length === 1 ? "entry" : "entries"}
        </h2>
        {maker.entries.length > 0 ? (
          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-fg/40">
            <Coins className="h-3 w-3" />
            about {maker.tokenEstimate.toLocaleString()} tokens per reply
          </div>
        ) : null}
      </div>

      {/* Two keys firing one word means two entries injected for one mention. */}
      {maker.keyCollisions.length > 0 ? (
        <div className="mx-4 mb-2 flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/5 px-2.5 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <div className="min-w-0 text-[10px] leading-relaxed text-fg/55">
            {maker.keyCollisions.length} keyword{maker.keyCollisions.length === 1 ? "" : "s"} used by
            more than one entry — e.g. <span className="text-fg/75">{maker.keyCollisions[0][0]}</span>.
            Both fire together.
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        {maker.entries.length === 0 ? (
          <p className="pb-4 text-[11px] leading-relaxed text-fg/35">
            Tick a page to build an entry. Keys come from the page name and the text is trimmed to
            the opening summary.
          </p>
        ) : (
          <div className="space-y-2 pb-4">
            {maker.entries.map((entry) => (
              <div key={entry.title} className="rounded-xl border border-fg/10 bg-fg/5 px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-fg">{entry.title}</div>
                    <div className="mt-0.5 truncate text-[10px] text-fg/40">
                      {entry.keywords.join(" · ")}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => maker.unpick(entry.title)}
                    className="shrink-0 text-fg/30 hover:text-danger"
                    aria-label={`Remove ${entry.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-fg/50">
                  {entry.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-2 border-t border-fg/10 px-4 py-3">
        <div className="flex gap-1.5">
          {(["brief", "standard", "full"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => maker.setEntryLength(option)}
              className={cn(
                "flex-1 rounded-lg border px-2 py-1.5 text-[10px] font-medium capitalize",
                interactive.transition.fast,
                maker.entryLength === option
                  ? "border-accent/40 bg-accent/20 text-accent"
                  : "border-fg/10 bg-fg/5 text-fg/55 hover:bg-fg/10",
              )}
            >
              {option}
            </button>
          ))}
        </div>

        {/* Infobox extraction. Literal labels rather than t() keys: adding them
            would mean touching all 19 locale files, and an untranslated key
            reads worse than English. */}
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => maker.setEnrich(!maker.enrich)}
            title="Pull age, species, status and the names the cast actually uses out of the infobox"
            className={cn(
              "flex-1 rounded-lg border px-2 py-1.5 text-[10px] font-medium",
              interactive.transition.fast,
              maker.enrich
                ? "border-accent/40 bg-accent/20 text-accent"
                : "border-fg/10 bg-fg/5 text-fg/55 hover:bg-fg/10",
            )}
          >
            Infobox facts
          </button>
          <button
            type="button"
            onClick={() => maker.setIncludeSpoilers(!maker.includeSpoilers)}
            disabled={!maker.enrich}
            title="Include status, fate and later affiliations — these give away how the story ends"
            className={cn(
              "flex-1 rounded-lg border px-2 py-1.5 text-[10px] font-medium",
              interactive.transition.fast,
              "disabled:cursor-not-allowed disabled:opacity-40",
              maker.includeSpoilers
                ? "border-accent/40 bg-accent/20 text-accent"
                : "border-fg/10 bg-fg/5 text-fg/55 hover:bg-fg/10",
            )}
          >
            Spoilers
          </button>
        </div>

        <select
          value={bookId}
          onChange={(event) => setBookId(event.target.value)}
          className={cn(
            "w-full rounded-lg border bg-fg/[0.03] px-3 py-2 text-xs text-fg",
            "border-fg/10 focus:border-accent/40 focus:outline-none",
          )}
        >
          <option value="">New lorebook…</option>
          {books.map((book) => (
            <option key={book.id} value={book.id}>
              {book.name}
            </option>
          ))}
        </select>

        {!bookId ? (
          <input
            value={newBookName}
            onChange={(event) => setNewBookName(event.target.value)}
            placeholder={maker.work?.name ?? "Name the new lorebook"}
            className={cn(
              "w-full rounded-lg border bg-fg/[0.03] px-3 py-2 text-xs text-fg",
              "border-fg/10 placeholder:text-fg/25 focus:border-accent/40 focus:outline-none",
            )}
          />
        ) : null}

        <button
          type="button"
          onClick={onSave}
          disabled={working || maker.entries.length === 0}
          className={cn(
            "flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium",
            "border-accent/40 bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-40",
            interactive.transition.fast,
          )}
        >
          <BookOpen className="h-3.5 w-3.5" />
          Save {maker.entries.length > 0 ? maker.entries.length : ""} to lorebook
        </button>
      </div>
    </aside>
  );
}
