"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CircleAlert, ListMusic, Play } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import EmptyState from "@/components/EmptyState";
import LoginButton from "@/components/LoginButton";
import PageHeader from "@/components/PageHeader";
import { RowSkeleton } from "@/components/Skeleton";
import TrackMenu from "@/components/TrackMenu";
import { useAuth } from "@/context/AuthContext";
import { usePlayer } from "@/context/PlayerContext";
import { useToast } from "@/context/ToastContext";
import { notifyPlaylistsChanged } from "@/lib/playlist-events";
import { trackFromRow, trackToRow } from "@/lib/track";

export default function SharedPlaylistPage() {
  const { token } = useParams();
  const { user, userId } = useAuth();
  const { playQueue } = usePlayer();
  const { showToast } = useToast();
  const [state, setState] = useState({ token: null, status: "loading", data: null });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    supabase.rpc("get_shared_playlist", { p_token: token }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) setState({ token, status: "error", data: null, message: error.message });
      else if (!data) setState({ token, status: "missing", data: null });
      else setState({ token, status: "ready", data });
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const current = state.token === token ? state : { status: "loading" };
  const tracks = current.status === "ready" ? current.data.tracks.map(trackFromRow) : [];

  const handleSave = async () => {
    if (saving || !userId || tracks.length === 0) return;
    setSaving(true);
    try {
      const { data: created, error } = await supabase
        .from("custom_playlists")
        .insert({ user_id: userId, name: current.data.name })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      for (let start = 0; start < tracks.length; start += 100) {
        const chunk = tracks.slice(start, start + 100).map((track, offset) => ({
          playlist_id: created.id,
          ...trackToRow(track),
          position: start + offset,
        }));
        const { error: chunkError } = await supabase.from("playlist_tracks").insert(chunk);
        if (chunkError) {
          await supabase.from("custom_playlists").delete().eq("id", created.id);
          throw new Error(chunkError.message);
        }
      }
      notifyPlaylistsChanged();
      showToast("Đã lưu playlist vào thư viện của bạn");
    } catch (err) {
      showToast(`Không lưu được playlist: ${err.message}`, { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8">
      {current.status === "loading" && <RowSkeleton count={6} />}

      {current.status === "missing" && (
        <EmptyState
          icon={ListMusic}
          title="Liên kết không còn dùng được"
          description="Playlist này đã được tắt chia sẻ hoặc liên kết không đúng."
        />
      )}

      {current.status === "error" && (
        <EmptyState icon={CircleAlert} title="Không mở được playlist" description={current.message} />
      )}

      {current.status === "ready" && (
        <>
          <PageHeader
            title={current.data.name}
            subtitle={`Playlist được chia sẻ · ${tracks.length} bài`}
          >
            <div className="flex flex-wrap items-center gap-2">
              {tracks.length > 0 && (
                <button type="button" onClick={() => playQueue(tracks, 0)} className="btn-primary">
                  <Play size={18} fill="currentColor" />
                  Phát tất cả
                </button>
              )}
              {user ? (
                <button type="button" onClick={handleSave} disabled={saving} className="btn-ghost">
                  {saving ? "Đang lưu..." : "Lưu vào thư viện"}
                </button>
              ) : (
                <LoginButton label="Đăng nhập để lưu" className="px-5 py-2 text-sm" />
              )}
            </div>
          </PageHeader>

          {tracks.length === 0 && (
            <EmptyState icon={ListMusic} title="Playlist đang trống" />
          )}

          <ul className="flex flex-col gap-0.5">
            {tracks.map((track, index) => (
              <li
                key={`${track.videoId}:${index}`}
                className="flex items-center gap-1 rounded-2xl px-2 py-1.5 transition-colors hover:bg-foreground/5"
              >
                <button
                  type="button"
                  onClick={() => playQueue(tracks, index)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="relative aspect-video w-20 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                    {track.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={track.thumbnail} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{track.title}</span>
                    <span className="block truncate text-xs text-muted">{track.channelTitle}</span>
                  </span>
                </button>
                {user && <TrackMenu track={track} className="shrink-0" />}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
