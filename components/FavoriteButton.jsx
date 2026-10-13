"use client";

import { Heart } from "lucide-react";
import { useFavorite } from "@/lib/use-favorite";

export default function FavoriteButton({ track, className = "icon-btn", size = 20, flip }) {
  const { isFavorite, busy, toggle } = useFavorite(track);

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-label={isFavorite ? "Bỏ yêu thích" : "Thêm vào yêu thích"}
      aria-pressed={isFavorite}
      data-flip={flip}
      className={`${className} ${isFavorite ? "text-danger" : ""}`}
    >
      <Heart
        key={isFavorite ? "on" : "off"}
        size={size}
        fill={isFavorite ? "currentColor" : "none"}
        className={isFavorite ? "heart-pop" : ""}
      />
    </button>
  );
}
