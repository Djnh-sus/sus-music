import { useCallback, useEffect, useRef, useState } from "react";

export function usePopover({ width = 256, heightEstimate = 360, placement = "auto" } = {}) {
  const [style, setStyle] = useState(null);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const open = style !== null;

  const close = useCallback(() => setStyle(null), []);

  const toggle = useCallback(() => {
    if (style !== null) {
      setStyle(null);
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    const opensUp =
      placement === "up" ||
      (placement === "auto" &&
        rect.bottom + heightEstimate > window.innerHeight &&
        rect.top > heightEstimate);
    setStyle(
      opensUp
        ? { left, bottom: window.innerHeight - rect.top + 4, transformOrigin: "bottom right" }
        : { left, top: rect.bottom + 4 }
    );
  }, [style, width, heightEstimate, placement]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e) => {
      if (rootRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      setStyle(null);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setStyle(null);
      }
    };
    const onResize = () => setStyle(null);
    const onScroll = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      setStyle(null);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  return { open, style, toggle, close, rootRef, buttonRef, panelRef };
}
