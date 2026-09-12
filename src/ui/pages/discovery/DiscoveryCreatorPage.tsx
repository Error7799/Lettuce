/**
 * Everything one person has made.
 *
 * Finding a character you like is the easy half; the useful next question is
 * who wrote it, because a creator whose taste matches yours is a better filter
 * than any tag. The card detail already showed the author's name — this makes
 * it lead somewhere.
 *
 * Only reachable for sources that advertise `supportsCreatorBrowse`. Character
 * Tavern's endpoints have no creator filter, and offering the link there would
 * quietly return the whole catalogue as if it were one person's work.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertCircle, User } from "lucide-react";

import { useI18n } from "../../../core/i18n/context";
import { PageHeader } from "../../components/App";
import { DiscoveryCard, DiscoveryGridSkeleton, InfiniteScrollSentinel, PureModeNotice } from "./components";
import { useDiscoveryProvider } from "./hooks/useDiscoveryProvider";
import { useShowNsfwImages, usePureModeFiltering } from "./hooks/useDiscoveryNsfw";
import { useNavigationManager } from "../../navigation";
import type { DiscoveryCard as DiscoveryCardType } from "../../../core/discovery";

const PAGE_SIZE = 24;

export function DiscoveryCreatorPage() {
  const { name = "" } = useParams<{ name: string }>();
  const creator = decodeURIComponent(name);
  const navigate = useNavigate();
  const { go } = useNavigationManager();
  const { t } = useI18n();
  const { provider } = useDiscoveryProvider();
  const showNsfw = useShowNsfwImages();
  const pureModeFiltering = usePureModeFiltering();

  const [cards, setCards] = useState<DiscoveryCardType[]>([]);
  const [total, setTotal] = useState<number | undefined>();
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (wanted: number) => {
      const result = await provider.browse({
        sort: "newest",
        page: wanted,
        pageSize: PAGE_SIZE,
        includeNsfw: showNsfw,
        creator,
      });
      return result;
    },
    [provider, showNsfw, creator],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPage(1);

    void load(1)
      .then((result) => {
        if (cancelled) return;
        setCards(result.cards);
        setTotal(result.total);
        setHasMore(result.hasMore);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [load]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const next = page + 1;
    void load(next)
      .then((result) => {
        setCards((current) => [...current, ...result.cards]);
        setHasMore(result.hasMore);
        setPage(next);
      })
      .catch(() => setHasMore(false))
      .finally(() => setLoadingMore(false));
  }, [load, page, hasMore, loadingMore]);

  return (
    <div className="flex h-full flex-col bg-surface lg:px-4">
      <section className="flex-1 overflow-y-auto">
        <PageHeader
          title={creator}
          meta={
            total !== undefined
              ? `${total} ${total === 1 ? "character" : "characters"}`
              : cards.length > 0
                ? `${cards.length}+ ${t("discovery.resultsUnit")}`
                : undefined
          }
          onBack={() => navigate(-1)}
          backLabel={t("common.bottomNav.discover")}
        />

        <div className="flex items-center gap-2 px-4 pb-1 text-[11px] text-fg/45">
          <User className="h-3.5 w-3.5" />
          Everything by this creator on {provider.label}
        </div>

        {pureModeFiltering && !loading && !error ? (
          <div className="px-4 pb-1 pt-2">
            <PureModeNotice />
          </div>
        ) : null}

        {error ? (
          <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-danger/30 bg-danger/10">
              <AlertCircle className="h-8 w-8 text-danger" />
            </div>
            <p className="text-sm text-danger">{error}</p>
          </div>
        ) : null}

        {loading ? (
          <div className="px-4 lg:px-8">
            <DiscoveryGridSkeleton cardCount={8} />
          </div>
        ) : null}

        {!loading && !error && cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-20 text-center">
            <User className="h-7 w-7 text-fg/20" />
            <p className="max-w-xs text-[11px] leading-relaxed text-fg/40">
              Nothing found under {creator}. They may have renamed their account, or their cards
              may be hidden by your content settings.
            </p>
          </div>
        ) : null}

        {!loading && cards.length > 0 ? (
          <div className="px-4 pb-6 lg:px-8">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
              {cards.map((card, index) => (
                <DiscoveryCard
                  key={`${card.path}-${index}`}
                  card={card}
                  index={index}
                  showNsfw={showNsfw}
                  onClick={(picked) =>
                    go(`/discover/card/${encodeURIComponent(picked.path ?? "")}`)
                  }
                />
              ))}
            </div>

            <InfiniteScrollSentinel onReach={loadMore} disabled={!hasMore || loadingMore} />
          </div>
        ) : null}
      </section>
    </div>
  );
}
