"use client";

import { useEffect, useState } from "react";
import { ListMusic, Play } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import EmptyState from "@/components/EmptyState";
import LoginButton from "@/components/LoginButton";
import PageHeader from "@/components/PageHeader";
import PlaylistCard from "@/components/PlaylistCard";
import RequireAuth from "@/components/RequireAuth";
import { GridSkeleton } from "@/components/Skeleton";
import { usePlayer } from "@/context/PlayerContext";
import { useToast } from "@/context/ToastContext";
import { trackToRow } from "@/lib/track";
import { useAuth } from "@/context/AuthContext";
import { notifyPlaylistsChanged } from "@/lib/playlist-events";
import {
  fetchMyYoutubePlaylists,
  fetchYoutubePlaylistItems,
  isYoutubeReauthError,
} from "@/lib/youtube-client";

const IMPORT_CHUNK_SIZE = 100;

function PlaylistsContent() {
  const [customPlaylists, setCustomPlaylists] = useState(null);
  const [newName, setNewName] = useState("");
  const [ytPlaylists, setYtPlaylists] = useState([]);
  const [ytError, setYtError] = useState(null);
  const [ytReauth, setYtReauth] = useState(false);
  const [ytLoading, setYtLoading] = useState(true);
  const { playQueue } = usePlayer();
  const [importingId, setImportingId] = useState(null);
  const { userId } = useAuth();
  const { showToast } = useToast();

  const handleYoutubeError = (err) => {
    if (isYoutubeReauthError(err)) {
      setYtReauth(true);
      setYtError(null);
    } else {
      setYtError(err.message);
    }
  };

  const loadCustomPlaylists = async () => {
    const { data, error } = await supabase
      .from("custom_playlists")
      .select("id, name, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      showToast(`Không tải được playlist: ${error.message}`, { type: "error" });
      setCustomPlaylists((current) => current ?? []);
      return;
    }
    setCustomPlaylists(data || []);
  };

  const loadYoutubePlaylists = async () => {
    setYtLoading(true);
    setYtError(null);
    setYtReauth(false);
    try {
      const items = await fetchMyYoutubePlaylists();
      setYtPlaylists(items);
    } catch (err) {
      handleYoutubeError(err);
    } finally {
      setYtLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCustomPlaylists();
    loadYoutubePlaylists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name || !userId) return;

    const { error } = await supabase
      .from("custom_playlists")
      .insert({ user_id: userId, name });

    if (error) {
      showToast(`Không tạo được playlist: ${error.message}`, { type: "error" });
      return;
    }
    setNewName("");
    loadCustomPlaylists();
    notifyPlaylistsChanged();
    showToast(`Đã tạo playlist "${name}"`);
  };

  const handlePlayYoutubePlaylist = async (playlistId) => {
    try {
      const tracks = await fetchYoutubePlaylistItems(playlistId);
      if (tracks.length > 0) playQueue(tracks, 0);
    } catch (err) {
      handleYoutubeError(err);
    }
  };

  const handleImport = async (playlist) => {
    if (importingId || !userId) return;
    setImportingId(playlist.id);

    try {
      const items = await fetchYoutubePlaylistItems(playlist.id);
      if (items.length === 0) {
        showToast("Playlist này không có bài nào để nhập");
        return;
      }

      const { data: created, error } = await supabase
        .from("custom_playlists")
        .insert({ user_id: userId, name: playlist.title })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      for (let start = 0; start < items.length; start += IMPORT_CHUNK_SIZE) {
        const chunk = items.slice(start, start + IMPORT_CHUNK_SIZE).map((track, offset) => ({
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

      await loadCustomPlaylists();
      notifyPlaylistsChanged();
      showToast(`Đã nhập ${items.length} bài vào "${playlist.title}"`);
    } catch (err) {
      if (isYoutubeReauthError(err)) handleYoutubeError(err);
      else showToast(`Nhập playlist thất bại: ${err.message}`, { type: "error" });
    } finally {
      setImportingId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
      <PageHeader title="Playlist" subtitle="Playlist của bạn và playlist trên YouTube" />

      <section className="mb-12">
        <h2 className="mb-3 font-display text-xl font-extrabold md:text-2xl">Playlist của bạn</h2>
        <form onSubmit={handleCreate} className="mb-6 flex max-w-lg gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Tên playlist mới"
            aria-label="Tên playlist mới"
            className="field"
          />
          <button type="submit" disabled={!newName.trim()} className="btn-primary shrink-0">
            Tạo
          </button>
        </form>

        {customPlaylists === null && <GridSkeleton count={6} />}

        {customPlaylists !== null && customPlaylists.length === 0 && (
          <EmptyState
            icon={ListMusic}
            title="Chưa có playlist nào"
            description="Đặt tên ở ô phía trên để tạo playlist đầu tiên."
          />
        )}

        {customPlaylists !== null && customPlaylists.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-x-4 gap-y-6">
            {customPlaylists.map((pl) => (
              <PlaylistCard key={pl.id} fluid href={`/playlists/${pl.id}`} title={pl.name} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl font-extrabold md:text-2xl">
          Playlist YouTube của bạn
        </h2>

        {ytLoading && <GridSkeleton count={6} />}

        {ytError && (
          <p className="mb-4 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{ytError}</p>
        )}

        {ytReauth && (
          <div className="mb-4 flex flex-col items-start gap-3 rounded-2xl border-2 border-border bg-surface/60 p-4">
            <p className="text-sm text-danger">
              Quyền truy cập YouTube đã hết hạn hoặc bị thu hồi, cần kết nối lại.
            </p>
            <LoginButton label="Kết nối lại YouTube" />
          </div>
        )}

        {!ytLoading && !ytError && !ytReauth && ytPlaylists.length === 0 && (
          <EmptyState
            icon={ListMusic}
            title="Không có playlist nào trên YouTube"
            description="Playlist bạn tạo trên YouTube sẽ hiện ở đây để nhập về."
          />
        )}

        {!ytLoading && ytPlaylists.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-x-4 gap-y-6">
            {ytPlaylists.map((pl) => (
              <div key={pl.id} className="group">
                <button
                  type="button"
                  onClick={() => handlePlayYoutubePlaylist(pl.id)}
                  className="block w-full text-left"
                >
                  <div className="relative mb-3 aspect-square w-full overflow-hidden rounded-2xl border-2 border-border bg-surface-2 transition-colors duration-200 group-hover:border-accent">
                    {pl.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={pl.thumbnail}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-110"
                      />
                    ) : null}
                    <span className="absolute bottom-2 right-2 flex h-11 w-11 translate-y-2 items-center justify-center rounded-full bg-accent text-accent-ink opacity-0 shadow-[0_3px_0_0_var(--accent-lip)] transition duration-200 group-hover:translate-y-0 group-hover:opacity-100">
                      <Play size={20} fill="currentColor" />
                    </span>
                  </div>
                  <p className="truncate text-sm font-bold">{pl.title}</p>
                  <p className="text-xs text-muted">{pl.itemCount} video</p>
                </button>
                <button
                  type="button"
                  onClick={() => handleImport(pl)}
                  disabled={importingId !== null}
                  aria-label={`Nhập playlist ${pl.title}`}
                  className="btn-ghost mt-2 w-full py-1 text-xs"
                >
                  {importingId === pl.id ? "Đang nhập..." : "Nhập về"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function PlaylistsPage() {
  return (
    <RequireAuth>
      <PlaylistsContent />
    </RequireAuth>
  );
}
