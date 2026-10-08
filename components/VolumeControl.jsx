"use client";

import { Volume1, Volume2, VolumeX } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";

export default function VolumeControl({ className = "", sliderClassName = "w-24" }) {
  const { volume, isMuted, setVolume, toggleMute } = usePlayer();
  const shown = isMuted ? 0 : volume;
  const Icon = shown === 0 ? VolumeX : shown < 50 ? Volume1 : Volume2;

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={toggleMute}
        aria-label={isMuted ? "Bật tiếng" : "Tắt tiếng"}
        className="icon-btn"
      >
        <Icon size={19} />
      </button>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={shown}
        onChange={(e) => setVolume(Number(e.target.value))}
        aria-label="Âm lượng"
        className={`seek ${sliderClassName}`}
        style={{ "--pct": `${shown}%` }}
      />
    </div>
  );
}
