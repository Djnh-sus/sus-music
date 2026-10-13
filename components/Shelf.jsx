"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function Shelf({ title, subtitle, viewAllHref, children }) {
  const scrollerRef = useRef(null);
  const trackRef = useRef(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ active: false, moved: false, startX: 0, startLeft: 0, id: 0 });

  const update = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const next = {
      start: el.scrollLeft <= 4,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4,
    };
    setEdges((current) =>
      current.start === next.start && current.end === next.end ? current : next
    );
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const track = trackRef.current;
    if (!scroller || !track) return;

    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    observer.observe(track);
    return () => observer.disconnect();
  }, [update]);

  const handlePointerDown = (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    dragRef.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startLeft: scrollerRef.current.scrollLeft,
      id: e.pointerId,
    };
  };

  const handlePointerMove = (e) => {
    const drag = dragRef.current;
    const el = scrollerRef.current;
    if (!drag.active || !el) return;
    const dx = e.clientX - drag.startX;
    if (!drag.moved && Math.abs(dx) > 6) {
      drag.moved = true;
      setDragging(true);
      el.setPointerCapture(drag.id);
    }
    if (drag.moved) el.scrollLeft = drag.startLeft - dx;
  };

  const handlePointerEnd = () => {
    const drag = dragRef.current;
    if (!drag.active) return;
    drag.active = false;
    if (drag.moved) {
      setDragging(false);
      try {
        scrollerRef.current.releasePointerCapture(drag.id);
      } catch {
      }
    }
  };

  const handleClickCapture = (e) => {
    if (!dragRef.current.moved) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current.moved = false;
  };

  const scrollByPage = (direction) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: "smooth" });
  };

  const arrowClass = (hidden) =>
    `pressable absolute top-20 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-accent text-accent-ink shadow-[0_3px_0_0_var(--accent-lip)] md:flex ${
      hidden ? "pointer-events-none scale-75 opacity-0" : "scale-100 opacity-100"
    }`;

  return (
    <section className="mb-10">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-extrabold leading-tight md:text-2xl">{title}</h2>
          {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
        </div>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="flex shrink-0 items-center gap-0.5 text-sm font-bold text-muted transition hover:text-accent"
          >
            Xem thêm
            <ChevronRight size={16} />
          </Link>
        )}
      </div>

      <div className="relative flow-root">
        <button
          type="button"
          aria-label="Cuộn sang trái"
          tabIndex={edges.start ? -1 : 0}
          onClick={() => scrollByPage(-1)}
          className={`${arrowClass(edges.start)} left-1`}
        >
          <ChevronLeft size={22} />
        </button>
        <button
          type="button"
          aria-label="Cuộn sang phải"
          tabIndex={edges.end ? -1 : 0}
          onClick={() => scrollByPage(1)}
          className={`${arrowClass(edges.end)} right-1`}
        >
          <ChevronRight size={22} />
        </button>

        <div
          ref={scrollerRef}
          onScroll={update}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onClickCapture={handleClickCapture}
          data-dragging={dragging}
          style={dragging ? { scrollSnapType: "none", scrollBehavior: "auto" } : undefined}
          className="shelf-scroll no-scrollbar -mx-3 -mb-3 -mt-3 snap-x snap-proximity overflow-x-auto scroll-smooth scroll-px-3 px-3 pb-5 pt-3"
        >
          <div ref={trackRef} className="flex w-max gap-4">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
