"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Trash2, X } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import { useDragReorder } from "@/lib/use-drag-reorder";
import { formatDuration } from "@/lib/duration";
import TrackMenu from "@/components/TrackMenu";
import Equalizer from "@/components/Equalizer";

const INITIAL_ROWS = 14;
const FULL_RENDER_DELAY_MS = 450;

export default function QueueList({ scroll = false }) {
  const {
    queue,
    currentIndex,
    isPlaying,
    playTrackAt,
    removeFromQueue,
    moveInQueue,
    clearUpcoming,
  } = usePlayer();

  const { listRef, drag, getHandleProps } = useDragReorder({ onMove: moveInQueue });
  const [fullRender, setFullRender] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setFullRender(true), FULL_RENDER_DELAY_MS);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!scroll) return;
    const row = listRef.current?.children[currentIndex];
    row?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [scroll, currentIndex, listRef]);

  if (queue.length === 0) return null;

  const rowLimit = fullRender ? queue.length : Math.max(INITIAL_ROWS, currentIndex + 8);
  const hasUpcoming = currentIndex >= 0 && currentIndex < queue.length - 1;

  const dragClass = (index) => {
    if (!drag) return "";
    if (drag.from === index) return " opacity-50";
    if (drag.over === index) {
      return drag.over < drag.from
        ? " shadow-[inset_0_2px_0_0_var(--accent)]"
        : " shadow-[inset_0_-2px_0_0_var(--accent)]";
    }
    return "";
  };

  return (
    <section aria-label="Hàng đợi" className={`flex flex-col ${scroll ? "h-full min-h-0" : ""}`}>
      <div className="flex shrink-0 items-center justify-between gap-2 px-5 pb-2 pt-4">
        <h2 className="font-display text-lg font-bold">
          Hàng đợi <span className="text-sm font-semibold text-muted">· {queue.length} bài</span>
        </h2>
        {hasUpcoming && (
          <button
            type="button"
            onClick={clearUpcoming}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-muted transition hover:bg-white/10 hover:text-foreground"
          >
            <Trash2 size={13} />
            Xoá phía sau
          </button>
        )}
      </div>

      <ul
        ref={listRef}
        className={`flex flex-col gap-0.5 px-2 pb-3 ${scroll ? "np-scroll min-h-0 flex-1" : ""}`}
      >
        {queue.slice(0, rowLimit).map((track, index) => {
          const isCurrent = index === currentIndex;
          const isPast = index < currentIndex;
          const durationLabel = track.durationSeconds ? formatDuration(track.durationSeconds) : "";
          const extraItems = [
            ...(index > 0
              ? [{ label: "Đẩy lên", icon: ArrowUp, onClick: () => moveInQueue(index, index - 1) }]
              : []),
            ...(index < queue.length - 1
              ? [{ label: "Đẩy xuống", icon: ArrowDown, onClick: () => moveInQueue(index, index + 1) }]
              : []),
            ...(!isCurrent
              ? [{ label: "Loại khỏi hàng đợi", icon: X, danger: true, onClick: () => removeFromQueue(index) }]
              : []),
          ];

          return (
            <li
              key={track.queueId}
              className={`group row-lazy relative flex items-center gap-1 rounded-2xl py-1.5 pl-1 pr-1 transition-colors ${
                isCurrent ? "bg-surface-2" : "hover:bg-white/5"
              }${isPast ? " opacity-60" : ""}${dragClass(index)}`}
            >
              {isCurrent && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-2.5 left-0 top-2.5 w-1 rounded-full bg-accent"
                />
              )}
              <span
                role="button"
                aria-label="Kéo để sắp xếp"
                className="flex h-9 w-5 shrink-0 items-center justify-center text-muted opacity-0 transition group-hover:opacity-100 [@media(hover:none)]:opacity-60"
                {...getHandleProps(index)}
              >
                <GripVertical size={15} />
              </span>

              <button
                type="button"
                onClick={() => playTrackAt(index)}
                aria-current={isCurrent ? "true" : undefined}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="relative aspect-square w-11 shrink-0 overflow-hidden rounded-xl bg-surface">
                  {track.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={track.thumbnail} alt="" className="h-full w-full object-cover" />
                  ) : null}
                  {isCurrent && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/55">
                      <Equalizer playing={isPlaying} />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-sm font-bold ${isCurrent ? "text-accent" : ""}`}
                  >
                    {track.title}
                  </span>
                  <span className="block truncate text-xs text-muted">{track.channelTitle}</span>
                </span>
                {durationLabel && (
                  <span className="shrink-0 text-xs tabular-nums text-muted">{durationLabel}</span>
                )}
              </button>

              <TrackMenu track={track} extraItems={extraItems} className="card-menu shrink-0" />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
