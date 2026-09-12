/**
 * Discovery providers.
 *
 * LettuceAI's Discovery talks to exactly one site — character-tavern.com,
 * hard-coded across 1268 lines of Rust. This interface puts a seam in front of
 * that so other catalogues can sit alongside it, which is what the SillyTavern
 * Character Library extension does with its nine sources.
 *
 * Providers are written in TypeScript and reach the network through the Rust
 * `api_request` command. That matters: the webview cannot fetch these sites
 * directly (CORS, and several sit behind Cloudflare), whereas the Rust side is
 * a plain HTTP client with no origin policy and can set a browser User-Agent.
 * The Character Library extension solves the same problem with a proxy
 * endpoint; going through Rust is the equivalent here and needs no new backend
 * code, because `api_request` already exists for provider traffic.
 */

import type { DiscoveryCard, DiscoveryCardDetail } from "../../discovery";

export type DiscoverySort = "trending" | "popular" | "newest";

export interface BrowseQuery {
  /** Free-text search. Empty means "browse everything". */
  search?: string;
  sort: DiscoverySort;
  /** 1-based. */
  page: number;
  pageSize: number;
  includeNsfw: boolean;
  tags?: string[];
  /**
   * Limit results to one creator's characters.
   *
   * Only honoured by sources that advertise `supportsCreatorBrowse`; others
   * ignore it, so the UI must not offer the link for those or it would silently
   * return the whole catalogue instead of one person's work.
   */
  creator?: string;
}

export interface BrowseResult {
  cards: DiscoveryCard[];
  /** Total matches where the source reports it; undefined when unknown. */
  total?: number;
  /** False when the source says there is nothing further. */
  hasMore: boolean;
}

export interface DiscoveryProvider {
  /** Stable key, persisted as the user's chosen source. */
  id: string;
  /** Shown in the source picker. */
  label: string;
  /** One line under the label. */
  description: string;
  /** Site the cards come from, for attribution. */
  homepage: string;
  /**
   * Whether this source can be browsed without credentials. Sources needing a
   * login are listed but disabled rather than hidden, so it is clear they
   * exist and why they are unavailable.
   */
  requiresAuth?: boolean;
  /** Whether `BrowseQuery.creator` actually filters on this source. */
  supportsCreatorBrowse?: boolean;
  /**
   * Whether `discovery_fetch_author_info` can answer for this source.
   *
   * That command is hard-wired to character-tavern.com/api/author, so asking it
   * about anyone else is a guaranteed 404 — one per card opened, which in a
   * browsing session ran to a hundred failed requests and a matching wall of
   * console errors.
   */
  supportsAuthorInfo?: boolean;

  browse(query: BrowseQuery, signal?: AbortSignal): Promise<BrowseResult>;

  /** Full detail for one card, keyed by the card's `path`. */
  detail(path: string, signal?: AbortSignal): Promise<DiscoveryCardDetail>;

  /**
   * Import a card into the local library, returning the new character id.
   * Providers do this themselves because each site stores definitions
   * differently.
   */
  importCard(path: string): Promise<string>;

  /** Absolute URL for a card's artwork, or null when it has none. */
  imageUrl(card: DiscoveryCard): string | null;

  /** Link back to the card on its own site. */
  pageUrl(card: DiscoveryCard): string | null;
}
