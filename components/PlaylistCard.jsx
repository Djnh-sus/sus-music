"use client";

import Link from "next/link";
import { ListMusic } from "lucide-react";

export default function PlaylistCard({ href, title, subtitle, fluid = false }) {
  return (
    <Link
      href={href}
      className={`group card-lift snap-start ${fluid ? "block w-full" : "block w-40 shrink-0"}`}
    >
      <div className="mb-3 flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-border bg-tile transition-colors duration-200 group-hover:border-accent">
        <ListMusic
          size={44}
          className="text-accent transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-125 group-hover:-rotate-6"
        />
      </div>
      <p className="truncate text-sm font-bold">{title}</p>
      {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
    </Link>
  );
}
