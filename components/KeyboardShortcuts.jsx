"use client";

import { useEffect } from "react";
import { usePlayer } from "@/context/PlayerContext";

const SEEK_SECONDS = 5;
const VOLUME_STEP = 5;
const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const INTERACTIVE_SELECTOR = 'button, a, summary, [role="button"], [role="menuitem"], [role="slider"]';

function isEditable(target) {
  return target instanceof HTMLElement && (EDITABLE_TAGS.has(target.tagName) || target.isContentEditable);
}

function isInteractive(target) {
  return target instanceof HTMLElement && target.closest(INTERACTIVE_SELECTOR) !== null;
}

export default function KeyboardShortcuts() {
  const {
    currentTrack,
    volume,
    togglePlay,
    seekBy,
    setVolume,
    toggleMute,
    playNext,
    playPrev,
    toggleShuffle,
    cycleRepeat,
  } = usePlayer();

  const hasTrack = currentTrack !== null;

  useEffect(() => {
    if (!hasTrack) return;

    const onKeyDown = (e) => {
      if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditable(e.target)) return;

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      switch (key) {
        case " ":
          if (e.repeat || isInteractive(e.target)) return;
          togglePlay();
          break;
        case "ArrowRight":
          seekBy(SEEK_SECONDS);
          break;
        case "ArrowLeft":
          seekBy(-SEEK_SECONDS);
          break;
        case "ArrowUp":
          setVolume(volume + VOLUME_STEP);
          break;
        case "ArrowDown":
          setVolume(volume - VOLUME_STEP);
          break;
        case "m":
          if (e.repeat) return;
          toggleMute();
          break;
        case "n":
          if (e.repeat) return;
          playNext();
          break;
        case "p":
          if (e.repeat) return;
          playPrev();
          break;
        case "s":
          if (e.repeat) return;
          toggleShuffle();
          break;
        case "r":
          if (e.repeat) return;
          cycleRepeat();
          break;
        default:
          return;
      }

      e.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    hasTrack,
    volume,
    togglePlay,
    seekBy,
    setVolume,
    toggleMute,
    playNext,
    playPrev,
    toggleShuffle,
    cycleRepeat,
  ]);

  return null;
}
