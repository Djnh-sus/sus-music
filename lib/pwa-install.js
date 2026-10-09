"use client";

import { useCallback, useSyncExternalStore } from "react";

const SERVER_SNAPSHOT = { canPrompt: false, isIOS: false, isStandalone: false };
const listeners = new Set();
let deferredPrompt = null;
let snapshot = SERVER_SNAPSHOT;

function compute() {
  const ua = window.navigator.userAgent;
  return {
    canPrompt: deferredPrompt !== null,
    isIOS:
      /iphone|ipad|ipod/i.test(ua) || (ua.includes("Macintosh") && window.navigator.maxTouchPoints > 1),
    isStandalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true,
  };
}

function emit() {
  snapshot = compute();
  listeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  snapshot = compute();
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    emit();
  });
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePwaInstall() {
  const state = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => SERVER_SNAPSHOT
  );

  const install = useCallback(async () => {
    if (!deferredPrompt) return null;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    emit();
    return choice.outcome;
  }, []);

  return { ...state, install };
}
