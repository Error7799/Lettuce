/**
 * Bionic reading — ported from the SillyTavern ADHD Reader extension.
 *
 * The idea: bold the leading few characters of each word. The eye latches onto
 * the bolded stem and fills in the rest, which makes long passages easier to
 * hold on to. How much gets bolded is the "intensity".
 *
 * The original runs as a DOM pass over `.mes_text`; LettuceAI renders messages
 * through React, so this module keeps the *decision* pure — segment the text,
 * work out how much of each token to bold — and leaves the DOM work to the
 * component that calls it. That also makes it testable outside the app.
 *
 * The ratios below are lifted verbatim from the extension so the reading feel
 * matches. What is deliberately simplified: the original carries a Chinese
 * dictionary and an "anchor" heuristic for spacing out CJK emphasis. This port
 * segments CJK by character run and bolds the leading character of each run,
 * which is the same idea without the dictionary.
 */

export type BionicIntensity = "off" | "light" | "medium" | "strong";

/** One piece of the original text, with how many leading chars to bold. */
export interface BionicToken {
  text: string;
  /** Characters to bold from the start. 0 means render as-is. */
  bold: number;
}

const CJK = /[㐀-鿿]/;
const CJK_RUN = /^[㐀-鿿]+$/;
const LATIN_WORD = /^[A-Za-z0-9][A-Za-z0-9'-]*$/;

export function isEnglishWord(token: string): boolean {
  return LATIN_WORD.test(token);
}

export function isCjkRun(token: string): boolean {
  return CJK_RUN.test(token);
}

/**
 * How many leading characters of a Latin word to bold.
 * Ratios are the extension's, unchanged.
 */
export function getBoldLength(token: string, intensity: BionicIntensity): number {
  const len = token.length;
  if (len <= 1) return 0;
  if (!isEnglishWord(token)) return 0;

  switch (intensity) {
    case "light":
      if (len <= 3) return 1;
      if (len <= 5) return 2;
      return Math.min(len - 1, Math.ceil(len * 0.46));
    case "medium":
      if (len <= 3) return 1;
      if (len <= 5) return 2;
      return Math.min(len - 1, Math.ceil(len * 0.55));
    case "strong":
      if (len <= 2) return 1;
      if (len <= 4) return 2;
      return Math.min(len - 1, Math.ceil(len * 0.65));
    default:
      return 0;
  }
}

/**
 * A CJK run has no spaces to break on, so the leading character of the run
 * carries the emphasis. Longer runs get two, which keeps a wall of characters
 * from reading as one undifferentiated block.
 */
export function getCjkBoldLength(token: string, intensity: BionicIntensity): number {
  if (intensity === "off") return 0;
  const len = token.length;
  if (len <= 1) return 0;
  if (intensity === "strong" && len >= 4) return 2;
  if (intensity === "medium" && len >= 6) return 2;
  return 1;
}

/* Intl.Segmenter is not in this project's TS lib target, so it is typed
 * narrowly here rather than widening tsconfig for the whole codebase. It is
 * also genuinely absent on some older webviews, hence the runtime check. */
interface SegmentData {
  segment: string;
}
interface SegmenterLike {
  segment(input: string): Iterable<SegmentData>;
}
type SegmenterCtor = new (
  locale: string,
  options: { granularity: "grapheme" | "word" | "sentence" },
) => SegmenterLike;

function getSegmenterCtor(): SegmenterCtor | null {
  const intl = globalThis.Intl as unknown as { Segmenter?: SegmenterCtor } | undefined;
  return typeof intl?.Segmenter === "function" ? intl.Segmenter : null;
}

/**
 * Split text into words, CJK runs, and the whitespace/punctuation between.
 *
 * Uses Intl.Segmenter for CJK where available — it is far better at finding
 * word boundaries in Chinese than any regex — and falls back to a character
 * scan when it is missing or the text has no CJK in it at all.
 */
export function segmentText(text: string): string[] {
  if (!text) return [];

  const segmenterCtor = getSegmenterCtor();
  if (CJK.test(text) && segmenterCtor) {
    try {
      const segmenter = new segmenterCtor("zh-Hans", { granularity: "word" });
      const parts = Array.from(segmenter.segment(text), (item) => item.segment);
      // The original distrusts a segmentation that collapses a long line into
      // a couple of chunks; that signals the segmenter did not understand it.
      const meaningful = parts.filter((part) => part.trim());
      const collapsed = text.length >= 12 && meaningful.length <= 2;
      if (!collapsed && parts.length > 0) return parts;
    } catch {
      // Fall through to the scanner.
    }
  }

  return scanSegments(text);
}

/** Character-run scanner: Latin words, CJK runs, everything else. */
function scanSegments(text: string): string[] {
  const out: string[] = [];
  let buffer = "";
  let kind: "latin" | "cjk" | "other" | null = null;

  const flush = () => {
    if (buffer) out.push(buffer);
    buffer = "";
  };

  for (const char of text) {
    const next: "latin" | "cjk" | "other" = /[A-Za-z0-9'-]/.test(char)
      ? "latin"
      : CJK.test(char)
        ? "cjk"
        : "other";
    if (next !== kind) {
      flush();
      kind = next;
    }
    buffer += char;
  }
  flush();

  return out;
}

/**
 * Turn a run of text into tokens annotated with how much to bold.
 *
 * Returns tokens covering the whole input in order, so joining their `text`
 * reproduces the original exactly — nothing is dropped or reordered.
 */
export function toBionicTokens(text: string, intensity: BionicIntensity): BionicToken[] {
  if (intensity === "off" || !text) return [{ text, bold: 0 }];

  return segmentText(text).map((segment) => {
    if (isEnglishWord(segment)) {
      return { text: segment, bold: getBoldLength(segment, intensity) };
    }
    if (isCjkRun(segment)) {
      return { text: segment, bold: getCjkBoldLength(segment, intensity) };
    }
    return { text: segment, bold: 0 };
  });
}
