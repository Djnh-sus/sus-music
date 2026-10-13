"use client";

import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "@/lib/authed-fetch";
import { buildHomeShelves, bumpRefresh } from "@/lib/reco-client";

const CACHE_PREFIX = "yt-reco:";
const RECO_TTL_MS = 12 * 60 * 60 * 1000;
const FEED_TTL_MS = 30 * 60 * 1000;
const MIN_SECONDS = 60;
const MAX_SECONDS = 15 * 60;

function readCache(key, ttlMs) {
  try {
    const raw = JSON.parse(window.localStorage.getItem(key));
    if (!raw || !Array.isArray(raw.items) || Date.now() - raw.at > ttlMs) return null;
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

export function cleanItems(items, excludeIds = new Set(), limit = 20) {
  const seen = new Set(excludeIds);
  const result = [];
  for (const item of items || []) {
    if (!item?.videoId || seen.has(item.videoId) || item.isLive) continue;
    const seconds = item.durationSeconds;
    if (Number.isFinite(seconds) && (seconds < MIN_SECONDS || seconds > MAX_SECONDS)) continue;
    seen.add(item.videoId);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function useCachedItems(key, url, ttlMs, enabled) {
  const [state, setState] = useState({ key: null, status: "idle", items: [], error: null });
  const [attempt, setAttempt] = useState(0);
  const active = enabled && key !== null;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const cached = readCache(key, ttlMs);
    if (cached) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ key, status: "ready", items: cached, error: null });
      return;
    }

    setState({ key, status: "loading", items: [], error: null });

    authedFetch(url)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Không tải được gợi ý");
        return data.items || [];
      })
      .then((items) => {
        if (cancelled) return;
        if (items.length > 0) writeCache(key, items);
        setState({ key, status: "ready", items, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ key, status: "error", items: [], error: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [active, key, url, ttlMs, attempt]);

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
      : { status: active ? "loading" : "idle", items: [], error: null };

  return { status: current.status, items: current.items, error: current.error, reload };
}

export function useRecommendation(userId, query) {
  const key = userId && query ? `${CACHE_PREFIX}${userId}:${query.toLowerCase()}` : null;
  const url = query ? `/api/youtube/search?q=${encodeURIComponent(query)}` : "";
  return useCachedItems(key, url, RECO_TTL_MS, Boolean(key));
}

export function useSubscriptionFeed(userId) {
  const key = userId ? `yt-feed:${userId}` : null;
  return useCachedItems(key, "/api/youtube/feed", FEED_TTL_MS, Boolean(key));
}

export function useHomeShelves(userId) {
  const [state, setState] = useState({ userId: null, status: "idle", shelves: [], error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((prev) => ({ userId, status: "loading", shelves: prev.userId === userId ? prev.shelves : [], error: null }));

    buildHomeShelves(userId)
      .then((shelves) => {
        if (!cancelled) setState({ userId, status: "ready", shelves, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ userId, status: "error", shelves: [], error: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);

  const reload = useCallback(() => {
    bumpRefresh();
    setAttempt((n) => n + 1);
  }, []);

  const current =
    state.userId === userId
      ? state
      : { status: userId ? "loading" : "idle", shelves: [], error: null };

  return { status: current.status, shelves: current.shelves, error: current.error, reload };
}
