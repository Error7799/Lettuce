/**
 * Presets — SillyTavern's generation-preset workflow, in LettuceAI's clothes.
 *
 * A preset is a named bundle of a whole generation setup: the sampler values
 * and the ordered prompt blocks together. You keep several and switch between
 * them, which is the part LettuceAI had no equivalent for — its sampler values
 * lived on a Model and its prompt blocks on a template, with no way to name or
 * swap the pair.
 *
 * Editing a preset's prompt blocks reuses the existing prompt-template editor
 * rather than duplicating it, so the two stay in step.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Copy,
  Download,
  FileJson,
  Layers,
  Pencil,
  Plus,
  Play,
  Regex,
  Star,
  Trash2,
  Upload,
} from "lucide-react";

import { cn, interactive, radius, typography } from "../../design-tokens";
import { toast } from "../../components/toast";
import { BottomMenu, MenuButton } from "../../components/BottomMenu";
import {
  createPreset,
  deletePreset,
  duplicatePreset,
  exportPreset,
  applyPreset,
  getActivePreset,
  listPresets,
  updatePreset,
} from "../../../core/presets/store";
import {
  PresetImportError,
  importSillyTavernPresetFromFile,
  summariseNotes,
} from "../../../core/presets/import";
import type { ImportNote } from "../../../core/presets/sillytavern";
import {
  exportRegexRules,
  importSillyTavernRegexJson,
} from "../../../core/presets/regex";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { getPromptTemplate } from "../../../core/prompts/service";
import type { Preset } from "../../../core/storage/schemas";

/** A one-line summary of the sampler values a preset actually sets. */
function describeGeneration(preset: Preset): string {
  const g = preset.generation ?? {};
  const parts: string[] = [];
  if (g.temperature != null) parts.push(`temp ${g.temperature}`);
  if (g.topP != null) parts.push(`top-p ${g.topP}`);
  if (g.topK != null) parts.push(`top-k ${g.topK}`);
  if (g.maxOutputTokens != null) parts.push(`${g.maxOutputTokens} out`);
  if (g.contextLength != null) parts.push(`${g.contextLength} ctx`);
  if (g.frequencyPenalty) parts.push(`freq ${g.frequencyPenalty}`);
  if (g.presencePenalty) parts.push(`pres ${g.presencePenalty}`);
  return parts.length > 0 ? parts.join(" · ") : "No sampler overrides";
}

interface PresetRow {
  preset: Preset;
  entryCount: number;
}

export function PresetsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<PresetRow[]>([]);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [menuFor, setMenuFor] = useState<Preset | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Preset | null>(null);
  const [report, setReport] = useState<{ title: string; notes: ImportNote[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const presets = await listPresets();
      // Block counts come from each preset's backing template.
      const withCounts = await Promise.all(
        presets.map(async (preset) => {
          const template = await getPromptTemplate(preset.promptTemplateId);
          return { preset, entryCount: template?.entries.length ?? 0 };
        }),
      );
      setRows(withCounts);
      const active = await getActivePreset();
      setDefaultId(active?.id ?? null);
    } catch (error) {
      toast.error("Could not load presets", String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleImportSillyTavern = useCallback(async () => {
    setBusy(true);
    try {
      const result = await importSillyTavernPresetFromFile();
      if (!result) return; // picker dismissed
      await load();

      const summary = summariseNotes(result.notes);
      toast.success(
        `Imported ${result.preset.name}`,
        `${result.entryCount} prompt blocks. ${summary.headline}`,
      );
      // Only surface the report when there is something to act on.
      if (summary.skipped.length > 0 || summary.warnings.length > 0) {
        setReport({
          title: result.preset.name,
          notes: [...summary.warnings, ...summary.skipped],
        });
      }
    } catch (error) {
      if (error instanceof PresetImportError) {
        toast.error("Import failed", error.message);
      } else {
        toast.error("Import failed", String(error));
      }
    } finally {
      setBusy(false);
    }
  }, [load]);

  const handleCreate = useCallback(async () => {
    setBusy(true);
    try {
      const preset = await createPreset({ name: `Preset ${rows.length + 1}` });
      await load();
      toast.success("Preset created", preset.name);
    } catch (error) {
      toast.error("Could not create preset", String(error));
    } finally {
      setBusy(false);
    }
  }, [rows.length, load]);

  const handleImportRegexes = useCallback(
    async (preset: Preset) => {
      try {
        const selected = await open({
          multiple: false,
          filters: [{ name: "Regex script", extensions: ["json"] }],
        });
        if (!selected || typeof selected !== "string") return;

        const result = importSillyTavernRegexJson(await readTextFile(selected));
        if (!result.ok) {
          toast.error("Could not import rules", result.error);
          return;
        }

        // Append rather than replace: a preset usually accumulates rules.
        const merged = [...(preset.regexes ?? []), ...result.rules];
        await updatePreset(preset.id, { regexes: merged });
        await load();

        const skippedNote = result.skipped > 0 ? ` ${result.skipped} entries skipped.` : "";
        toast.success(
          "Regex rules imported",
          `${result.rules.length} added to ${preset.name}.${skippedNote}`,
        );
      } catch (error) {
        toast.error("Could not import rules", String(error));
      }
    },
    [load],
  );

  const handleExport = useCallback(async (preset: Preset) => {
    try {
      const json = await exportPreset(preset.id);
      await navigator.clipboard.writeText(json);
      toast.success("Copied to clipboard", `${preset.name} exported as JSON.`);
    } catch (error) {
      toast.error("Could not export preset", String(error));
    }
  }, []);

  const empty = !loading && rows.length === 0;

  const actions = useMemo(
    () => (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleImportSillyTavern}
          disabled={busy}
          className={cn(
            "flex items-center gap-2 border px-3 py-2 text-sm font-medium",
            radius.md,
            "border-fg/10 bg-fg/5 text-fg/75 hover:border-fg/20 hover:bg-fg/10 hover:text-fg",
            "disabled:cursor-not-allowed disabled:opacity-45",
            interactive.transition.fast,
            interactive.active.scale,
          )}
        >
          <Upload className="h-4 w-4" />
          Import from SillyTavern
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={busy}
          className={cn(
            "flex items-center gap-2 border px-3 py-2 text-sm font-semibold",
            radius.md,
            "border-accent/40 bg-accent/20 text-accent hover:bg-accent/30",
            "disabled:cursor-not-allowed disabled:opacity-45",
            interactive.transition.fast,
            interactive.active.scale,
          )}
        >
          <Plus className="h-4 w-4" />
          New preset
        </button>
      </div>
    ),
    [busy, handleCreate, handleImportSillyTavern],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+96px)] lg:px-8 lg:pt-8 lg:pb-10">
        <div className="mx-auto w-full max-w-5xl space-y-5">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className={cn(typography.h1.size, typography.h1.weight, "tracking-tight text-fg")}>
                Presets
              </h1>
              <p className="mt-1 text-sm leading-relaxed text-fg/55">
                A preset bundles sampler settings with a set of prompt blocks. Switch preset and the
                whole generation setup changes at once.
              </p>
            </div>
            {actions}
          </header>

          {loading && <p className="text-sm text-fg/45">Loading…</p>}

          {empty && (
            <div
              className={cn(
                "flex flex-col items-center gap-3 border border-dashed px-6 py-12 text-center",
                radius.lg,
                "border-fg/12 bg-fg/[0.03]",
              )}
            >
              <Layers className="h-7 w-7 text-fg/25" />
              <div>
                <p className="text-sm font-medium text-fg/75">No presets yet</p>
                <p className="mt-1 text-sm text-fg/45">
                  Import a SillyTavern preset to bring an existing setup across, or start a new one.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 lg:gap-3">
            {rows.map(({ preset, entryCount }) => {
              const isDefault = preset.id === defaultId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setMenuFor(preset)}
                  className={cn(
                    "group flex w-full flex-col gap-2 border p-4 text-left",
                    radius.lg,
                    isDefault
                      ? "border-accent/40 bg-accent/[0.07]"
                      : "border-fg/10 bg-fg/5 hover:border-fg/25 hover:bg-fg/10",
                    interactive.transition.default,
                    interactive.active.scale,
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[15px] font-semibold tracking-tight text-fg">
                        {preset.name}
                      </span>
                      {isDefault && (
                        <span className="flex shrink-0 items-center gap-1 rounded-full border border-accent/40 bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
                          <Star className="h-2.5 w-2.5" />
                          Active
                        </span>
                      )}
                    </div>
                    {preset.source === "sillytavern" && (
                      <span className="shrink-0 rounded-full border border-fg/15 bg-fg/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-fg/50">
                        SillyTavern
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-fg/50">{describeGeneration(preset)}</p>

                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg/40">
                    <span className="flex items-center gap-1.5">
                      <FileJson className="h-3.5 w-3.5" />
                      {entryCount} prompt {entryCount === 1 ? "block" : "blocks"}
                    </span>
                    {(preset.regexes?.length ?? 0) > 0 && (
                      <span className="flex items-center gap-1.5">
                        <Regex className="h-3.5 w-3.5" />
                        {preset.regexes.length} regex{" "}
                        {preset.regexes.length === 1 ? "rule" : "rules"}
                      </span>
                    )}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Row actions */}
      {menuFor && (
        <BottomMenu isOpen onClose={() => setMenuFor(null)} title={menuFor.name}>
          <MenuButton
            icon={<Pencil className="h-4 w-4" />}
            title="Edit prompt blocks"
            description="Open this preset's prompts in the editor"
            onClick={() => {
              const target = menuFor.promptTemplateId;
              setMenuFor(null);
              navigate(`/settings/prompts/${target}`);
            }}
          />
          <MenuButton
            icon={<Play className="h-4 w-4" />}
            title={menuFor.id === defaultId ? "Already active" : "Use this preset"}
            description="Generation uses its samplers and prompt blocks"
            disabled={menuFor.id === defaultId}
            color="from-emerald-500 to-emerald-600"
            onClick={async () => {
              const target = menuFor;
              setMenuFor(null);
              try {
                await applyPreset(target.id);
                await load();
                toast.success("Preset applied", `${target.name} is now driving generation.`);
              } catch (error) {
                toast.error("Could not apply preset", String(error));
              }
            }}
          />
          <MenuButton
            icon={<Regex className="h-4 w-4" />}
            title="Import regex rules"
            description={
              (menuFor.regexes?.length ?? 0) > 0
                ? `${menuFor.regexes.length} already in this preset`
                : "Add SillyTavern find/replace scripts"
            }
            color="from-purple-500 to-purple-600"
            onClick={() => {
              const target = menuFor;
              setMenuFor(null);
              void handleImportRegexes(target);
            }}
          />
          <MenuButton
            icon={<Download className="h-4 w-4" />}
            title="Export regex rules"
            description="Copy this preset's rules as SillyTavern JSON"
            disabled={(menuFor.regexes?.length ?? 0) === 0}
            onClick={async () => {
              const target = menuFor;
              setMenuFor(null);
              await navigator.clipboard.writeText(exportRegexRules(target.regexes ?? []));
              toast.success("Copied to clipboard", `${target.regexes.length} rules exported.`);
            }}
          />
          <MenuButton
            icon={<Copy className="h-4 w-4" />}
            title="Duplicate"
            description="Copy the settings and the prompt blocks"
            onClick={async () => {
              const target = menuFor;
              setMenuFor(null);
              const copy = await duplicatePreset(target.id);
              await load();
              if (copy) toast.success("Preset duplicated", copy.name);
            }}
          />
          <MenuButton
            icon={<Download className="h-4 w-4" />}
            title="Export"
            description="Copy this preset to the clipboard as JSON"
            onClick={() => {
              const target = menuFor;
              setMenuFor(null);
              void handleExport(target);
            }}
          />
          <MenuButton
            icon={<Trash2 className="h-4 w-4" />}
            title="Delete"
            description="Remove this preset and its prompt blocks"
            color="from-red-500 to-red-600"
            onClick={() => {
              const target = menuFor;
              setMenuFor(null);
              setConfirmDelete(target);
            }}
          />
        </BottomMenu>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <BottomMenu isOpen onClose={() => setConfirmDelete(null)} title={`Delete ${confirmDelete.name}?`}>
          <p className="px-3 pb-2 text-sm leading-relaxed text-fg/55">
            This removes the preset and the prompt blocks it owns. Chats already using it keep the
            prompts they were started with.
          </p>
          <MenuButton
            icon={<Trash2 className="h-4 w-4" />}
            title="Delete preset"
            color="from-red-500 to-red-600"
            onClick={async () => {
              const target = confirmDelete;
              setConfirmDelete(null);
              await deletePreset(target.id);
              await load();
              toast.success("Preset deleted", target.name);
            }}
          />
        </BottomMenu>
      )}

      {/* What the importer could not carry across */}
      {report && (
        <BottomMenu isOpen onClose={() => setReport(null)} title={`Import report: ${report.title}`}>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto px-3 pb-3">
            {report.notes.map((note, index) => (
              <div
                key={`${note.subject}-${index}`}
                className={cn(
                  "border px-3 py-2",
                  radius.md,
                  note.kind === "warning"
                    ? "border-warning/30 bg-warning/10"
                    : "border-fg/10 bg-fg/5",
                )}
              >
                <p className="text-xs font-semibold text-fg/80">{note.subject}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-fg/55">{note.message}</p>
              </div>
            ))}
          </div>
        </BottomMenu>
      )}
    </div>
  );
}
