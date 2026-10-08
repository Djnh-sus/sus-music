"use client";

import { useEffect } from "react";

const SW_CACHE_PREFIX = "app-shell-";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => registrations.forEach((r) => r.unregister()))
        .catch(() => {});
      if ("caches" in window) {
        caches
          .keys()
          .then((keys) =>
            keys.filter((k) => k.startsWith(SW_CACHE_PREFIX)).forEach((k) => caches.delete(k))
          )
          .catch(() => {});
      }
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("Đăng ký service worker thất bại:", err);
    });
  }, []);

  return null;
}
