"use client";

import { usePlayerTime } from "@/context/PlayerContext";
import { formatTime } from "@/lib/format-time";

export default function TimeLabel({ className = "" }) {
  const { currentTime, duration } = usePlayerTime();

  return (
    <span className={className}>
      {formatTime(currentTime)} / {formatTime(duration)}
    </span>
  );
}
