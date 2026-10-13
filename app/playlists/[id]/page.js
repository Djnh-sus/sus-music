"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Link2,
  Link2Off,
  ListMusic,
  Pencil,
  Play,
  Plus,
  Share2,
  Shuffle,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import ActionMenu from "@/components/ActionMenu";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import RequireAuth from "@/components/RequireAuth";
import { RowSkeleton } from "@/components/Skeleton";
import TrackMenu from "@/components/TrackMenu";
import { usePlayer } from "@/context/PlayerContext";
import { useToast } from "@/context/ToastContext";
import { trackFromRow } from "@/lib/track";
import { copyText } from "@/lib/clipboard";
import { authedFetch } from "@/lib/authed-fetch";
import { notifyPlaylistsChanged } from "@/lib/playlist-events";
import { addTrackToPlaylist } from "@/lib/playlist-ops";
import { changedRows, moveItem, reindex } from "@/lib/playlist-order";
import { useDragReorder } from "@/lib/use-drag-reorder";

function PlaylistDetailContent() {
  const { id } = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const { playQueue, playShuffled } = usePlayer();

  const [playlist, setPlaylist] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [tracksLoaded, setTracksLoaded] = useState(false);
  const tracksRef = useRef([]);
  const saveChainRef = useRef(Promise.resolve());
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareToken, setShareToken] = useState(null);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState(null);
  const [searching, setSearching] = useState(false);

  const setTracksSynced = (next) => {
    tracksRef.current = next;
    setTracks(next);
  };

  const loadPlaylist = async () => {
    const { data } = await supabase.from("custom_playlists").select("id, name").eq("id", id).single();
    setPlaylist(data);
  };

  const loadShareToken = async () => {
    const { data } = await supabase.from("custom_playlists").select("share_token").eq("id", id).single();
    setShareToken(data?.share_token || null);
  };

  const shareLink = (token) => `${window.location.origin}/p/${token}`;

  const handleShare = async () => {
    const token = shareToken || crypto.randomUUID().replaceAll("-", "");
    if (!shareToken) {
      const { error } = await supabase.from("custom_playlists").update({ share_token: token }).eq("id", id);
      if (error) {
        showToast(`Không bật được chia sẻ: ${error.message}`, { type: "error" });
        return;
      }
      setShareToken(token);
    }
    const ok = await copyText(shareLink(token));
    showToast(ok ? "Đã sao chép liên kết chia sẻ" : "Đã bật chia sẻ, nhưng chưa sao chép được liên kết");
  };

  const handleStopSharing = async () => {
    const { error } = await supabase.from("custom_playlists").update({ share_token: null }).eq("id", id);
    if (error) {
      showToast(`Không tắt được chia sẻ: ${error.message}`, { type: "error" });
      return;
    }
    setShareToken(null);
    showToast("Đã tắt chia sẻ, liên kết cũ không còn dùng được");
  };

  const loadTracks = async () => {
    const { data } = await supabase
      .from("playlist_tracks")
      .select("id, video_id, title, channel_title, thumbnail_url, position")
      .eq("playlist_id", id)
      .order("position", { ascending: true });
    setTracksSynced(data || []);
    setTracksLoaded(true);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPlaylist();
    loadShareToken();
    loadTracks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleMove = (from, to) => {
    const previous = tracksRef.current;
    const moved = moveItem(previous, from, to);
    if (moved === previous) return;

    const next = reindex(moved);
    setTracksSynced(next);

    const rows = changedRows(previous, next).map((row) => ({
      id: row.id,
      playlist_id: id,
      video_id: row.video_id,
      title: row.title,
      channel_title: row.channel_title,
      thumbnail_url: row.thumbnail_url,
      position: row.position,
    }));

    saveChainRef.current = saveChainRef.current.then(async () => {
      const { error } = await supabase.from("playlist_tracks").upsert(rows, { onConflict: "id" });
      if (error) {
        showToast(`Không lưu được thứ tự: ${error.message}`, { type: "error" });
        await loadTracks();
      }
    });
  };

  const { listRef, drag, getHandleProps } = useDragReorder({ onMove: handleMove });

  const handleRename = async (e) => {
    e.preventDefault();
    const name = nameDraft.trim();
    if (!name) {
      showToast("Tên playlist không được để trống", { type: "error" });
      return;
    }
    if (name === playlist?.name) {
      setRenaming(false);
      return;
    }

    const { error } = await supabase.from("custom_playlists").update({ name }).eq("id", id);
    if (error) {
      showToast(`Không đổi được tên: ${error.message}`, { type: "error" });
      return;
    }
    setPlaylist((current) => ({ ...current, name }));
    setRenaming(false);
    notifyPlaylistsChanged();
    showToast("Đã đổi tên playlist");
  };

  const handleDelete = async () => {
    const { error } = await supabase.from("custom_playlists").delete().eq("id", id);
    if (error) {
      showToast(`Không xoá được playlist: ${error.message}`, { type: "error" });
      setConfirmDelete(false);
      return;
    }
    notifyPlaylistsChanged();
    showToast("Đã xoá playlist");
    router.push("/playlists");
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim() || searching) return;
    setSearchError(null);
    setSearching(true);
    try {
      const res = await authedFetch(`/api/youtube/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Tìm kiếm thất bại");
      setSearchResults(data.items || []);
    } catch (err) {
      setSearchError(err.message);
    } finally {
      setSearching(false);
    }
  };

  const handleAddTrack = async (track) => {
    const result = await addTrackToPlaylist(id, track);
    if (result.status === "added") {
      showToast("Đã thêm vào playlist");
      loadTracks();
    } else if (result.status === "exists") {
      showToast("Bài đã có trong playlist");
    } else {
      showToast(`Không thêm được bài: ${result.message}`, { type: "error" });
    }
  };

  const handleRemoveTrack = async (trackRowId) => {
    await supabase.from("playlist_tracks").delete().eq("id", trackRowId);
    loadTracks();
  };

  const playFrom = (index) => {
    const queueTracks = tracks.map(trackFromRow);
    if (queueTracks.length > 0) playQueue(queueTracks, index);
  };

  const playShuffledAll = () => {
    const queueTracks = tracks.map(trackFromRow);
    if (queueTracks.length > 0) playShuffled(queueTracks);
  };

  const menuItems = [
    {
      label: shareToken ? "Sao chép liên kết chia sẻ" : "Chia sẻ playlist",
      icon: shareToken ? Link2 : Share2,
      onClick: handleShare,
    },
    ...(shareToken
      ? [{ label: "Tắt chia sẻ", icon: Link2Off, onClick: handleStopSharing }]
      : []),
    {
      label: "Đổi tên playlist",
      icon: Pencil,
      onClick: () => {
        setNameDraft(playlist?.name || "");
        setRenaming(true);
      },
    },
    { label: "Xoá playlist", icon: Trash2, danger: true, onClick: () => setConfirmDelete(true) },
  ];

  const rowClass = (index) => {
    let extra = "";
    if (drag && drag.from === index) extra = " opacity-50";
    else if (drag && drag.over === index) {
      extra =
        drag.over < drag.from
          ? " shadow-[inset_0_2px_0_0_var(--accent)]"
          : " shadow-[inset_0_-2px_0_0_var(--accent)]";
    }
    return `flex items-center gap-1 rounded-2xl px-2 py-1.5 transition-colors hover:bg-foreground/5${extra}`;
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8">
      {renaming ? (
        <form onSubmit={handleRename} className="mb-6 flex flex-wrap items-center gap-2">
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            aria-label="Tên playlist"
            autoFocus
            className="field min-w-0 flex-1"
          />
          <button type="submit" className="btn-primary">
            Lưu
          </button>
          <button type="button" onClick={() => setRenaming(false)} className="btn-ghost">
            Huỷ
          </button>
        </form>
      ) : (
        <PageHeader title={playlist?.name || "Playlist"} subtitle={tracksLoaded ? `${tracks.length} bài` : null}>
          <div className="flex flex-wrap items-center gap-2">
            {tracks.length > 0 && (
              <>
                <button type="button" onClick={() => playFrom(0)} className="btn-primary h-11">
                  <Play size={18} fill="currentColor" />
                  Phát tất cả
                </button>
                <button type="button" onClick={playShuffledAll} className="btn-ghost h-11">
                  <Shuffle size={18} />
                  Phát ngẫu nhiên
                </button>
              </>
            )}
            {confirmDelete ? (
              <span className="menu-pop flex items-center gap-2 rounded-full border-2 border-danger/50 py-1 pl-4 pr-1 text-sm">
                <span className="text-danger">Xoá playlist này?</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="rounded-full bg-danger px-3 py-1 font-bold text-accent-ink"
                >
                  Xoá
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-full px-3 py-1 text-muted"
                >
                  Huỷ
                </button>
              </span>
            ) : (
              <ActionMenu items={menuItems} label="Tuỳ chọn playlist" />
            )}
          </div>
        </PageHeader>
      )}

      {!tracksLoaded && <RowSkeleton count={5} />}

      {tracksLoaded && tracks.length === 0 && (
        <EmptyState
          icon={ListMusic}
          title="Playlist đang trống"
          description="Tìm bài hát ở mục bên dưới rồi bấm “Thêm” để cho vào playlist."
        />
      )}

      <ul ref={listRef} className="mb-2 flex flex-col gap-0.5">
        {tracks.map((t, index) => {
          const extraItems = [
            ...(index > 0
              ? [{ label: "Đẩy lên", icon: ArrowUp, onClick: () => handleMove(index, index - 1) }]
              : []),
            ...(index < tracks.length - 1
              ? [{ label: "Đẩy xuống", icon: ArrowDown, onClick: () => handleMove(index, index + 1) }]
              : []),
            {
              label: "Xoá khỏi playlist",
              icon: X,
              danger: true,
              onClick: () => handleRemoveTrack(t.id),
            },
          ];

          return (
            <li key={t.id} className={rowClass(index)}>
              <span
                role="button"
                aria-label="Kéo để sắp xếp"
                className="flex h-9 w-6 shrink-0 items-center justify-center text-muted opacity-50 transition hover:opacity-100"
                {...getHandleProps(index)}
              >
                <GripVertical size={16} />
              </span>
              <button
                type="button"
                onClick={() => playFrom(index)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="relative aspect-video w-20 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                  {t.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.thumbnail_url} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{t.title}</span>
                  <span className="block truncate text-xs text-muted">{t.channel_title}</span>
                </span>
              </button>
              <TrackMenu track={trackFromRow(t)} extraItems={extraItems} className="shrink-0" />
            </li>
          );
        })}
      </ul>

      <h2 className="mb-3 mt-10 font-display text-xl font-extrabold">Thêm bài hát</h2>
      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm bài hát để thêm..."
          aria-label="Tìm bài hát để thêm"
          className="field"
        />
        <button type="submit" disabled={searching || !query.trim()} className="btn-primary shrink-0">
          {searching ? "Đang tìm..." : "Tìm"}
        </button>
      </form>
      {searchError && (
        <p className="mb-3 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{searchError}</p>
      )}
      <ul className="flex flex-col gap-0.5">
        {searchResults.map((track) => (
          <li
            key={track.videoId}
            className="flex items-center gap-3 rounded-2xl px-2 py-1.5 transition-colors hover:bg-foreground/5"
          >
            <span className="relative aspect-video w-20 shrink-0 overflow-hidden rounded-lg bg-surface-2">
              {track.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={track.thumbnail} alt="" className="h-full w-full object-cover" />
              ) : null}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{track.title}</p>
              <p className="truncate text-xs text-muted">{track.channelTitle}</p>
            </div>
            <button
              type="button"
              onClick={() => handleAddTrack(track)}
              className="btn-ghost shrink-0 py-1.5 text-sm"
            >
              <Plus size={16} />
              Thêm
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PlaylistDetailPage() {
  return (
    <RequireAuth>
      <PlaylistDetailContent />
    </RequireAuth>
  );
}
