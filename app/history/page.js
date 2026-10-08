"use client";

import { useEffect, useState } from "react";
import { CircleAlert, History, Play } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import RequireAuth from "@/components/RequireAuth";
import { GridSkeleton } from "@/components/Skeleton";
import TrackCard from "@/components/TrackCard";
import { usePlayer } from "@/context/PlayerContext";
import { trackFromRow, uniqueByVideoId } from "@/lib/track";

function HistoryContent() {
  const [history, setHistory] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const { playQueue } = usePlayer();

  const load = async () => {
    setLoadError(null);
    const { data, error } = await supabase
      .from("history")
      .select("id, video_id, title, channel_title, thumbnail_url, played_at")
      .order("played_at", { ascending: false })
      .limit(200);

    if (error) {
      setLoadError(error.message);
      setHistory([]);
      return;
    }
    setHistory(uniqueByVideoId(data, 50));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const handlePlay = (index) => playQueue(history.map(trackFromRow), index);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
      <PageHeader
        title="Lịch sử nghe"
        subtitle={history && history.length > 0 ? `${history.length} bài gần đây` : null}
      >
        {history && history.length > 0 && (
          <button type="button" onClick={() => handlePlay(0)} className="btn-primary">
            <Play size={18} fill="currentColor" />
            Phát tất cả
          </button>
        )}
      </PageHeader>

      {history === null && <GridSkeleton />}

      {loadError && (
        <EmptyState icon={CircleAlert} title="Không tải được lịch sử" description={loadError}>
          <button
            type="button"
            onClick={() => {
              setHistory(null);
              load();
            }}
            className="btn-primary"
          >
            Thử lại
          </button>
        </EmptyState>
      )}

      {history && history.length === 0 && !loadError && (
        <EmptyState
          icon={History}
          title="Chưa có lịch sử"
          description="Những bài bạn đã nghe sẽ xuất hiện ở đây."
        />
      )}

      {history && history.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-x-4 gap-y-6">
          {history.map((h, index) => (
            <TrackCard
              key={h.id}
              fluid
              title={h.title}
              subtitle={h.channel_title}
              thumbnail={h.thumbnail_url}
              onPlay={() => handlePlay(index)}
              track={trackFromRow(h)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function HistoryPage() {
  return (
    <RequireAuth>
      <HistoryContent />
    </RequireAuth>
  );
}
