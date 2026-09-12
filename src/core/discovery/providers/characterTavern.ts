/**
 * character-tavern.com — LettuceAI's original Discovery source.
 *
 * This is a thin adapter over the Rust commands that already exist, so the
 * built-in catalogue keeps working exactly as before while sitting behind the
 * same interface as the added ones. Nothing about its behaviour changes; it is
 * only reachable through the provider seam now.
 */

import {
  fetchCardDetail,
  fetchDiscoveryCards,
  importCharacter as importDiscoveryCharacter,
  searchDiscoveryCards,
  type CardType,
  type DiscoveryCard,
  type DiscoveryCardDetail,
} from "../../discovery";
import type { BrowseQuery, BrowseResult, DiscoveryProvider, DiscoverySort } from "./types";

const SITE_BASE = "https://character-tavern.com";
const IMAGE_BASE = "https://ct-cards.storage.character-tavern.com";

/** Discovery's three orderings map onto the backend's card types directly. */
const CARD_TYPES: Record<DiscoverySort, CardType> = {
  trending: "trending",
  popular: "popular",
  newest: "newest",
};

export const characterTavernProvider: DiscoveryProvider = {
  id: "character-tavern",
  label: "Character Tavern",
  description: "LettuceAI's built-in catalogue.",
  homepage: SITE_BASE,
  supportsAuthorInfo: true,

  async browse(query: BrowseQuery): Promise<BrowseResult> {
    // The backend has separate list and search paths; a search term picks the
    // latter, which is the only one that paginates.
    if (query.search?.trim()) {
      const response = await searchDiscoveryCards(query.search, query.page, query.pageSize);
      const cards = response.hits ?? [];
      const totalPages = response.totalPages;
      return {
        cards,
        total: response.totalHits,
        hasMore: totalPages != null ? query.page < totalPages : cards.length >= query.pageSize,
      };
    }

    const cards = await fetchDiscoveryCards(CARD_TYPES[query.sort] ?? "trending");
    return {
      cards,
      total: cards.length,
      // The section endpoints return a fixed block rather than paging.
      hasMore: false,
    };
  },

  async detail(path: string): Promise<DiscoveryCardDetail> {
    const response = await fetchCardDetail(path);
    return response.card ?? (response as unknown as DiscoveryCardDetail);
  },

  async importCard(path: string): Promise<string> {
    return await importDiscoveryCharacter(path);
  },

  imageUrl(card: DiscoveryCard): string | null {
    return card.path ? `${IMAGE_BASE}/${card.path}.png` : null;
  },

  pageUrl(card: DiscoveryCard): string | null {
    return card.path ? `${SITE_BASE}/character/${card.path}` : null;
  },
};
