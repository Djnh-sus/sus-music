"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CircleAlert, Play, Search, SearchX } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import RequireAuth from "@/components/RequireAuth";
import { PageSkeleton, RowSkeleton } from "@/components/Skeleton";
import TrackResultItem from "@/components/TrackResultItem";
import { useAuth } from "@/context/AuthContext";
import { usePlayer } from "@/context/PlayerContext";
import { useToast } from "@/context/ToastContext";
import { authedFetch } from "@/lib/authed-fetch";

function SearchResults() {
  const params = useSearchParams();
  const q = (params.get("q") || "").trim();
  const { userId } = useAuth();
  const { playQueue, addToQueue } = usePlayer();
  const { showToast } = useToast();
  const [state, setState] = useState({ q: null, status: "idle", items: [], error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!q || !userId) return;
    let cancelled = false;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ q, status: "loading", items: [], error: null });

    authedFetch(`/api/youtube/search?q=${encodeURIComponent(q)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Tìm kiếm thất bại");
        return data.items || [];
      })
      .then((items) => {
        if (!cancelled) setState({ q, status: "ready", items, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ q, status: "error", items: [], error: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [q, userId, attempt]);

  const current =
    state.q === q ? state : { status: q ? "loading" : "idle", items: [], error: null };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8">
      <PageHeader
        title={q ? `Kết quả cho “${q}”` : "Tìm kiếm"}
        subtitle={current.status === "ready" ? `${current.items.length} kết quả` : null}
      >
        {current.status === "ready" && current.items.length > 0 && (
          <button type="button" onClick={() => playQueue(current.items, 0)} className="btn-primary">
            <Play size={18} fill="currentColor" />
            Phát tất cả
          </button>
        )}
      </PageHeader>

      {current.status === "idle" && (
        <EmptyState
          icon={Search}
          title="Bạn muốn nghe gì?"
          description="Gõ tên bài hát, ca sĩ hoặc một chủ đề vào ô tìm kiếm phía trên."
        />
      )}

      {current.status === "loading" && <RowSkeleton count={8} />}

      {current.status === "error" && (
        <EmptyState icon={CircleAlert} title="Không tìm được" description={current.error}>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="btn-primary">
            Thử lại
          </button>
        </EmptyState>
      )}

      {current.status === "ready" && current.items.length === 0 && (
        <EmptyState
          icon={SearchX}
          title="Không có kết quả"
          description="Thử từ khoá khác hoặc kiểm tra lại chính tả nhé."
        />
      )}

      {current.status === "ready" && current.items.length > 0 && (
        <ul className="flex flex-col gap-1">
          {current.items.map((track, index) => (
            <TrackResultItem
              key={track.videoId}
              track={track}
              onPlay={() => playQueue(current.items, index)}
              onAddToQueue={() => {
                addToQueue(track);
                showToast("Đã thêm vào hàng chờ");
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <RequireAuth>
      <Suspense fallback={<PageSkeleton />}>
        <SearchResults />
      </Suspense>
    </RequireAuth>
  );
}
