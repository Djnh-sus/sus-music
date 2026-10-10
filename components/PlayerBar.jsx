"use client";

import { useRef } from "react";
import { ChevronUp, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { usePlayer, usePlayerTime } from "@/context/PlayerContext";
import FavoriteButton from "@/components/FavoriteButton";
import ProgressBar from "@/components/ProgressBar";
import TimeLabel from "@/components/TimeLabel";
import VolumeControl from "@/components/VolumeControl";

function MiniProgress() {
  const { currentTime, duration } = usePlayerTime();
  const percent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div aria-hidden="true" className="absolute inset-x-0 -top-0.5 h-[3px] bg-white/10 md:hidden">
      <div
        className="h-full bg-accent transition-[width] duration-500 ease-linear"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export default function PlayerBar() {
  const {
    currentTrack,
    isPlaying,
    isReady,
    hasNext,
    playbackError,
    togglePlay,
    playNext,
    playPrev,
    isNowPlayingOpen,
    openNowPlaying,
    closeNowPlaying,
    miniThumbRef,
  } = usePlayer();

  const swipeRef = useRef(null);
  const suppressClickRef = useRef(false);

  if (!currentTrack) return null;

  const toggleExpanded = () => (isNowPlayingOpen ? closeNowPlaying() : openNowPlaying());

  const activate = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    toggleExpanded();
  };

  const handleBarClick = (e) => {
    if (e.target.closest("button, a, input, select, textarea, [role='slider']")) return;
    activate();
  };

  const handlePointerDown = (e) => {
    if (e.pointerType !== "touch") return;
    swipeRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e) => {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start || e.pointerType !== "touch") return;
    const dy = e.clientY - start.y;
    const dx = e.clientX - start.x;
    if (dy < -36 && Math.abs(dx) < 60 && !isNowPlayingOpen) {
      suppressClickRef.current = true;
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 350);
      openNowPlaying();
    }
  };

  return (
    <div
      className="player-bar bar-in"
      onClick={handleBarClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      <MiniProgress />

      <div className="flex h-full items-center gap-2 px-3 md:gap-4 md:px-5">
        <button
          type="button"
          onClick={activate}
          aria-label={isNowPlayingOpen ? "Thu nhỏ trình phát" : "Mở trình phát"}
          className="flex min-w-0 flex-1 items-center gap-3 text-left md:w-64 md:flex-none xl:w-72"
        >
          <div
            ref={miniThumbRef}
            className="relative aspect-video w-16 shrink-0 overflow-hidden rounded-lg bg-surface-2 md:w-24"
          >
            {currentTrack.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentTrack.thumbnail} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold md:text-[15px]">{currentTrack.title}</p>
            {playbackError ? (
              <p className="truncate text-xs text-danger">{playbackError}</p>
            ) : (
              <p className="truncate text-xs text-muted">{currentTrack.channelTitle}</p>
            )}
          </div>
        </button>

        <div className="hidden shrink-0 items-center gap-1 md:flex">
          <button type="button" onClick={playPrev} aria-label="Bài trước" className="icon-btn">
            <SkipBack size={20} fill="currentColor" />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            disabled={!isReady}
            aria-label={isPlaying ? "Tạm dừng" : "Phát"}
            className="btn-primary h-12 w-12 p-0"
          >
            {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
          </button>
          <button
            type="button"
            onClick={playNext}
            disabled={!hasNext}
            aria-label="Bài kế tiếp"
            className="icon-btn"
          >
            <SkipForward size={20} fill="currentColor" />
          </button>
        </div>

        <div className="hidden min-w-0 flex-1 items-center gap-3 md:flex">
          <ProgressBar className="min-w-0 flex-1" />
          <TimeLabel className="w-24 shrink-0 text-right text-xs tabular-nums text-muted" />
        </div>

        <VolumeControl className="hidden shrink-0 2xl:flex" />
        <FavoriteButton track={currentTrack} className="icon-btn hidden shrink-0 xl:inline-flex" />
        <button
          type="button"
          onClick={toggleExpanded}
          aria-label={isNowPlayingOpen ? "Thu nhỏ trình phát" : "Mở trình phát"}
          aria-expanded={isNowPlayingOpen}
          className="icon-btn hidden shrink-0 md:inline-flex"
        >
          <ChevronUp
            size={22}
            className={`transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isNowPlayingOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        <button
          type="button"
          onClick={togglePlay}
          disabled={!isReady}
          aria-label={isPlaying ? "Tạm dừng" : "Phát"}
          className="btn-primary h-11 w-11 shrink-0 p-0 md:hidden"
        >
          {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
        </button>
        <button
          type="button"
          onClick={playNext}
          disabled={!hasNext}
          aria-label="Bài kế tiếp"
          className="icon-btn shrink-0 text-foreground md:hidden"
        >
          <SkipForward size={22} fill="currentColor" />
        </button>
      </div>
    </div>
  );
}
