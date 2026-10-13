"use client";

import { Play } from "lucide-react";
import TrackMenu from "@/components/TrackMenu";
import Equalizer from "@/components/Equalizer";
import { usePlayer } from "@/context/PlayerContext";

export default function TrackCard({ title, subtitle, thumbnail, onPlay, track, fluid = false }) {
  const { currentTrack, isPlaying } = usePlayer();
  const active = Boolean(track) && currentTrack?.videoId === track.videoId;

  return (
    <div className={`group card-lift snap-start ${fluid ? "w-full" : "w-40 shrink-0"}`}>
      <button type="button" onClick={onPlay} className="block w-full text-left">
        <div
          className={`relative mb-3 aspect-square w-full overflow-hidden rounded-2xl border-2 bg-surface-2 transition-colors duration-200 ${
            active ? "border-accent" : "border-border group-hover:border-foreground/30"
          }`}
        >
          {thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnail}
              alt=""
              className="h-full w-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-110"
            />
          ) : null}
          {active && (
            <span className="absolute bottom-2 left-2 rounded-full bg-scrim/65 px-2.5 py-1.5">
              <Equalizer playing={isPlaying} />
            </span>
          )}
          <span className="absolute bottom-2 right-2 flex h-11 w-11 translate-y-2 items-center justify-center rounded-full bg-accent text-accent-ink opacity-0 shadow-[0_3px_0_0_var(--accent-lip)] transition duration-200 group-hover:translate-y-0 group-hover:opacity-100">
            <Play size={20} fill="currentColor" />
          </span>
        </div>
        <p className={`truncate text-sm font-bold ${active ? "text-accent" : ""}`}>{title}</p>
        {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
      </button>
      {track && (
        <TrackMenu
          track={track}
          buttonClassName="min-h-9 min-w-9"
          className="card-menu absolute right-1.5 top-1.5 rounded-full bg-scrim/60"
        />
      )}
    </div>
  );
}
