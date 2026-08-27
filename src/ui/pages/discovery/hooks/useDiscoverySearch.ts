import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../../../core/i18n/context";
import { type DiscoverySearchResponse } from "../../../../core/discovery";
import { useDiscoveryProvider } from "./useDiscoveryProvider";
import { useShowNsfwImages } from "./useDiscoveryNsfw";
import type { BrowseResult, DiscoveryProvider } from "../../../../core/discovery/providers/registry";

/**
 * Search runs against whichever catalogue is selected, so the shape each one
 * returns is normalised to the response the UI already expects.
 */
async function searchWithProvider(
  provider: DiscoveryProvider,
  query: string,
  page: number,
  pageSize: number,
  includeNsfw: boolean,
): Promise<DiscoverySearchResponse> {
  const result: BrowseResult = await provider.browse({
    search: query,
    sort: "trending",
    page,
    pageSize,
    includeNsfw,
  });

  // Only report a page count when the source gave a total; guessing one would
  // make "load more" stop early or run forever.
  const totalPages =
    result.total != null ? Math.max(1, Math.ceil(result.total / pageSize)) : undefined;

  return {
    hits: result.cards,
    totalHits: result.total,
    hitsPerPage: pageSize,
    page,
    totalPages: totalPages ?? (result.hasMore ? page + 1 : page),
    query,
  };
}

export interface RecentSearch {
  query: string;
  timestamp: number;
}

const RECENT_SEARCHES_KEY = "discovery_recent_searches";
const MAX_RECENT_SEARCHES = 8;

export function loadRecentSearches(): RecentSearch[] {
  try {
    const stored = sessionStorage.getItem(RECENT_SEARCHES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  const trimmed = query.trim();
  if (!trimmed) return;

  const searches = loadRecentSearches().filter((s) => s.query !== trimmed);
  searches.unshift({ query: trimmed, timestamp: Date.now() });
  const limited = searches.slice(0, MAX_RECENT_SEARCHES);

  try {
    sessionStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(limited));
  } catch {
    // Storage full or unavailable
  }
}

export function clearRecentSearches() {
  try {
    sessionStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // Storage unavailable
  }
}

export function useDiscoverySearch(initialQuery = "") {
  const { t } = useI18n();
  const { provider } = useDiscoveryProvider();
  const includeNsfw = useShowNsfwImages();
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [results, setResults] = useState<DiscoverySearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);

  useEffect(() => {
    setRecentSearches(loadRecentSearches());
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 400);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const search = async () => {
      setLoading(true);
      setError(null);
      setPage(1);
      setHasMore(true);

      try {
        const response = await searchWithProvider(provider, debouncedQuery, 1, 30, includeNsfw);
        if (cancelled) return;
        setResults(response);
        setHasMore(
          response.page !== undefined &&
            response.totalPages !== undefined &&
            response.page < response.totalPages,
        );

        saveRecentSearch(debouncedQuery);
        setRecentSearches(loadRecentSearches());
      } catch (err) {
        if (cancelled) return;
        console.error("Search failed:", err);
        setError(err instanceof Error ? err.message : t("discovery.errors.searchFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void search();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, provider, includeNsfw]);

  const loadMore = useCallback(async () => {
    if (!debouncedQuery.trim() || loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const response = await searchWithProvider(
        provider,
        debouncedQuery,
        nextPage,
        30,
        includeNsfw,
      );

      setResults((prev) =>
        prev
          ? {
              ...response,
              hits: [...prev.hits, ...response.hits],
            }
          : response,
      );

      setPage(nextPage);
      setHasMore(
        response.page !== undefined &&
          response.totalPages !== undefined &&
          response.page < response.totalPages,
      );
    } catch (err) {
      console.error("Failed to load more:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [debouncedQuery, page, loadingMore, hasMore, provider, includeNsfw]);

  const clear = useCallback(() => {
    setQuery("");
    setResults(null);
    setError(null);
  }, []);

  const clearRecent = useCallback(() => {
    clearRecentSearches();
    setRecentSearches([]);
  }, []);

  return {
    query,
    setQuery,
    debouncedQuery,
    results,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    clear,
    recentSearches,
    clearRecent,
  };
}
