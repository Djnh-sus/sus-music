"use client";

import { usePlayer } from "@/context/PlayerContext";

export default function MainContent({ children, className = "" }) {
  const { currentTrack } = usePlayer();

  return (
    <main className={`app-main ${className}`.trim()} data-player={currentTrack ? "true" : "false"}>
      {children}
    </main>
  );
}
