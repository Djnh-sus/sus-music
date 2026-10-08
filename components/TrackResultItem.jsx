"use client";

import { ListPlus, Play } from "lucide-react";
import TrackMenu from "@/components/TrackMenu";
import Equalizer from "@/components/Equalizer";
import { usePlayer } from "@/context/PlayerContext";
import { formatDuration } from "@/lib/duration";

export default function TrackResultItem({ track, onPlay, onAddToQueue }) {
  const { currentTrack, isPlaying } = usePlayer();
  const active = currentTrack?.videoId === track.videoId;
  const durationLabel = track.isLive ? "TRỰC TIẾP" : formatDuration(track.durationSeconds);

  return (
    <li
      className={`group flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors ${
        active ? "bg-surface" : "hover:bg-white/5"
      }`}
    >
      <button
        type="button"
        onClick={onPlay}
        aria-label={`Phát ${track.title}`}
        className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-xl bg-surface-2 md:w-36"
      >
        {track.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={track.thumbnail}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-110"
          />
        ) : null}
        <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-ink shadow-[0_3px_0_0_var(--accent-lip)]">
            <Play size={18} fill="currentColor" />
          </span>
        </span>
        {active && (
          <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/65 px-2 py-1">
            <Equalizer playing={isPlaying} />
          </span>
        )}
        {durationLabel && (
          <span
            className={`absolute bottom-1.5 right-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
              track.isLive ? "bg-brand-red text-white" : "bg-black/70 text-foreground"
            }`}
          >
            {durationLabel}
          </span>
        )}
      </button>

      <button type="button" onClick={onPlay} className="min-w-0 flex-1 text-left">
        <span className={`line-clamp-2 text-sm font-bold ${active ? "text-accent" : ""}`}>
          {track.title}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted">{track.channelTitle}</span>
      </button>

      <button
        type="button"
        onClick={onAddToQueue}
        aria-label="Thêm vào hàng chờ"
        className="icon-btn hidden sm:inline-flex"
      >
        <ListPlus size={19} />
      </button>
      <TrackMenu track={track} />
    </li>
  );
}
