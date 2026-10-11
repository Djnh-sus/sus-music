"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { loadYouTubeIframeAPI } from "@/lib/youtube-iframe-loader";
import { logBg } from "@/lib/bg-log";
import { authedFetch } from "@/lib/authed-fetch";
import { startKeepAlive, stopKeepAlive } from "@/lib/keepalive-audio";
import { useAuth } from "@/context/AuthContext";
import { loadPlayerState, savePlayerState } from "@/lib/player-storage";

const PlayerContext = createContext(null);
const PlayerTimeContext = createContext(null);

const RESTART_THRESHOLD_SECONDS = 3;
const SEEK_STEP_SECONDS = 10;
const SEEK_HOLD_MS = 800;

const MAX_CONSECUTIVE_ERRORS = 5;
const SKIP_NOTICE_MS = 6000;
const REPEAT_MODES = ["off", "all", "one"];
const PERSIST_DEBOUNCE_MS = 800;
const PERSIST_INTERVAL_MS = 5000;
const RESUME_WINDOW_MS = 6000;
const MAX_RESUME_ATTEMPTS = 3;
const RESUME_STORAGE_KEY = "yt-player-resume-on-hide";
const OWN_PAUSE_MARK_MS = 1500;
const AUTOPLAY_STORAGE_KEY = "yt-autoplay";
const RADIO_BATCH = 20;
const ALTERNATE_CODES = [100, 101, 150];

function readAutoplaySetting() {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(AUTOPLAY_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

function readResumeSetting() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(RESUME_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

const PLAYER_ERROR_REASONS = {
  2: "ID video không hợp lệ",
  5: "Trình phát HTML5 gặp lỗi",
  100: "Video đã bị xoá hoặc để riêng tư",
  101: "Chủ video không cho phát ở trang web khác",
  150: "Chủ video không cho phát ở trang web khác",
};

function shuffleArray(items) {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function restoreOriginalOrder(queue, originalIds) {
  const position = new Map(originalIds.map((id, i) => [id, i]));
  const known = queue
    .filter((entry) => position.has(entry.queueId))
    .sort((a, b) => position.get(a.queueId) - position.get(b.queueId));
  const added = queue.filter((entry) => !position.has(entry.queueId));
  return [...known, ...added];
}

export function PlayerProvider({ children }) {
  const playerRef = useRef(null);
  const containerRef = useRef(null);
  const miniThumbRef = useRef(null);

  const [queue, setQueue] = useState([]);
  const queueRef = useRef([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const currentIndexRef = useRef(-1);
  const pendingIndexRef = useRef(null);
  const entryCounterRef = useRef(0);
  const shuffleOriginalRef = useRef([]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [playerLoadError, setPlayerLoadError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isNowPlayingOpen, setNowPlayingOpen] = useState(false);
  const seekHoldUntilRef = useRef(0);

  const [shuffle, setShuffle] = useState(false);
  const shuffleRef = useRef(false);
  const [repeat, setRepeat] = useState("off");
  const repeatRef = useRef("off");
  const [volume, setVolumeState] = useState(100);
  const volumeRef = useRef(100);
  const [isMuted, setIsMuted] = useState(false);
  const mutedRef = useRef(false);
  const readyRef = useRef(false);
  const ownPauseRef = useRef(false);
  const ownPauseTimerRef = useRef(null);
  const hiddenSinceRef = useRef(0);
  const resumeAttemptsRef = useRef(0);
  const [resumeOnHide, setResumeOnHideState] = useState(readResumeSetting);
  const resumeOnHideRef = useRef(resumeOnHide);
  const [autoplay, setAutoplayState] = useState(readAutoplaySetting);
  const autoplayRef = useRef(autoplay);
  const radioSeqRef = useRef(0);
  const radioBusyRef = useRef(false);
  const startAtRef = useRef(null);
  const userIdRef = useRef(null);
  const restoreDoneRef = useRef(null);
  const pendingCueRef = useRef(null);
  const cuedPositionRef = useRef(null);
  const [sleepTimer, setSleepTimerState] = useState(null);
  const sleepTimerRef = useRef(null);

  const [playbackError, setPlaybackError] = useState(null);
  const errorStreakRef = useRef(0);
  const errorTimerRef = useRef(null);

  const currentTrack = currentIndex >= 0 ? (queue[currentIndex] ?? null) : null;
  const hasNext =
    currentTrack !== null &&
    (currentIndex + 1 < queue.length || (repeat === "all" && queue.length > 0));

  const setQueueSynced = useCallback((tracks) => {
    queueRef.current = tracks;
    setQueue(tracks);
  }, []);

  const setCurrentIndexSynced = useCallback((index) => {
    currentIndexRef.current = index;
    setCurrentIndex(index);
  }, []);

  const makeEntry = useCallback((track) => {
    entryCounterRef.current += 1;
    return { ...track, queueId: entryCounterRef.current };
  }, []);

  const updateSleepTimer = useCallback((next) => {
    sleepTimerRef.current = next;
    setSleepTimerState(next);
  }, []);

  const loadIndex = useCallback(
    (index, { auto = false } = {}) => {
      const track = queueRef.current[index];
      if (!track || !playerRef.current) return;
      pendingCueRef.current = null;
      cuedPositionRef.current = null;
      if (auto) startAtRef.current = null;
      if (!auto) {
        errorStreakRef.current = 0;
        clearTimeout(errorTimerRef.current);
        setPlaybackError(null);
      }
      setCurrentIndexSynced(index);
      setCurrentTime(0);
      setDuration(0);
      playerRef.current.loadVideoById(track.videoId);
    },
    [setCurrentIndexSynced]
  );

  const { onSignedOut, userId } = useAuth();

  const resetPlayer = useCallback(() => {
    if (playerRef.current) playerRef.current.stopVideo();
    pendingIndexRef.current = null;
    errorStreakRef.current = 0;
    clearTimeout(errorTimerRef.current);
    setPlaybackError(null);
    setQueueSynced([]);
    setCurrentIndexSynced(-1);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setNowPlayingOpen(false);
    shuffleOriginalRef.current = [];
    restoreDoneRef.current = null;
    pendingCueRef.current = null;
    cuedPositionRef.current = null;
    updateSleepTimer(null);
  }, [setQueueSynced, setCurrentIndexSynced, updateSleepTimer]);

  useEffect(() => onSignedOut(resetPlayer), [onSignedOut, resetPlayer]);

  const showPlaybackError = useCallback((message, autoClear) => {
    clearTimeout(errorTimerRef.current);
    setPlaybackError(message);
    if (autoClear) {
      errorTimerRef.current = setTimeout(() => setPlaybackError(null), SKIP_NOTICE_MS);
    }
  }, []);

  const skipAfterError = useCallback(
    (index, failedTrack, reason) => {
      errorStreakRef.current += 1;

      const hasNext = index + 1 < queueRef.current.length;
      const tooMany = errorStreakRef.current >= MAX_CONSECUTIVE_ERRORS;

      if (hasNext && !tooMany) {
        showPlaybackError(`${reason} — đã bỏ qua: ${failedTrack?.title ?? "bài này"}`, true);
        loadIndex(index + 1, { auto: true });
        return;
      }

      showPlaybackError(
        tooMany
          ? `Dừng phát vì ${MAX_CONSECUTIVE_ERRORS} bài liên tiếp không phát được (${reason})`
          : reason,
        false
      );
    },
    [loadIndex, showPlaybackError]
  );

  const tryAlternate = useCallback(
    async (index, failedTrack, reason) => {
      const stillCurrent = () =>
        currentIndexRef.current === index && queueRef.current[index]?.queueId === failedTrack.queueId;

      try {
        const params = new URLSearchParams({
          videoId: failedTrack.videoId,
          title: failedTrack.title || "",
          channel: failedTrack.channelTitle || "",
        });
        if (failedTrack.durationSeconds) params.set("duration", String(failedTrack.durationSeconds));

        const res = await authedFetch(`/api/youtube/alternate?${params}`);
        const data = await res.json();
        if (!stillCurrent()) return;

        if (!res.ok || !data.item) {
          skipAfterError(index, failedTrack, reason);
          return;
        }

        const next = queueRef.current.slice();
        next[index] = {
          ...data.item,
          queueId: failedTrack.queueId,
          origin: failedTrack.origin,
          triedAlternate: true,
        };
        setQueueSynced(next);
        loadIndex(index, { auto: true });
        showPlaybackError(`${reason} — đã chuyển sang bản khác`, true);
      } catch {
        if (stillCurrent()) skipAfterError(index, failedTrack, reason);
      }
    },
    [loadIndex, setQueueSynced, showPlaybackError, skipAfterError]
  );

  const handlePlayerError = useCallback(
    (code) => {
      const index = currentIndexRef.current;
      if (index < 0) return;

      const failedTrack = queueRef.current[index];
      const reason = PLAYER_ERROR_REASONS[code] || `Lỗi không xác định (mã ${code})`;
      setIsPlaying(false);

      if (ALTERNATE_CODES.includes(code) && failedTrack && !failedTrack.triedAlternate) {
        showPlaybackError(`${reason} — đang tìm bản khác...`, false);
        tryAlternate(index, failedTrack, reason);
        return;
      }

      skipAfterError(index, failedTrack, reason);
    },
    [showPlaybackError, skipAfterError, tryAlternate]
  );

  const playTrackAt = useCallback(
    (index) => {
      if (!isReady) {
        pendingIndexRef.current = index;
        return;
      }
      loadIndex(index);
    },
    [isReady, loadIndex]
  );

  const seekTo = useCallback(
    (seconds) => {
      if (!playerRef.current || !isReady) return;
      playerRef.current.seekTo(seconds, true);
      if (cuedPositionRef.current !== null) cuedPositionRef.current = seconds;
      seekHoldUntilRef.current = Date.now() + SEEK_HOLD_MS;
      setCurrentTime(seconds);
    },
    [isReady]
  );

  const seekBy = useCallback(
    (offset) => {
      const player = playerRef.current;
      if (!player) return;
      const now = player.getCurrentTime?.() || 0;
      const total = player.getDuration?.() || 0;
      const target = Math.max(0, now + offset);
      seekTo(total > 0 ? Math.min(target, total) : target);
    },
    [seekTo]
  );

  const playNext = useCallback(() => {
    const index = currentIndexRef.current;
    const next = index + 1;
    if (next < queueRef.current.length) playTrackAt(next);
    else if (index >= 0 && repeatRef.current === "all" && queueRef.current.length > 0) playTrackAt(0);
  }, [playTrackAt]);

  const playPrev = useCallback(() => {
    if (currentIndexRef.current < 0) return;
    const elapsed = playerRef.current?.getCurrentTime?.() || 0;
    const prev = currentIndexRef.current - 1;
    if (prev < 0 || elapsed > RESTART_THRESHOLD_SECONDS) {
      seekTo(0);
      return;
    }
    playTrackAt(prev);
  }, [seekTo, playTrackAt]);

  const openNowPlaying = useCallback(() => setNowPlayingOpen(true), []);
  const closeNowPlaying = useCallback(() => setNowPlayingOpen(false), []);

  const pausePlayer = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    ownPauseRef.current = true;
    clearTimeout(ownPauseTimerRef.current);
    ownPauseTimerRef.current = setTimeout(() => {
      ownPauseRef.current = false;
    }, OWN_PAUSE_MARK_MS);
    player.pauseVideo();
  }, []);

  const setResumeOnHide = useCallback((enabled) => {
    const value = Boolean(enabled);
    resumeOnHideRef.current = value;
    setResumeOnHideState(value);
    logBg("resumeOnHide", value ? "on" : "off");
    if (!value) stopKeepAlive();
    else if (playerRef.current?.getPlayerState?.() === 1) startKeepAlive();
    try {
      window.localStorage.setItem(RESUME_STORAGE_KEY, value ? "1" : "0");
    } catch {
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (!playerRef.current || !isReady) return;
    if (isPlaying) pausePlayer();
    else playerRef.current.playVideo();
  }, [isPlaying, isReady, pausePlayer]);

  const handleEnded = useCallback(() => {
    if (sleepTimerRef.current?.kind === "track") {
      updateSleepTimer(null);
      return;
    }

    const player = playerRef.current;
    if (repeatRef.current === "one" && player) {
      player.seekTo(0, true);
      player.playVideo();
      setCurrentTime(0);
      return;
    }

    const next = currentIndexRef.current + 1;
    if (next < queueRef.current.length) loadIndex(next);
    else if (repeatRef.current === "all" && queueRef.current.length > 0) loadIndex(0);
  }, [loadIndex, updateSleepTimer]);

  const playQueue = useCallback(
    (tracks, startIndex = 0, options = {}) => {
      if (!tracks?.[startIndex]) return;

      radioSeqRef.current += 1;
      startAtRef.current = options.startAt > 0 ? options.startAt : null;
      pendingCueRef.current = null;
      cuedPositionRef.current = null;
      const entries = tracks.map(makeEntry);
      let ordered = entries;
      let index = startIndex;

      if (shuffleRef.current) {
        shuffleOriginalRef.current = entries.map((entry) => entry.queueId);
        ordered = [
          entries[startIndex],
          ...shuffleArray(entries.filter((_, i) => i !== startIndex)),
        ];
        index = 0;
      } else {
        shuffleOriginalRef.current = [];
      }

      setQueueSynced(ordered);
      if (!isReady) {
        pendingIndexRef.current = index;
        return;
      }
      loadIndex(index);
    },
    [isReady, makeEntry, setQueueSynced, loadIndex]
  );

  const addToQueue = useCallback(
    (track) => {
      if (queueRef.current.length === 0) {
        playQueue([track], 0);
        return;
      }
      setQueueSynced([...queueRef.current, makeEntry(track)]);
    },
    [playQueue, makeEntry, setQueueSynced]
  );

  const playNextInQueue = useCallback(
    (track) => {
      const current = queueRef.current;
      if (current.length === 0) {
        playQueue([track], 0);
        return;
      }

      const entry = makeEntry(track);
      const reference =
        currentIndexRef.current >= 0 ? currentIndexRef.current : (pendingIndexRef.current ?? -1);
      const at = reference + 1;

      if (shuffleRef.current) {
        const currentEntry = current[currentIndexRef.current];
        const original = shuffleOriginalRef.current;
        const position = currentEntry ? original.indexOf(currentEntry.queueId) : -1;
        shuffleOriginalRef.current = [
          ...original.slice(0, position + 1),
          entry.queueId,
          ...original.slice(position + 1),
        ];
      }

      if (pendingIndexRef.current !== null && at <= pendingIndexRef.current) {
        pendingIndexRef.current += 1;
      }
      setQueueSynced([...current.slice(0, at), entry, ...current.slice(at)]);
    },
    [playQueue, makeEntry, setQueueSynced]
  );

  const removeFromQueue = useCallback(
    (index) => {
      const current = queueRef.current;
      if (index < 0 || index >= current.length) return;
      if (index === currentIndexRef.current) return;

      if (pendingIndexRef.current !== null) {
        if (index < pendingIndexRef.current) pendingIndexRef.current -= 1;
        else if (index === pendingIndexRef.current) {
          pendingIndexRef.current = Math.min(index, current.length - 2);
        }
      }

      setQueueSynced(current.filter((_, i) => i !== index));
      if (index < currentIndexRef.current) {
        setCurrentIndexSynced(currentIndexRef.current - 1);
      }
    },
    [setQueueSynced, setCurrentIndexSynced]
  );

  const moveInQueue = useCallback(
    (from, to) => {
      const current = queueRef.current;
      const valid = (i) => Number.isInteger(i) && i >= 0 && i < current.length;
      if (!valid(from) || !valid(to) || from === to) return;
      if (pendingIndexRef.current !== null) return;

      const currentEntry = current[currentIndexRef.current];
      const next = current.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);

      setQueueSynced(next);
      if (currentEntry) setCurrentIndexSynced(next.indexOf(currentEntry));
    },
    [setQueueSynced, setCurrentIndexSynced]
  );

  const clearUpcoming = useCallback(() => {
    const index = currentIndexRef.current;
    if (index < 0) return;
    radioSeqRef.current += 1;
    setQueueSynced(queueRef.current.slice(0, index + 1));
  }, [setQueueSynced]);

  const requestRadio = useCallback(
    async (seed) => {
      if (!seed || radioBusyRef.current) return;
      radioBusyRef.current = true;
      const seq = radioSeqRef.current;

      try {
        const params = new URLSearchParams({
          videoId: seed.videoId,
          title: seed.title || "",
          channel: seed.channelTitle || "",
        });
        if (seed.channelId) params.set("channelId", seed.channelId);

        const res = await authedFetch(`/api/youtube/next?${params}`);
        const data = await res.json();
        if (!res.ok || seq !== radioSeqRef.current) return;

        const known = new Set(queueRef.current.map((entry) => entry.videoId));
        const fresh = (data.items || [])
          .filter((track) => !known.has(track.videoId))
          .slice(0, RADIO_BATCH)
          .map((track) => makeEntry({ ...track, origin: "radio" }));
        if (fresh.length === 0) return;

        if (shuffleRef.current) {
          shuffleOriginalRef.current = [
            ...shuffleOriginalRef.current,
            ...fresh.map((entry) => entry.queueId),
          ];
        }
        setQueueSynced([...queueRef.current, ...fresh]);
      } catch {
      } finally {
        radioBusyRef.current = false;
      }
    },
    [makeEntry, setQueueSynced]
  );

  const playTrackWithRadio = useCallback(
    (track, options = {}) => {
      playQueue([track], 0, options);
      if (autoplayRef.current) requestRadio(track);
    },
    [playQueue, requestRadio]
  );

  const setAutoplay = useCallback((enabled) => {
    const value = Boolean(enabled);
    autoplayRef.current = value;
    setAutoplayState(value);
    try {
      window.localStorage.setItem(AUTOPLAY_STORAGE_KEY, value ? "1" : "0");
    } catch {
    }
  }, []);

  useEffect(() => {
    if (!autoplay || currentIndex < 0 || queue.length === 0) return;
    if (queue.length - 1 - currentIndex > 2) return;
    const last = queue[queue.length - 1];
    if (last?.origin !== "radio") return;
    requestRadio(last);
  }, [autoplay, currentIndex, queue, requestRadio]);

  const toggleShuffle = useCallback(() => {
    const turningOn = !shuffleRef.current;
    shuffleRef.current = turningOn;
    setShuffle(turningOn);

    const current = queueRef.current;
    const index = currentIndexRef.current;

    if (turningOn) {
      shuffleOriginalRef.current = current.map((entry) => entry.queueId);
      setQueueSynced([...current.slice(0, index + 1), ...shuffleArray(current.slice(index + 1))]);
      return;
    }

    const currentEntry = current[index];
    const restored = restoreOriginalOrder(current, shuffleOriginalRef.current);
    shuffleOriginalRef.current = [];
    setQueueSynced(restored);
    if (currentEntry) setCurrentIndexSynced(restored.indexOf(currentEntry));
  }, [setQueueSynced, setCurrentIndexSynced]);

  const cycleRepeat = useCallback(() => {
    const next = REPEAT_MODES[(REPEAT_MODES.indexOf(repeatRef.current) + 1) % REPEAT_MODES.length];
    repeatRef.current = next;
    setRepeat(next);
  }, []);

  const setVolume = useCallback((value) => {
    const clamped = Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
    volumeRef.current = clamped;
    setVolumeState(clamped);

    const player = readyRef.current ? playerRef.current : null;
    if (clamped > 0 && mutedRef.current) {
      mutedRef.current = false;
      setIsMuted(false);
      player?.unMute?.();
    }
    player?.setVolume?.(clamped);
  }, []);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setIsMuted(next);
    const player = readyRef.current ? playerRef.current : null;
    if (next) player?.mute?.();
    else player?.unMute?.();
  }, []);

  const setSleepTimer = useCallback(
    (value) => {
      if (value === "track") {
        updateSleepTimer({ kind: "track" });
      } else if (typeof value === "number" && value > 0) {
        updateSleepTimer({ kind: "minutes", minutes: value, endsAt: Date.now() + value * 60000 });
      } else {
        updateSleepTimer(null);
      }
    },
    [updateSleepTimer]
  );

  const applySavedState = useCallback(
    (saved) => {
      const maxId = saved.queue.reduce((max, entry) => Math.max(max, entry.queueId), 0);
      entryCounterRef.current = Math.max(entryCounterRef.current, maxId);

      shuffleRef.current = saved.shuffle;
      setShuffle(saved.shuffle);
      repeatRef.current = saved.repeat;
      setRepeat(saved.repeat);
      volumeRef.current = saved.volume;
      setVolumeState(saved.volume);
      mutedRef.current = saved.muted;
      setIsMuted(saved.muted);
      shuffleOriginalRef.current = saved.shuffleOriginal;

      setQueueSynced(saved.queue);
      setCurrentIndexSynced(saved.currentIndex);
      setCurrentTime(saved.position);

      const track = saved.queue[saved.currentIndex];
      const cue = { videoId: track.videoId, startSeconds: Math.floor(saved.position) };
      cuedPositionRef.current = saved.position;

      const player = playerRef.current;
      if (readyRef.current && player) {
        player.setVolume?.(saved.volume);
        if (saved.muted) player.mute?.();
        else player.unMute?.();
        player.cueVideoById?.(cue);
      } else {
        pendingCueRef.current = cue;
      }
    },
    [setQueueSynced, setCurrentIndexSynced]
  );

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    if (!userId || restoreDoneRef.current === userId) return;
    restoreDoneRef.current = userId;
    if (queueRef.current.length > 0) return;

    const saved = loadPlayerState(userId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) applySavedState(saved);
  }, [userId, applySavedState]);

  const persistNow = useCallback(() => {
    const id = userIdRef.current;
    if (!id || restoreDoneRef.current !== id) return;

    const queueNow = queueRef.current;
    const index = currentIndexRef.current >= 0 ? currentIndexRef.current : pendingIndexRef.current;
    if (queueNow.length === 0 || index === null || index < 0) return;

    const player = playerRef.current;
    const position =
      cuedPositionRef.current !== null
        ? cuedPositionRef.current
        : readyRef.current && player
          ? player.getCurrentTime?.() || 0
          : 0;

    savePlayerState(id, {
      queue: queueNow,
      currentIndex: index,
      position,
      shuffle: shuffleRef.current,
      repeat: repeatRef.current,
      volume: volumeRef.current,
      muted: mutedRef.current,
      shuffleOriginal: shuffleOriginalRef.current,
    });
  }, []);

  useEffect(() => {
    const id = setTimeout(persistNow, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [queue, currentIndex, shuffle, repeat, volume, isMuted, userId, persistNow]);

  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(persistNow, PERSIST_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isPlaying, persistNow]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") persistNow();
    };
    window.addEventListener("pagehide", persistNow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", persistNow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [persistNow]);

  useEffect(() => {
    if (sleepTimer?.kind !== "minutes") return;

    const id = setTimeout(() => {
      pausePlayer();
      updateSleepTimer(null);
    }, Math.max(0, sleepTimer.endsAt - Date.now()));

    return () => clearTimeout(id);
  }, [sleepTimer, updateSleepTimer, pausePlayer]);

  useEffect(() => {
    const onVisibility = () => {
      logBg("visibility", document.visibilityState);
      if (document.visibilityState === "hidden") {
        hiddenSinceRef.current = Date.now();
      } else {
        hiddenSinceRef.current = 0;
        resumeAttemptsRef.current = 0;
        const state = playerRef.current?.getPlayerState?.();
        if (state !== 1 && state !== 3) stopKeepAlive();
      }
    };
    const onFreeze = () => logBg("page.freeze");
    const onResume = () => logBg("page.resume");
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("freeze", onFreeze);
    document.addEventListener("resume", onResume);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("freeze", onFreeze);
      document.removeEventListener("resume", onResume);
    };
  }, []);

  useEffect(() => {
    return () => clearTimeout(ownPauseTimerRef.current);
  }, []);

  useEffect(() => {
    if (isReady && pendingIndexRef.current !== null) {
      const index = pendingIndexRef.current;
      pendingIndexRef.current = null;
      loadIndex(index);
    }
  }, [isReady, loadIndex]);

  const handleEndedRef = useRef(handleEnded);
  useEffect(() => {
    handleEndedRef.current = handleEnded;
  }, [handleEnded]);

  const handlePlayerErrorRef = useRef(handlePlayerError);
  useEffect(() => {
    handlePlayerErrorRef.current = handlePlayerError;
  }, [handlePlayerError]);

  useEffect(() => {
    return () => clearTimeout(errorTimerRef.current);
  }, []);

  const retryLoadPlayer = useCallback(() => {
    setPlayerLoadError(null);
    setLoadAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadYouTubeIframeAPI().then((YT) => {
      if (cancelled || playerRef.current || !containerRef.current) return;

      const target = document.createElement("div");
      containerRef.current.appendChild(target);

      playerRef.current = new YT.Player(target, {
        height: "100%",
        width: "100%",
        playerVars: { playsinline: 1 },
        events: {
          onReady: () => {
            readyRef.current = true;
            const player = playerRef.current;
            player?.setVolume?.(volumeRef.current);
            if (mutedRef.current) player?.mute?.();
            if (pendingCueRef.current && pendingIndexRef.current === null) {
              player?.cueVideoById?.(pendingCueRef.current);
            }
            pendingCueRef.current = null;
            setIsReady(true);
          },
          onStateChange: (event) => {
            logBg("state", String(event.data));
            setIsPlaying(event.data === YT.PlayerState.PLAYING);
            if (event.data === YT.PlayerState.PLAYING) {
              errorStreakRef.current = 0;
              cuedPositionRef.current = null;
              if (resumeOnHideRef.current) startKeepAlive();
              if (startAtRef.current !== null) {
                const target = startAtRef.current;
                startAtRef.current = null;
                playerRef.current?.seekTo(target, true);
              }
            }
            if (event.data === YT.PlayerState.CUED) {
              setDuration(playerRef.current?.getDuration?.() || 0);
            }
            if (event.data === YT.PlayerState.PAUSED) {
              const ownPause = ownPauseRef.current;
              ownPauseRef.current = false;
              const hiddenFor = hiddenSinceRef.current ? Date.now() - hiddenSinceRef.current : 0;
              if (ownPause) stopKeepAlive();
              if (
                !ownPause &&
                resumeOnHideRef.current &&
                resumeAttemptsRef.current < MAX_RESUME_ATTEMPTS &&
                document.visibilityState === "hidden" &&
                hiddenFor < RESUME_WINDOW_MS
              ) {
                resumeAttemptsRef.current += 1;
                logBg("resume.try", String(resumeAttemptsRef.current));
                playerRef.current?.playVideo();
              }
            }
            if (event.data === YT.PlayerState.ENDED) {
              handleEndedRef.current();
            }
          },
          onError: (event) => handlePlayerErrorRef.current(event.data),
        },
      });
    }).catch((err) => {
      if (cancelled) return;
      console.error("Lỗi khởi tạo trình phát YouTube:", err);
      setPlayerLoadError(err instanceof Error ? err.message : String(err));
    });

    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  useEffect(() => {
    if (!isPlaying || !playerRef.current) return;

    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      if (Date.now() >= seekHoldUntilRef.current) {
        setCurrentTime(player.getCurrentTime?.() || 0);
      }
      setDuration(player.getDuration?.() || 0);
    }, 500);

    return () => clearInterval(interval);
  }, [isPlaying]);

  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;

    if (currentTrack) {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.channelTitle || "",
        artwork: currentTrack.thumbnail
          ? [{ src: currentTrack.thumbnail, sizes: "320x180", type: "image/jpeg" }]
          : [],
      });
    } else {
      navigator.mediaSession.metadata = null;
      stopKeepAlive();
    }

    navigator.mediaSession.setActionHandler("play", () => {
      logBg("mediasession", "play");
      playerRef.current?.playVideo();
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      logBg("mediasession", "pause");
      pausePlayer();
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      logBg("mediasession", "next");
      playNext();
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => {
      logBg("mediasession", "previous");
      playPrev();
    });
  }, [currentTrack, playNext, playPrev, pausePlayer]);

  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;

    const setHandler = (action, handler) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
      }
    };

    setHandler("seekto", (details) => {
      if (typeof details?.seekTime === "number") seekTo(details.seekTime);
    });
    setHandler("seekbackward", (details) => seekBy(-(details?.seekOffset || SEEK_STEP_SECONDS)));
    setHandler("seekforward", (details) => seekBy(details?.seekOffset || SEEK_STEP_SECONDS));
  }, [seekTo, seekBy]);

  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;
    if (!navigator.mediaSession.setPositionState) return;
    if (!duration || duration <= 0) return;

    try {
      navigator.mediaSession.setPositionState({
        duration,
        position: Math.min(currentTime, duration),
        playbackRate: 1,
      });
    } catch {
    }
  }, [currentTime, duration]);


  const stateValue = useMemo(
    () => ({
      queue,
      currentTrack,
      currentIndex,
      isPlaying,
      isReady,
      hasNext,
      playbackError,
      playerLoadError,
      retryLoadPlayer,
      isNowPlayingOpen,
      openNowPlaying,
      closeNowPlaying,
      videoContainerRef: containerRef,
      miniThumbRef,
      shuffle,
      repeat,
      volume,
      isMuted,
      sleepTimer,
      resumeOnHide,
      playQueue,
      playTrackWithRadio,
      autoplay,
      setAutoplay,
      playTrackAt,
      playNext,
      playPrev,
      togglePlay,
      seekTo,
      seekBy,
      addToQueue,
      playNextInQueue,
      removeFromQueue,
      moveInQueue,
      clearUpcoming,
      toggleShuffle,
      cycleRepeat,
      setVolume,
      toggleMute,
      setSleepTimer,
      setResumeOnHide,
    }),
    [
      queue,
      currentTrack,
      currentIndex,
      isPlaying,
      isReady,
      hasNext,
      playbackError,
      playerLoadError,
      retryLoadPlayer,
      isNowPlayingOpen,
      openNowPlaying,
      closeNowPlaying,
      containerRef,
      miniThumbRef,
      shuffle,
      repeat,
      volume,
      isMuted,
      sleepTimer,
      resumeOnHide,
      playQueue,
      playTrackWithRadio,
      autoplay,
      setAutoplay,
      playTrackAt,
      playNext,
      playPrev,
      togglePlay,
      seekTo,
      seekBy,
      addToQueue,
      playNextInQueue,
      removeFromQueue,
      moveInQueue,
      clearUpcoming,
      toggleShuffle,
      cycleRepeat,
      setVolume,
      toggleMute,
      setSleepTimer,
      setResumeOnHide,
    ]
  );

  const timeValue = useMemo(() => ({ currentTime, duration }), [currentTime, duration]);

  return (
    <PlayerContext.Provider value={stateValue}>
      <PlayerTimeContext.Provider value={timeValue}>
        {children}
      </PlayerTimeContext.Provider>
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer() phải được gọi bên trong PlayerProvider");
  return ctx;
}

export function usePlayerTime() {
  const ctx = useContext(PlayerTimeContext);
  if (!ctx) throw new Error("usePlayerTime() phải được gọi bên trong PlayerProvider");
  return ctx;
}
