"use client";

import { usePlayer } from "@/context/PlayerContext";

export default function MainContent({ children }) {
  const { currentTrack } = usePlayer();

  return (
    <main className="app-main" data-player={currentTrack ? "true" : "false"}>
      {children}
    </main>
  );
}
