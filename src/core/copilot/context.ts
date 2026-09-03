/**
 * What Copilot is allowed to see.
 *
 * Copilot is an out-of-character assistant sitting beside a roleplay, so the
 * question "which messages does it get" is the whole feature rather than a
 * detail. Two modes, and the difference matters:
 *
 *   recent  the last N messages, following the chat as it grows
 *   picked  an explicit set of message ids, and nothing else — later messages
 *           must not quietly rejoin the context, which is the entire reason
 *           for hand-picking in the first place
 *
 * This module is pure so the selection logic can be tested without a model,
 * a session, or the Tauri runtime.
 */

import type {
  CopilotContextSelection,
  CopilotQuickPrompt,
  StoredMessage,
} from "../storage/schemas";

/** A roleplay message reduced to what Copilot needs to reason about it. */
export interface ContextLine {
  id: string;
  /** Display name for the speaker, already resolved. */
  speaker: string;
  content: string;
}

export interface BuildContextOptions {
  messages: readonly StoredMessage[];
  selection: CopilotContextSelection;
  characterName: string;
  userName: string;
}

/**
 * Messages that can meaningfully be shown to Copilot.
 *
 * System messages are the app talking to itself and scene messages are
 * staging rather than dialogue; neither is roleplay the assistant should
 * reason about. Empty content is dropped so a half-streamed or cleared
 * message does not occupy a context slot.
 */
export function isSelectableMessage(message: StoredMessage): boolean {
  if (message.role !== "user" && message.role !== "assistant") return false;
  return message.content.trim().length > 0;
}

/** Every message the picker should offer, oldest first. */
export function selectableMessages(
  messages: readonly StoredMessage[],
): StoredMessage[] {
  return messages.filter(isSelectableMessage);
}

function speakerFor(
  message: StoredMessage,
  characterName: string,
  userName: string,
): string {
  return message.role === "user" ? userName : characterName;
}

/**
 * Resolve a selection into the actual lines Copilot receives.
 *
 * Picked ids are returned in *chat* order rather than the order they were
 * clicked, because the assistant reads them as a transcript and a shuffled
 * one would misrepresent what happened. Ids that no longer exist are skipped
 * silently — a message can be deleted after being picked, and that should not
 * break the conversation.
 */
export function buildContextLines(options: BuildContextOptions): ContextLine[] {
  const { messages, selection, characterName, userName } = options;
  const usable = selectableMessages(messages);

  if (selection.mode === "none") return [];

  if (selection.mode === "picked") {
    const wanted = new Set(selection.pickedMessageIds);
    return usable
      .filter((message) => wanted.has(message.id))
      .map((message) => ({
        id: message.id,
        speaker: speakerFor(message, characterName, userName),
        content: message.content.trim(),
      }));
  }

  // "recent": the trailing slice. A count of 0 is a legitimate "no context".
  const count = Math.max(0, Math.min(selection.recentCount, usable.length));
  return usable.slice(usable.length - count).map((message) => ({
    id: message.id,
    speaker: speakerFor(message, characterName, userName),
    content: message.content.trim(),
  }));
}

/** Render the selected lines as the transcript block sent to the model. */
export function renderTranscript(lines: readonly ContextLine[]): string {
  return lines.map((line) => `${line.speaker}: ${line.content}`).join("\n\n");
}

/* ── Macros ──────────────────────────────────────────────────────────────
 * Quick prompts support the same two macros SillyTavern's do, because that
 * is what people will paste in from existing setups.
 * ---------------------------------------------------------------------- */

export interface MacroValues {
  char: string;
  user: string;
}

/**
 * Expand {{char}} and {{user}}, case-insensitively and tolerant of spaces.
 *
 * Replacement values are inserted through a function replacer so a name
 * containing `$&` or `$1` is treated as literal text rather than as a
 * substitution pattern.
 */
export function expandMacros(text: string, values: MacroValues): string {
  return text.replace(/\{\{\s*(char|user)\s*\}\}/gi, (_match, name: string) =>
    name.toLowerCase() === "char" ? values.char : values.user,
  );
}

export function expandQuickPrompt(
  prompt: CopilotQuickPrompt,
  values: MacroValues,
): string {
  return expandMacros(prompt.prompt, values);
}

/* ── System prompt ───────────────────────────────────────────────────────*/

/**
 * Copilot must not write the story.
 *
 * The original extension is emphatic about this and it is the reason the
 * feature is usable at all: an assistant that starts producing dialogue turns
 * into a second narrator and the roleplay loses its shape. The instruction is
 * stated plainly and repeated at the end, since a single mention at the top
 * of a long context is easy for a model to lose.
 */
export function buildSystemPrompt(characterName: string, userName: string): string {
  return [
    "You are Copilot, an out-of-character assistant helping the user with their roleplay.",
    "",
    `In this story, the character is "${characterName}" and the user plays "${userName}".`,
    "",
    "You are a sounding board: brainstorming, plot suggestions, scene analysis,",
    "character motivation, continuity checks, and answering questions about the story.",
    "",
    "You must NOT write the story. Never produce dialogue, narration, or actions",
    `for ${characterName}, for ${userName}, or for any other character, and never`,
    "continue the scene. If asked for a line, describe what it should convey instead",
    "of writing it in character.",
    "",
    "Speak directly to the user as a collaborator, out of character, always.",
  ].join("\n");
}

/**
 * The full user-facing turn: the transcript Copilot may see, then the ask.
 *
 * The transcript is delimited and labelled as reference material so the model
 * treats it as something to reason *about*. Without that framing, a block of
 * roleplay immediately before a question reads as a scene to continue, which
 * is the failure mode the system prompt is guarding against.
 */
export function buildTurnContent(transcript: string, question: string): string {
  if (!transcript.trim()) return question;
  return [
    "Here is the relevant part of the roleplay so far, for reference only:",
    "",
    "<<<TRANSCRIPT",
    transcript,
    "TRANSCRIPT",
    "",
    "Do not continue it. Answer this, out of character:",
    "",
    question,
  ].join("\n");
}
