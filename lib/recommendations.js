"use client";

import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "@/lib/authed-fetch";

const CACHE_PREFIX = "yt-reco:";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

function readCache(key) {
  try {
    const raw = JSON.parse(window.localStorage.getItem(key));
    if (!raw || !Array.isArray(raw.items) || Date.now() - raw.at > CACHE_TTL_MS) return null;
    return raw.items;
  } catch {
    return null;
  }
}

function writeCache(key, items) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ at: Date.now(), items }));
  } catch {
  }
}

export function topChannels(rows, limit = 3) {
  const counts = new Map();
  for (const row of rows || []) {
    const name = row?.channel_title;
    if (typeof name !== "string" || name.trim() === "") continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}

export function useRecommendation(userId, query) {
  const key = userId && query ? `${CACHE_PREFIX}${userId}:${query.toLowerCase()}` : null;
  const [state, setState] = useState({ key: null, status: "idle", items: [], error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;

    const cached = readCache(key);
    if (cached) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ key, status: "ready", items: cached, error: null });
      return;
    }

    setState({ key, status: "loading", items: [], error: null });

    authedFetch(`/api/youtube/search?q=${encodeURIComponent(query)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Không tải được gợi ý");
        return data.items || [];
      })
      .then((items) => {
        if (cancelled) return;
        writeCache(key, items);
        setState({ key, status: "ready", items, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ key, status: "error", items: [], error: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [key, attempt, query]);

  const reload = useCallback(() => {
    if (key) {
      try {
        window.localStorage.removeItem(key);
      } catch {
      }
    }
    setAttempt((n) => n + 1);
  }, [key]);

  const current =
    state.key === key
      ? state
      : { status: key ? "loading" : "idle", items: [], error: null };

  return { status: current.status, items: current.items, error: current.error, reload };
}
