"use client";

import { usePlayerTime } from "@/context/PlayerContext";
import { formatTime } from "@/lib/format-time";

export default function TimeLabel({ className = "", flip }) {
  const { currentTime, duration } = usePlayerTime();

  return (
    <span className={className} data-flip={flip}>
      {formatTime(currentTime)} / {formatTime(duration)}
    </span>
  );
}
