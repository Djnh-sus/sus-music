"use client";

import { useEffect, useRef, useState } from "react";
import { usePlayer, usePlayerTime } from "@/context/PlayerContext";

export default function ProgressBar({ className = "" }) {
  const { isReady, seekTo } = usePlayer();
  const { currentTime, duration } = usePlayerTime();
  const [dragValue, setDragValue] = useState(null);
  const dragRef = useRef(null);
  const inputRef = useRef(null);

  const max = duration || 0;
  const value = dragValue ?? Math.min(currentTime, max);
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0;

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const commit = () => {
      if (dragRef.current === null) return;
      const target = dragRef.current;
      dragRef.current = null;
      setDragValue(null);
      seekTo(target);
    };

    input.addEventListener("change", commit);
    return () => input.removeEventListener("change", commit);
  }, [seekTo]);

  const handleChange = (e) => {
    const next = Number(e.target.value);
    dragRef.current = next;
    setDragValue(next);
  };

  return (
    <input
      ref={inputRef}
      type="range"
      min={0}
      max={max}
      step={1}
      value={value}
      onChange={handleChange}
      disabled={!isReady || !duration}
      aria-label="Vị trí phát"
      className={`seek ${className}`}
      style={{ "--pct": `${percent}%` }}
    />
  );
}
