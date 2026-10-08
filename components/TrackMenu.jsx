"use client";

import { useEffect, useRef, useState } from "react";
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

const PANEL_HEIGHT_ESTIMATE = 360;
const PANEL_WIDTH = 256;

const itemClass =
  "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-white/8 disabled:opacity-50";

function MenuItem({ icon: Icon, danger = false, children, ...props }) {
  return (
    <button type="button" role="menuitem" className={`${itemClass} ${danger ? "text-danger" : ""}`} {...props}>
      <Icon size={16} className={danger ? "shrink-0" : "shrink-0 text-muted"} />
      <span className="min-w-0 truncate">{children}</span>
    </button>
  );
}

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
            className={itemClass}
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
            className="flex w-full items-center gap-1 px-3 py-2 text-left text-sm font-semibold text-muted transition-colors hover:bg-white/8"
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

export default function TrackMenu({ track, className = "", buttonClassName = "", extraItems = [] }) {
  const [panelStyle, setPanelStyle] = useState(null);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const open = panelStyle !== null;

  const close = () => setPanelStyle(null);

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 8)
    );
    const opensUp =
      rect.bottom + PANEL_HEIGHT_ESTIMATE > window.innerHeight && rect.top > PANEL_HEIGHT_ESTIMATE;
    setPanelStyle(
      opensUp
        ? { left, bottom: window.innerHeight - rect.top + 4, transformOrigin: "bottom right" }
        : { left, top: rect.bottom + 4 }
    );
  };

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e) => {
      if (rootRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      setPanelStyle(null);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setPanelStyle(null);
      }
    };
    const onResize = () => setPanelStyle(null);
    const onScroll = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      setPanelStyle(null);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

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
        <MoreHorizontal size={19} />
      </button>
      {open &&
        createPortal(
          <TrackMenuPanel
            track={track}
            onClose={close}
            style={panelStyle}
            extraItems={extraItems}
            panelRef={panelRef}
          />,
          document.body
        )}
    </div>
  );
}
