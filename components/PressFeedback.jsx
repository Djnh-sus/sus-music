"use client";

import { useEffect } from "react";

const SELECTOR = ".btn-primary, .btn-ghost, .icon-btn, .pressable, .card-lift";
const RELEASE_MS = 450;

export default function PressFeedback() {
  useEffect(() => {
    const timers = new WeakMap();

    const onPointerUp = (e) => {
      const el = e.target instanceof Element ? e.target.closest(SELECTOR) : null;
      if (!el) return;
      el.setAttribute("data-release", "");
      window.clearTimeout(timers.get(el));
      timers.set(
        el,
        window.setTimeout(() => el.removeAttribute("data-release"), RELEASE_MS)
      );
    };

    document.addEventListener("pointerup", onPointerUp, true);
    return () => document.removeEventListener("pointerup", onPointerUp, true);
  }, []);

  return null;
}
