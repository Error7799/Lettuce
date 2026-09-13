/**
 * Bulk editing a lorebook.
 *
 * The per-entry editor is the right tool for writing one entry and the wrong
 * one for the problems lorebooks actually have. Those arrive in bulk: a book
 * where two dozen entries are marked always-active and spend the context
 * before the scene starts, a name that changed across forty entries, two
 * entries quietly sharing a keyword and both firing. Fixing those one at a
 * time is why people live with them instead.
 *
 * The header leads with always-active token cost because that is the number
 * that catches the common disaster, and nothing else in the app says it out
 * loud. A real book in testing had 23 of 51 entries always on — roughly 13,700
 * tokens injected into every single message, including a private jet and a
 * yacht during a car journey.
 *
 * Nothing is written until Save. Every operation returns new entries, so undo
 * is keeping the previous array rather than replaying inverse edits.
 *
 * Literal strings rather than t() keys: adding keys would mean editing all 19
 * locale files, and an untranslated key reads worse than plain English.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Loader2, Save, Search, Undo2 } from "lucide-react";

import { cn, interactive, radius } from "../../design-tokens";
import { toast } from "../../components/toast";
import { storageBridge } from "../../../core/storage/files";
import {
  bulkSetEnabled,
  bulkSetNumber,
  bulkSetStrategy,
  detectStrategy,
  filterEntries,
  findDuplicateKeywords,
  findReplace,
  lorebookStats,
  type EditableEntry,
  type ReplaceField,
  type Strategy,
} from "../../../core/lorebook/editor";

const STRATEGY_LABEL: Record<Strategy, string> = {
  normal: "Keyword",
  constant: "Always on",
  selective: "Multi-key",
};

export function LorebookBulkEditor() {
  const navigate = useNavigate();
  const { lorebookId } = useParams();

  const [entries, setEntries] = useState<EditableEntry[]>([]);
  const [original, setOriginal] = useState<EditableEntry[]>([]);
  const [undoStack, setUndoStack] = useState<EditableEntry[][]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [strategyFilter, setStrategyFilter] = useState<Strategy | "all">("all");
  const [stateFilter, setStateFilter] = useState<"all" | "enabled" | "disabled">("all");

  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [replaceFields, setReplaceFields] = useState<ReplaceField[]>(["content"]);
  const [useRegex, setUseRegex] = useState(false);

  useEffect(() => {
    if (!lorebookId) return;
    void (async () => {
      try {
        const rows = (await storageBridge.lorebookEntriesList(lorebookId)) as EditableEntry[];
        setEntries(rows);
        setOriginal(rows.map((entry) => ({ ...entry })));
      } catch (error) {
        toast.error("Could not load entries", String(error));
      } finally {
        setLoading(false);
      }
    })();
  }, [lorebookId]);

  /** Push the current state before an edit, so one step back is always there. */
  const commit = useCallback(
    (next: EditableEntry[], changed: number, verb: string) => {
      if (changed === 0) {
        toast.success("Nothing to change", "Those entries already match.");
        return;
      }
      setUndoStack((stack) => [...stack.slice(-19), entries]);
      setEntries(next);
      toast.success(`${changed} ${changed === 1 ? "entry" : "entries"} ${verb}`, "Not saved yet.");
    },
    [entries],
  );

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      setEntries(stack[stack.length - 1]);
      return stack.slice(0, -1);
    });
  }, []);

  const visible = useMemo(
    () => filterEntries(entries, { search, strategy: strategyFilter, state: stateFilter }),
    [entries, search, strategyFilter, stateFilter],
  );
  const stats = useMemo(() => lorebookStats(entries), [entries]);
  const duplicates = useMemo(() => findDuplicateKeywords(entries), [entries]);
  const dirty = useMemo(
    () => JSON.stringify(entries) !== JSON.stringify(original),
    [entries, original],
  );

  const save = useCallback(async () => {
    setSaving(true);
    try {
      // Only what actually differs, so a large book does not rewrite every row.
      const byId = new Map(original.map((entry) => [entry.id, entry]));
      const changed = entries.filter(
        (entry) => JSON.stringify(byId.get(entry.id)) !== JSON.stringify(entry),
      );
      for (const entry of changed) {
        await storageBridge.lorebookEntryUpsert(entry);
      }
      setOriginal(entries.map((entry) => ({ ...entry })));
      setUndoStack([]);
      toast.success("Saved", `${changed.length} ${changed.length === 1 ? "entry" : "entries"} updated.`);
    } catch (error) {
      toast.error("Could not save", String(error));
    } finally {
      setSaving(false);
    }
  }, [entries, original]);

  const allVisibleSelected = visible.length > 0 && visible.every((entry) => selected.has(entry.id));

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-fg/40">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading entries…
      </div>
    );
  }

  const chip = (active: boolean) =>
    cn(
      "rounded-lg border px-2.5 py-1.5 text-xs font-medium",
      interactive.transition.fast,
      active
        ? "border-accent/40 bg-accent/20 text-accent"
        : "border-fg/10 bg-fg/5 text-fg/60 hover:bg-fg/10 hover:text-fg",
    );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-fg/10 px-4 py-3">
        <button
          type="button"
          onClick={() => navigate(`/library/lorebooks/${lorebookId}`)}
          className="flex items-center gap-1.5 text-xs text-fg/60 hover:text-fg"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Entries
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={undoStack.length === 0}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium",
              "border-fg/10 bg-fg/5 text-fg/60 hover:bg-fg/10 hover:text-fg",
              "disabled:cursor-not-allowed disabled:opacity-40",
            )}
          >
            <Undo2 className="h-3.5 w-3.5" /> Undo
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saving}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium",
              "border-accent/40 bg-accent/20 text-accent hover:bg-accent/25",
              "disabled:cursor-not-allowed disabled:opacity-40",
            )}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {dirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {/* The number that catches the common disaster. */}
        <div className={cn("border border-fg/10 bg-fg/5 px-4 py-3", radius.md)}>
          <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div>
              <div className="text-fg/40">Entries</div>
              <div className="text-sm font-semibold text-fg">{stats.total}</div>
            </div>
            <div>
              <div className="text-fg/40">Always on</div>
              <div
                className={cn(
                  "text-sm font-semibold",
                  stats.alwaysActive > stats.total / 3 ? "text-danger" : "text-fg",
                )}
              >
                {stats.alwaysActive}
              </div>
            </div>
            <div>
              <div className="text-fg/40">Cost every message</div>
              <div
                className={cn(
                  "text-sm font-semibold",
                  stats.alwaysActiveTokens > 4000 ? "text-danger" : "text-fg",
                )}
              >
                ~{stats.alwaysActiveTokens.toLocaleString()} tok
              </div>
            </div>
            <div>
              <div className="text-fg/40">Whole book</div>
              <div className="text-sm font-semibold text-fg">
                ~{stats.totalTokens.toLocaleString()} tok
              </div>
            </div>
          </div>
          {stats.alwaysActiveTokens > 4000 ? (
            <div className="mt-2 flex items-start gap-2 text-[11px] leading-relaxed text-danger">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {stats.alwaysActive} entries are injected into every message regardless of the
                scene. Select them below and set them to Keyword so they only fire when mentioned.
              </span>
            </div>
          ) : null}
          {stats.empty > 0 || stats.noKeywords > 0 ? (
            <div className="mt-2 text-[11px] text-fg/40">
              {stats.empty > 0 ? `${stats.empty} empty. ` : ""}
              {stats.noKeywords > 0 ? `${stats.noKeywords} can never fire (no keywords).` : ""}
            </div>
          ) : null}
        </div>

        {duplicates.length > 0 ? (
          <details className={cn("border border-fg/10 bg-fg/5 px-4 py-3", radius.md)}>
            <summary className="cursor-pointer text-xs font-medium text-fg/70">
              {duplicates.length} keyword{duplicates.length === 1 ? "" : "s"} shared by more than one
              entry
            </summary>
            <div className="mt-2 space-y-1">
              {duplicates.slice(0, 20).map((duplicate) => (
                <div key={duplicate.keyword} className="text-[11px] text-fg/50">
                  <span className="font-medium text-fg/70">{duplicate.keyword}</span> —{" "}
                  {duplicate.entries.map((entry) => entry.title).join(", ")}
                </div>
              ))}
            </div>
          </details>
        ) : null}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg/30" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, content, keywords"
              className={cn(
                "w-full border bg-fg/[0.03] py-2 pl-8 pr-3 text-xs text-fg",
                "border-fg/10 placeholder:text-fg/25 focus:border-accent/40 focus:outline-none",
                radius.md,
              )}
            />
          </div>
          {(["all", "constant", "selective", "normal"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStrategyFilter(value)}
              className={chip(strategyFilter === value)}
            >
              {value === "all" ? "All" : STRATEGY_LABEL[value]}
            </button>
          ))}
          {(["all", "enabled", "disabled"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStateFilter(value)}
              className={chip(stateFilter === value)}
            >
              {value === "all" ? "Any state" : value}
            </button>
          ))}
        </div>

        {/* Selection + bulk actions */}
        <div className={cn("border border-fg/10 bg-fg/5 px-4 py-3", radius.md)}>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setSelected(allVisibleSelected ? new Set() : new Set(visible.map((e) => e.id)))
              }
              className={chip(false)}
            >
              {allVisibleSelected ? "Clear" : `Select all ${visible.length} shown`}
            </button>
            <span className="text-xs text-fg/40">{selected.size} selected</span>
          </div>

          {selected.size > 0 ? (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-fg/40">Activation</span>
                {(["normal", "selective", "constant"] as const).map((strategy) => (
                  <button
                    key={strategy}
                    type="button"
                    onClick={() => {
                      const result = bulkSetStrategy(entries, selected, strategy);
                      commit(result.entries, result.changed, `set to ${STRATEGY_LABEL[strategy]}`);
                    }}
                    className={chip(false)}
                  >
                    {STRATEGY_LABEL[strategy]}
                  </button>
                ))}
                <span className="ml-2 text-[11px] text-fg/40">State</span>
                {([true, false] as const).map((enabled) => (
                  <button
                    key={String(enabled)}
                    type="button"
                    onClick={() => {
                      const result = bulkSetEnabled(entries, selected, enabled);
                      commit(result.entries, result.changed, enabled ? "enabled" : "disabled");
                    }}
                    className={chip(false)}
                  >
                    {enabled ? "Enable" : "Disable"}
                  </button>
                ))}
                <span className="ml-2 text-[11px] text-fg/40">Priority</span>
                {[0, 50, 100].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      const result = bulkSetNumber(entries, selected, "priority", value);
                      commit(result.entries, result.changed, `set to priority ${value}`);
                    }}
                    className={chip(false)}
                  >
                    {value}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-fg/10 pt-3">
                <input
                  value={find}
                  onChange={(event) => setFind(event.target.value)}
                  placeholder="Find"
                  className={cn(
                    "min-w-[120px] flex-1 border bg-fg/[0.03] px-3 py-2 text-xs text-fg",
                    "border-fg/10 placeholder:text-fg/25 focus:border-accent/40 focus:outline-none",
                    radius.md,
                  )}
                />
                <input
                  value={replace}
                  onChange={(event) => setReplace(event.target.value)}
                  placeholder="Replace with"
                  className={cn(
                    "min-w-[120px] flex-1 border bg-fg/[0.03] px-3 py-2 text-xs text-fg",
                    "border-fg/10 placeholder:text-fg/25 focus:border-accent/40 focus:outline-none",
                    radius.md,
                  )}
                />
                {(["content", "title", "keywords"] as const).map((field) => (
                  <button
                    key={field}
                    type="button"
                    onClick={() =>
                      setReplaceFields((fields) =>
                        fields.includes(field)
                          ? fields.filter((f) => f !== field)
                          : [...fields, field],
                      )
                    }
                    className={chip(replaceFields.includes(field))}
                  >
                    {field}
                  </button>
                ))}
                <button type="button" onClick={() => setUseRegex((v) => !v)} className={chip(useRegex)}>
                  regex
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const result = findReplace(entries, selected, {
                      find,
                      replace,
                      fields: replaceFields,
                      regex: useRegex,
                    });
                    if (result.error) {
                      toast.error("Could not replace", result.error);
                      return;
                    }
                    commit(
                      result.entries,
                      result.changed,
                      `changed (${result.replacements} replacements)`,
                    );
                  }}
                  disabled={!find || replaceFields.length === 0}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium",
                    "border-accent/40 bg-accent/20 text-accent hover:bg-accent/25",
                    "disabled:cursor-not-allowed disabled:opacity-40",
                  )}
                >
                  Replace
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Entries */}
        <div className="space-y-1">
          {visible.map((entry) => {
            const isSelected = selected.has(entry.id);
            const strategy = detectStrategy(entry);
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (next.has(entry.id)) next.delete(entry.id);
                    else next.add(entry.id);
                    return next;
                  })
                }
                className={cn(
                  "flex w-full items-center gap-3 border px-3 py-2 text-left",
                  radius.md,
                  isSelected ? "border-accent/40 bg-accent/10" : "border-fg/10 bg-fg/[0.03]",
                  interactive.transition.fast,
                )}
              >
                <span
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 rounded border",
                    isSelected ? "border-accent bg-accent" : "border-fg/25",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-fg">
                    {entry.title || "Untitled"}
                  </span>
                  <span className="block truncate text-[11px] text-fg/40">
                    {entry.keywords.join(", ") || "no keywords"}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 text-[10px] font-medium",
                    strategy === "constant" ? "text-danger" : "text-fg/40",
                  )}
                >
                  {STRATEGY_LABEL[strategy]}
                </span>
                {!entry.enabled ? (
                  <span className="shrink-0 text-[10px] text-fg/30">off</span>
                ) : null}
              </button>
            );
          })}
          {visible.length === 0 ? (
            <div className="py-8 text-center text-xs text-fg/40">Nothing matches those filters.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
