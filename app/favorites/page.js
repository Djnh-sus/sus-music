"use client";

import { useEffect, useState } from "react";
import { CircleAlert, Heart, Play } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import RequireAuth from "@/components/RequireAuth";
import { GridSkeleton } from "@/components/Skeleton";
import TrackCard from "@/components/TrackCard";
import { usePlayer } from "@/context/PlayerContext";
import { trackFromRow } from "@/lib/track";

function FavoritesContent() {
  const [favorites, setFavorites] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const { playQueue } = usePlayer();

  const load = async () => {
    setLoadError(null);
    const { data, error } = await supabase
      .from("favorites")
      .select("id, video_id, title, channel_title, thumbnail_url, added_at")
      .order("added_at", { ascending: false });

    if (error) {
      setLoadError(error.message);
      setFavorites([]);
      return;
    }
    setFavorites(data || []);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const handlePlay = (index) => playQueue(favorites.map(trackFromRow), index);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
      <PageHeader
        title="Yêu thích"
        subtitle={favorites && favorites.length > 0 ? `${favorites.length} bài` : null}
      >
        {favorites && favorites.length > 0 && (
          <button type="button" onClick={() => handlePlay(0)} className="btn-primary">
            <Play size={18} fill="currentColor" />
            Phát tất cả
          </button>
        )}
      </PageHeader>

      {favorites === null && <GridSkeleton />}

      {loadError && (
        <EmptyState icon={CircleAlert} title="Không tải được danh sách" description={loadError}>
          <button
            type="button"
            onClick={() => {
              setFavorites(null);
              load();
            }}
            className="btn-primary"
          >
            Thử lại
          </button>
        </EmptyState>
      )}

      {favorites && favorites.length === 0 && !loadError && (
        <EmptyState
          icon={Heart}
          title="Chưa có bài yêu thích"
          description="Bấm hình trái tim ở bất kỳ bài nào để lưu vào đây."
        />
      )}

      {favorites && favorites.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-x-4 gap-y-6">
          {favorites.map((f, index) => (
            <TrackCard
              key={f.id}
              fluid
              title={f.title}
              subtitle={f.channel_title}
              thumbnail={f.thumbnail_url}
              onPlay={() => handlePlay(index)}
              track={trackFromRow(f)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FavoritesPage() {
  return (
    <RequireAuth>
      <FavoritesContent />
    </RequireAuth>
  );
}
