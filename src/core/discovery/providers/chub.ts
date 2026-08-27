/**
 * chub.ai — the largest public character catalogue.
 *
 * Ported from the SillyTavern Character Library extension's Chub provider.
 * The API is public and needs no account: `/search` lists, and
 * `/api/characters/{fullPath}?full=true` returns a definition that already
 * lines up with the V2 character-card fields LettuceAI imports.
 */

import { importCharacter } from "../../storage/characterTransfer";
import type { DiscoveryCard, DiscoveryCardDetail } from "../../discovery";
import { getJson } from "./http";
import type { BrowseQuery, BrowseResult, DiscoveryProvider, DiscoverySort } from "./types";

const API_BASE = "https://api.chub.ai";
const SITE_BASE = "https://chub.ai";
const AVATAR_BASE = "https://avatars.charhub.io/avatars";

/** chub's sort keys for the three orderings Discovery offers. */
const SORT_KEYS: Record<DiscoverySort, string> = {
  trending: "default",
  popular: "download_count",
  newest: "id",
};

interface ChubNode {
  id?: number;
  name?: string;
  fullPath?: string;
  tagline?: string;
  description?: string;
  topics?: unknown;
  starCount?: number;
  nMessages?: number;
  nChats?: number;
  nTokens?: number;
  createdAt?: string;
  lastActivityAt?: string;
  rating?: number;
  ratingCount?: number;
  nsfw_image?: boolean;
  avatar_url?: string;
  max_res_url?: string;
  hasGallery?: boolean;
  related_lorebooks?: unknown;
  definition?: ChubDefinition;
}

interface ChubDefinition {
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_message?: string;
  example_dialogs?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  alternate_greetings?: unknown;
  embedded_lorebook?: unknown;
}

interface ChubSearchResponse {
  data?: { nodes?: ChubNode[]; count?: number };
  nodes?: ChubNode[];
  count?: number;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function toEpochMs(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** chub's fullPath is `author/slug`, which is where the author name comes from. */
function authorOf(fullPath?: string): string | undefined {
  const author = fullPath?.split("/")[0];
  return author || undefined;
}

function toCard(node: ChubNode): DiscoveryCard {
  const path = node.fullPath ?? String(node.id ?? "");
  return {
    id: String(node.id ?? path),
    name: node.name ?? "Untitled",
    path,
    tagline: node.tagline?.trim() || undefined,
    pageDescription: node.description?.trim() || undefined,
    author: authorOf(node.fullPath),
    isNsfw: node.nsfw_image === true,
    contentWarnings: [],
    tags: asStringArray(node.topics),
    // chub has no view counter; chats is the closest engagement signal.
    downloads: node.nChats,
    messages: node.nMessages,
    likes: node.starCount,
    totalTokens: node.nTokens,
    createdAt: toEpochMs(node.createdAt),
    lastUpdateAt: toEpochMs(node.lastActivityAt),
    hasLorebook: Array.isArray(node.related_lorebooks) && node.related_lorebooks.length > 0,
  };
}

function extractNodes(payload: ChubSearchResponse): { nodes: ChubNode[]; count?: number } {
  const nodes = payload.data?.nodes ?? payload.nodes ?? [];
  const count = payload.data?.count ?? payload.count;
  return { nodes, count };
}

async function fetchNode(path: string, signal?: AbortSignal): Promise<ChubNode> {
  // The path already contains a slash; encode each segment so a slug with
  // unusual characters cannot break the URL.
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const payload = await getJson<{ node?: ChubNode } & ChubNode>(
    `${API_BASE}/api/characters/${encoded}`,
    { query: { full: true }, signal },
  );
  return payload.node ?? payload;
}

export const chubProvider: DiscoveryProvider = {
  id: "chub",
  label: "Chub",
  description: "The largest public character catalogue. No account needed.",
  homepage: SITE_BASE,

  async browse(query: BrowseQuery, signal?: AbortSignal): Promise<BrowseResult> {
    const payload = await getJson<ChubSearchResponse>(`${API_BASE}/search`, {
      signal,
      query: {
        search: query.search ?? "",
        first: query.pageSize,
        page: query.page,
        sort: SORT_KEYS[query.sort] ?? SORT_KEYS.trending,
        nsfw: query.includeNsfw,
        // NSFL is the harder tier; it follows the NSFW switch rather than
        // getting a control of its own.
        nsfl: query.includeNsfw,
        include_forks: false,
        // Cards below this are almost always empty stubs.
        min_tokens: 50,
        topics: query.tags?.length ? query.tags.join(",") : undefined,
      },
    });

    const { nodes, count } = extractNodes(payload);
    return {
      cards: nodes.map(toCard),
      total: count,
      hasMore: nodes.length >= query.pageSize,
    };
  },

  async detail(path: string, signal?: AbortSignal): Promise<DiscoveryCardDetail> {
    const node = await fetchNode(path, signal);
    const definition = node.definition ?? {};

    return {
      id: String(node.id ?? path),
      origin: "chub",
      name: node.name ?? definition.name ?? "Untitled",
      path,
      tagline: node.tagline?.trim() || undefined,
      description: node.description?.trim() || undefined,
      author: authorOf(node.fullPath),
      isNsfw: node.nsfw_image === true,
      createdAt: node.createdAt,
      lastUpdatedAt: node.lastActivityAt,
      definitionCharacterDescription: definition.description,
      definitionPersonality: definition.personality,
      definitionScenario: definition.scenario,
    } as DiscoveryCardDetail;
  },

  async importCard(path: string): Promise<string> {
    const node = await fetchNode(path);
    const definition = node.definition;
    if (!definition) {
      throw new Error("That card has no downloadable definition on Chub.");
    }

    // Build a V2 character card. LettuceAI's importer detects the format from
    // the payload, so handing it the standard shape avoids a bespoke path.
    const card = {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: node.name ?? definition.name ?? "Untitled",
        description: definition.description ?? "",
        personality: definition.personality ?? "",
        scenario: definition.scenario ?? "",
        first_mes: definition.first_message ?? "",
        mes_example: definition.example_dialogs ?? "",
        creator_notes: node.tagline ?? "",
        system_prompt: definition.system_prompt ?? "",
        post_history_instructions: definition.post_history_instructions ?? "",
        alternate_greetings: asStringArray(definition.alternate_greetings),
        tags: asStringArray(node.topics),
        creator: authorOf(node.fullPath) ?? "",
        character_version: "",
        extensions: {},
        ...(definition.embedded_lorebook ? { character_book: definition.embedded_lorebook } : {}),
      },
    };

    const character = await importCharacter(JSON.stringify(card));
    return character.id;
  },

  imageUrl(card: DiscoveryCard): string | null {
    if (!card.path) return null;
    const encoded = card.path.split("/").map(encodeURIComponent).join("/");
    return `${AVATAR_BASE}/${encoded}/avatar.webp`;
  },

  pageUrl(card: DiscoveryCard): string | null {
    return card.path ? `${SITE_BASE}/characters/${card.path}` : null;
  },
};
