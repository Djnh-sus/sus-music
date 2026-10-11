"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Compass } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import EmptyState from "@/components/EmptyState";
import LoginButton from "@/components/LoginButton";
import Logo from "@/components/Logo";
import PlaylistCard from "@/components/PlaylistCard";
import ResumeCard from "@/components/ResumeCard";
import Shelf from "@/components/Shelf";
import { PageSkeleton, ShelfSkeleton } from "@/components/Skeleton";
import TrackCard from "@/components/TrackCard";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/context/AuthContext";
import {
  cleanItems,
  topChannels,
  useRecommendation,
  useSubscriptionFeed,
} from "@/lib/recommendations";
import { loadSearchHistory } from "@/lib/search-history";
import { trackFromRow, uniqueByVideoId } from "@/lib/track";

const PAGE_CLASS = "mx-auto w-full max-w-6xl px-4 py-6 md:px-8";

function RecommendationShelf({ title, subtitle, state, onPlay, quiet = false }) {
  if (state.status === "idle") return null;
  if (state.status === "loading") return <ShelfSkeleton />;

  if (state.status === "error") {
    if (quiet) return null;
    return (
      <section className="mb-10">
        <h2 className="font-display text-xl font-extrabold md:text-2xl">{title}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-border bg-surface/60 px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-danger">{state.error}</p>
          <button type="button" onClick={state.reload} className="btn-ghost py-1.5 text-sm">
            Thử lại
          </button>
        </div>
      </section>
    );
  }

  if (state.items.length === 0) return null;

  return (
    <Shelf title={title} subtitle={subtitle}>
      {state.items.map((track, index) => (
        <TrackCard
          key={track.videoId}
          title={track.title}
          subtitle={track.channelTitle}
          thumbnail={track.thumbnail}
          onPlay={() => onPlay(state.items, index)}
          track={track}
        />
      ))}
    </Shelf>
  );
}

function HomeContent() {
  const { user, userId, loading } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const { playQueue, playTrackWithRadio } = usePlayer();
  const searchParams = useSearchParams();
  const loginError = searchParams.get("login_error");

  const loadDashboard = async (forUserId) => {
    const [{ data: history }, { data: pls }, { data: favs }] = await Promise.all([
      supabase
        .from("history")
        .select("video_id, title, channel_title, thumbnail_url, played_at")
        .order("played_at", { ascending: false })
        .limit(100),
      supabase
        .from("custom_playlists")
        .select("id, name")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("favorites")
        .select("video_id, title, channel_title, thumbnail_url, added_at")
        .order("added_at", { ascending: false })
        .limit(10),
    ]);

    setDashboard({
      userId: forUserId,
      history: uniqueByVideoId(history, 10),
      channels: topChannels(history),
      playlists: pls || [],
      favorites: favs || [],
    });
  };

  useEffect(() => {
    if (!userId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDashboard(userId);
  }, [userId]);

  const shown = dashboard?.userId === userId ? dashboard : null;
  const recentHistory = shown?.history ?? [];
  const playlists = shown?.playlists ?? [];
  const favorites = shown?.favorites ?? [];
  const channels = shown?.channels ?? [];

  const searchTerms = useMemo(() => (userId ? loadSearchHistory(userId) : []), [userId]);

  const suggestQuery = searchTerms[0] ?? channels[0] ?? null;
  const suggestNote = searchTerms[0]
    ? `Vì bạn vừa tìm “${searchTerms[0]}”`
    : channels[0]
      ? `Vì bạn hay nghe ${channels[0]}`
      : null;

  const suggestLower = (suggestQuery ?? "").toLowerCase();
  const channelPick = channels.find((name) => name.toLowerCase() !== suggestLower) ?? null;
  const termPick = searchTerms.find((term) => term.toLowerCase() !== suggestLower) ?? null;
  const recommendQuery = channelPick ?? termPick;
  const recommendNote = channelPick
    ? `Từ kênh bạn hay nghe: ${channelPick}`
    : termPick
      ? `Thêm về “${termPick}”`
      : null;

  const suggestState = useRecommendation(shown ? userId : null, suggestQuery);
  const recommendState = useRecommendation(shown ? userId : null, recommendQuery);
  const feedState = useSubscriptionFeed(shown ? userId : null);

  const recentIds = new Set(recentHistory.map((h) => h.video_id));
  const suggestItems = cleanItems(suggestState.items, recentIds);
  const usedIds = new Set([...recentIds, ...suggestItems.map((item) => item.videoId)]);
  const recommendItems = cleanItems(recommendState.items, usedIds);
  const allUsedIds = new Set([...usedIds, ...recommendItems.map((item) => item.videoId)]);
  const feedItems = cleanItems(feedState.items, allUsedIds);

  if (loading) return <PageSkeleton />;

  if (!user) {
    return (
      <div className="fade-in mx-auto flex min-h-[78vh] max-w-xl flex-col items-center justify-center gap-5 px-6 text-center">
        <Logo size={120} className="bob" />
        <h1 className="font-display text-5xl font-extrabold leading-none md:text-6xl">
          SUS <span className="text-accent">Music</span>
        </h1>
        <p className="max-w-sm text-muted">
          Nghe nhạc và video YouTube theo cách của riêng bạn: playlist, yêu thích và lịch sử đồng bộ
          trên mọi thiết bị.
        </p>
        {loginError && (
          <p className="max-w-sm text-sm text-danger">
            Đăng nhập thất bại
            {loginError !== "timeout" ? `: ${loginError}` : " (quá thời gian chờ)"}. Thử lại nhé.
          </p>
        )}
        <LoginButton />
      </div>
    );
  }

  if (!shown) {
    return (
      <div className={PAGE_CLASS}>
        <ShelfSkeleton />
        <ShelfSkeleton />
      </div>
    );
  }

  const playFromList = (list, index) => playQueue(list.map(trackFromRow), index);
  const nothingYet =
    !suggestQuery &&
    recentHistory.length === 0 &&
    playlists.length === 0 &&
    favorites.length === 0;

  return (
    <div className={PAGE_CLASS}>
      {nothingYet && (
        <EmptyState
          icon={Compass}
          title="Chưa có gì ở đây"
          description="Tìm một bài hát để SUS Music bắt đầu gợi ý theo gu của bạn."
        >
          <button
            type="button"
            onClick={() => document.getElementById("global-search")?.focus()}
            className="btn-primary"
          >
            Tìm nhạc
          </button>
        </EmptyState>
      )}

      <ResumeCard userId={userId} />

      <RecommendationShelf
        title="Gợi ý"
        subtitle={suggestNote}
        state={{ ...suggestState, items: suggestItems }}
        onPlay={(items, index) => playTrackWithRadio(items[index])}
      />

      <RecommendationShelf
        title="Mới từ kênh bạn đăng ký"
        subtitle="Video mới nhất từ tài khoản YouTube của bạn"
        state={{ ...feedState, items: feedItems }}
        onPlay={(items, index) => playTrackWithRadio(items[index])}
        quiet
      />

      <RecommendationShelf
        title="Đề xuất"
        subtitle={recommendNote}
        state={{ ...recommendState, items: recommendItems }}
        onPlay={(items, index) => playTrackWithRadio(items[index])}
      />

      {recentHistory.length > 0 && (
        <Shelf title="Nghe lại gần đây" viewAllHref="/history">
          {recentHistory.map((h, index) => (
            <TrackCard
              key={h.video_id}
              title={h.title}
              subtitle={h.channel_title}
              thumbnail={h.thumbnail_url}
              onPlay={() => playFromList(recentHistory, index)}
              track={trackFromRow(h)}
            />
          ))}
        </Shelf>
      )}

      {playlists.length > 0 && (
        <Shelf title="Playlist của bạn" viewAllHref="/playlists">
          {playlists.map((pl) => (
            <PlaylistCard key={pl.id} href={`/playlists/${pl.id}`} title={pl.name} />
          ))}
        </Shelf>
      )}

      {favorites.length > 0 && (
        <Shelf title="Yêu thích" viewAllHref="/favorites">
          {favorites.map((f, index) => (
            <TrackCard
              key={f.video_id}
              title={f.title}
              subtitle={f.channel_title}
              thumbnail={f.thumbnail_url}
              onPlay={() => playFromList(favorites, index)}
              track={trackFromRow(f)}
            />
          ))}
        </Shelf>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}
