"use client";

import { useRef } from "react";
import { ChevronUp, EllipsisVertical, Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { useNowPlayingUi, usePlayer, usePlayerTime } from "@/context/PlayerContext";
import FavoriteButton from "@/components/FavoriteButton";
import ProgressBar from "@/components/ProgressBar";
import TimeLabel from "@/components/TimeLabel";
import TrackMenu from "@/components/TrackMenu";
import VolumeControl from "@/components/VolumeControl";
import { useSettled } from "@/lib/use-settled";

function MiniProgress() {
  const { currentTime, duration } = usePlayerTime();
  const percent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div aria-hidden="true" className="absolute inset-x-0 -top-0.5 h-[3px] bg-foreground/10 md:hidden">
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
    closePlayer,
    miniThumbRef,
  } = usePlayer();
  const { isNowPlayingOpen, openNowPlaying, closeNowPlaying } = useNowPlayingUi();

  const playingSettled = useSettled(isPlaying);

  const swipeRef = useRef(null);
  const suppressClickRef = useRef(false);

  if (!currentTrack) return null;

  const toggleExpanded = () => (isNowPlayingOpen ? closeNowPlaying() : openNowPlaying());
  const showClose = !playingSettled && !isNowPlayingOpen;

  const activate = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    toggleExpanded();
  };

  const handleBarClick = (e) => {
    if (e.target.closest("button, a, input, select, textarea, [role='slider'], [role='menu']")) return;
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
      data-open={isNowPlayingOpen}
      onClick={handleBarClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      <MiniProgress />

      <div className="flex h-full items-center gap-2 px-3 md:gap-2 md:px-5 lg:gap-4">
        <button
          type="button"
          onClick={activate}
          aria-label={isNowPlayingOpen ? "Thu nhỏ trình phát" : "Mở trình phát"}
          className="flex min-w-0 flex-1 items-center gap-3 text-left md:w-44 md:flex-none lg:w-64 xl:w-72"
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

          <div className="min-w-0 flex-1" data-flip="title">
            <p className="truncate text-sm font-bold md:text-[15px]">{currentTrack.title}</p>
            {playbackError ? (
              <p className="truncate text-xs text-danger">{playbackError}</p>
            ) : (
              <p className="truncate text-xs text-muted">{currentTrack.channelTitle}</p>
            )}
          </div>
        </button>

        <div className="hidden shrink-0 items-center gap-1 md:flex" data-flip="transport">
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
          <div data-flip="progress" className="flex min-w-0 flex-1 items-center">
            <ProgressBar className="min-w-0 flex-1" />
          </div>
          <TimeLabel
            flip="time"
            className="hidden w-24 shrink-0 text-right text-xs tabular-nums text-muted lg:block"
          />
        </div>

        <VolumeControl flip="volume" className="hidden shrink-0 2xl:flex" />
        <FavoriteButton
          track={currentTrack}
          flip="heart"
          className="icon-btn hidden shrink-0 xl:inline-flex"
        />
        <TrackMenu
          track={currentTrack}
          icon={EllipsisVertical}
          placement="up"
          className="hidden shrink-0 md:block"
        />
        <button
          type="button"
          onClick={showClose ? closePlayer : toggleExpanded}
          aria-label={
            showClose ? "Đóng trình phát" : isNowPlayingOpen ? "Thu nhỏ trình phát" : "Mở trình phát"
          }
          aria-expanded={showClose ? undefined : isNowPlayingOpen}
          className="icon-btn hidden shrink-0 md:inline-flex"
        >
          <span className="relative block h-[22px] w-[22px]">
            <ChevronUp
              size={22}
              className={`absolute inset-0 transition-[opacity,transform] duration-300 [transition-timing-function:var(--ease-out)] ${
                showClose ? "rotate-90 scale-75 opacity-0" : "opacity-100"
              } ${isNowPlayingOpen ? "rotate-180" : ""}`}
            />
            <X
              size={22}
              className={`absolute inset-0 transition-[opacity,transform] duration-300 [transition-timing-function:var(--ease-out)] ${
                showClose ? "opacity-100" : "-rotate-90 scale-75 opacity-0"
              }`}
            />
          </span>
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
