"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ExternalLink,
  Heart,
  ListEnd,
  ListMusic,
  ListPlus,
  ListStart,
  MoreHorizontal,
  Share2,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { useFavorite } from "@/lib/use-favorite";
import { addTrackToPlaylist } from "@/lib/playlist-ops";
import { copyText } from "@/lib/clipboard";
import { youtubeWatchUrl } from "@/lib/youtube-url";
import { usePopover } from "@/lib/use-popover";
import MenuItem, { menuItemClass } from "@/components/MenuItem";

const PANEL_HEIGHT_ESTIMATE = 360;
const PANEL_WIDTH = 256;

function TrackMenuPanel({ track, onClose, style, extraItems, panelRef }) {
  const { addToQueue, playNextInQueue } = usePlayer();
  const { userId } = useAuth();
  const { showToast } = useToast();
  const favorite = useFavorite(track);
  const [view, setView] = useState("main");
  const [playlists, setPlaylists] = useState(null);

  useEffect(() => {
    if (view !== "playlists" || !userId) return;
    let cancelled = false;

    supabase
      .from("custom_playlists")
      .select("id, name")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setPlaylists(data || []);
      });

    return () => {
      cancelled = true;
    };
  }, [view, userId]);

  const handlePlayNext = () => {
    playNextInQueue(track);
    showToast("Sẽ phát tiếp theo");
    onClose();
  };

  const handleAddToQueue = () => {
    addToQueue(track);
    showToast("Đã thêm vào hàng chờ");
    onClose();
  };

  const handleShare = async () => {
    const ok = await copyText(youtubeWatchUrl(track.videoId));
    showToast(ok ? "Đã sao chép liên kết" : "Không sao chép được liên kết");
    onClose();
  };

  const handleFavorite = async () => {
    const result = await favorite.toggle();
    if (result === true) showToast("Đã thêm vào yêu thích");
    else if (result === false) showToast("Đã bỏ khỏi yêu thích");
    else showToast("Không cập nhật được yêu thích");
    onClose();
  };

  const handleAddToPlaylist = async (playlist) => {
    const result = await addTrackToPlaylist(playlist.id, track);
    if (result.status === "added") showToast(`Đã thêm vào "${playlist.name}"`);
    else if (result.status === "exists") showToast(`Bài đã có trong "${playlist.name}"`);
    else showToast(`Không thêm được: ${result.message}`);
    onClose();
  };

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label="Tuỳ chọn bài hát"
      style={style}
      className="menu-pop fixed z-[65] w-64 overflow-hidden rounded-2xl border-2 border-border bg-surface-2 py-1.5 shadow-2xl"
    >
      {view === "main" ? (
        <>
          <MenuItem icon={ListStart} onClick={handlePlayNext}>
            Phát tiếp theo
          </MenuItem>
          <MenuItem icon={ListEnd} onClick={handleAddToQueue}>
            Thêm vào hàng chờ
          </MenuItem>
          <MenuItem icon={ListPlus} onClick={() => setView("playlists")}>
            Thêm vào playlist…
          </MenuItem>
          <MenuItem icon={Heart} onClick={handleFavorite} disabled={favorite.busy}>
            {favorite.isFavorite ? "Bỏ yêu thích" : "Thêm vào yêu thích"}
          </MenuItem>
          <MenuItem icon={Share2} onClick={handleShare}>
            Chia sẻ (sao chép liên kết)
          </MenuItem>
          <a
            role="menuitem"
            href={youtubeWatchUrl(track.videoId)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className={menuItemClass}
          >
            <ExternalLink size={16} className="shrink-0 text-muted" />
            Mở trên YouTube
          </a>
          {extraItems.length > 0 && <div className="my-1 h-px bg-border" />}
          {extraItems.map((item) => (
            <MenuItem
              key={item.label}
              icon={item.icon}
              danger={item.danger}
              onClick={() => {
                item.onClick();
                onClose();
              }}
            >
              {item.label}
            </MenuItem>
          ))}
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setView("main")}
            aria-label="Quay lại"
            className="flex w-full items-center gap-1 px-3 py-2 text-left text-sm font-semibold text-muted transition-colors hover:bg-foreground/8"
          >
            <ChevronLeft size={16} /> Chọn playlist
          </button>
          {playlists === null && <p className="px-4 py-2 text-sm text-muted">Đang tải...</p>}
          {playlists !== null && playlists.length === 0 && (
            <p className="px-4 py-2 text-sm text-muted">Chưa có playlist nào.</p>
          )}
          <div className="max-h-56 overflow-y-auto">
            {(playlists ?? []).map((playlist) => (
              <MenuItem key={playlist.id} icon={ListMusic} onClick={() => handleAddToPlaylist(playlist)}>
                {playlist.name}
              </MenuItem>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function TrackMenu({
  track,
  className = "",
  buttonClassName = "",
  extraItems = [],
  placement = "auto",
  icon: Icon = MoreHorizontal,
}) {
  const { open, style, toggle, close, rootRef, buttonRef, panelRef } = usePopover({
    width: PANEL_WIDTH,
    heightEstimate: PANEL_HEIGHT_ESTIMATE,
    placement,
  });

  return (
    <div ref={rootRef} className={className}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label="Tuỳ chọn bài hát"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`icon-btn ${buttonClassName}`}
      >
        <Icon size={19} />
      </button>
      {open &&
        createPortal(
          <TrackMenuPanel
            track={track}
            onClose={close}
            style={style}
            extraItems={extraItems}
            panelRef={panelRef}
          />,
          document.body
        )}
    </div>
  );
}
