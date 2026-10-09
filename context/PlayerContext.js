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
import { startKeepAlive, stopKeepAlive } from "@/lib/keepalive-audio";
import { useAuth } from "@/context/AuthContext";
import { loadPlayerState, savePlayerState } from "@/lib/player-storage";

const PlayerContext = createContext(null);
const PlayerTimeContext = createContext(null);

const RESTART_THRESHOLD_SECONDS = 3;
const SEEK_STEP_SECONDS = 10;
const SEEK_HOLD_MS = 800;

const CONTAINER_CLOSED_STYLE = {
  position: "fixed",
  bottom: 0,
  left: 0,
  width: 0,
  height: 0,
  overflow: "hidden",
};

function frameStyle(frame) {
  return {
    position: "fixed",
    top: frame.top,
    left: frame.left,
    width: frame.width,
    height: frame.height,
    zIndex: 55,
    overflow: "hidden",
    borderRadius: 16,
    background: "#000",
    boxShadow: "0 20px 50px -14px rgba(0, 0, 0, 0.65)",
  };
}

function sameFrame(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

const MAX_CONSECUTIVE_ERRORS = 5;
const SKIP_NOTICE_MS = 6000;
const REPEAT_MODES = ["off", "all", "one"];
const PERSIST_DEBOUNCE_MS = 800;
const PERSIST_INTERVAL_MS = 5000;
const RESUME_WINDOW_MS = 6000;
const MAX_RESUME_ATTEMPTS = 3;
const RESUME_STORAGE_KEY = "yt-player-resume-on-hide";
const OWN_PAUSE_MARK_MS = 1500;
const HIDE_PAUSE_GRACE_MS = 1000;
const YT_STATE = { PLAYING: 1, PAUSED: 2, BUFFERING: 3 };

function setMediaAction(action, handler) {
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {}
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
  const [videoFrame, setVideoFrameState] = useState(null);
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
  const wasPlayingBeforeHideRef = useRef(false);
  const lastPlayingAtRef = useRef(0);
  const [resumeOnHide, setResumeOnHideState] = useState(readResumeSetting);
  const resumeOnHideRef = useRef(resumeOnHide);
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
      if (!auto) {
        errorStreakRef.current = 0;
        clearTimeout(errorTimerRef.current);
        setPlaybackError(null);
      }
      setCurrentIndexSynced(index);
      setCurrentTime(0);
      setDuration(0);

      if (typeof playerRef.current.loadVideoById === "function") {
        playerRef.current.loadVideoById(track.videoId);
      }
    },
    [setCurrentIndexSynced]
  );

  const { onSignedOut, userId } = useAuth();

  const resetPlayer = useCallback(() => {
    if (playerRef.current && typeof playerRef.current.stopVideo === "function") {
      playerRef.current.stopVideo();
    }
    stopKeepAlive();
    ownPauseRef.current = false;
    wasPlayingBeforeHideRef.current = false;
    clearTimeout(ownPauseTimerRef.current);
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
      errorTimerRef.current = setTimeout(
        () => setPlaybackError(null),
        SKIP_NOTICE_MS
      );
    }
  }, []);

  const handlePlayerError = useCallback(
    (code) => {
      const index = currentIndexRef.current;
      if (index < 0) return;

      const failedTrack = queueRef.current[index];
      const reason =
        PLAYER_ERROR_REASONS[code] || `Lỗi không xác định (mã ${code})`;

      errorStreakRef.current += 1;
      setIsPlaying(false);

      const hasNext = index + 1 < queueRef.current.length;
      const shouldWrap =
        repeatRef.current === "all" &&
        queueRef.current.length > 1 &&
        index >= queueRef.current.length - 1;
      const tooMany =
        errorStreakRef.current >= MAX_CONSECUTIVE_ERRORS;

      if ((hasNext || shouldWrap) && !tooMany) {
        showPlaybackError(
          `${reason} — đã bỏ qua: ${failedTrack?.title ?? "bài này"}`,
          true
        );
        loadIndex(hasNext ? index + 1 : 0, { auto: true });
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

  const playTrackAt = useCallback(
    (index) => {
      if (!isReady) {
        pendingIndexRef.current = index;
        return;
      }
      pendingIndexRef.current = null;
      loadIndex(index);
    },
    [isReady, loadIndex]
  );

  const seekTo = useCallback(
    (seconds) => {
      if (
        !playerRef.current ||
        !isReady ||
        typeof playerRef.current.seekTo !== "function"
      ) {
        return;
      }
      playerRef.current.seekTo(seconds, true);
      if (cuedPositionRef.current !== null) {
        cuedPositionRef.current = seconds;
      }
      seekHoldUntilRef.current = Date.now() + SEEK_HOLD_MS;
      setCurrentTime(seconds);
    },
    [isReady]
  );

  const seekBy = useCallback(
    (offset) => {
      const player = playerRef.current;
      if (
        !player ||
        typeof player.getCurrentTime !== "function" ||
        typeof player.getDuration !== "function"
      ) {
        return;
      }
      const now = player.getCurrentTime() || 0;
      const total = player.getDuration() || 0;
      const target = Math.max(0, now + offset);
      seekTo(total > 0 ? Math.min(target, total) : target);
    },
    [seekTo]
  );

  const playNext = useCallback(() => {
    const index = currentIndexRef.current;
    const next = index + 1;
    if (next < queueRef.current.length) playTrackAt(next);
    else if (
      index >= 0 &&
      repeatRef.current === "all" &&
      queueRef.current.length > 0
    ) {
      playTrackAt(0);
    }
  }, [playTrackAt]);

  const playPrev = useCallback(() => {
    if (currentIndexRef.current < 0) return;
    const elapsed =
      playerRef.current &&
      typeof playerRef.current.getCurrentTime === "function"
        ? playerRef.current.getCurrentTime()
        : 0;
    const prev = currentIndexRef.current - 1;

    if (prev < 0 || elapsed > RESTART_THRESHOLD_SECONDS) {
      seekTo(0);
      return;
    }
    playTrackAt(prev);
  }, [seekTo, playTrackAt]);

  const setVideoFrame = useCallback((frame) => {
    setVideoFrameState((current) =>
      sameFrame(current, frame) ? current : frame
    );
  }, []);

  const openNowPlaying = useCallback(() => setNowPlayingOpen(true), []);
  const closeNowPlaying = useCallback(() => setNowPlayingOpen(false), []);

  const pausePlayer = useCallback(() => {
    const player = playerRef.current;
    if (!player || typeof player.pauseVideo !== "function") return;

    ownPauseRef.current = true;
    wasPlayingBeforeHideRef.current = false;
    clearTimeout(ownPauseTimerRef.current);
    ownPauseTimerRef.current = setTimeout(() => {
      ownPauseRef.current = false;
    }, OWN_PAUSE_MARK_MS);

    player.pauseVideo();
    stopKeepAlive();
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
    } catch {}
  }, []);

  const togglePlay = useCallback(() => {
    if (!playerRef.current || !isReady) return;
    if (isPlaying) {
      pausePlayer();
    } else if (typeof playerRef.current.playVideo === "function") {
      playerRef.current.playVideo();
    }
  }, [isPlaying, isReady, pausePlayer]);

  const handleEnded = useCallback(() => {
    if (sleepTimerRef.current?.kind === "track") {
      updateSleepTimer(null);
      return;
    }

    const player = playerRef.current;
    if (
      repeatRef.current === "one" &&
      player &&
      typeof player.seekTo === "function"
    ) {
      player.seekTo(0, true);
      if (typeof player.playVideo === "function") player.playVideo();
      setCurrentTime(0);
      return;
    }

    const next = currentIndexRef.current + 1;
    if (next < queueRef.current.length) loadIndex(next);
    else if (repeatRef.current === "all" && queueRef.current.length > 0) {
      loadIndex(0);
    }
  }, [loadIndex, updateSleepTimer]);

  const playQueue = useCallback(
    (tracks, startIndex = 0) => {
      if (!tracks?.[startIndex]) return;

      pendingCueRef.current = null;
      cuedPositionRef.current = null;

      const entries = tracks.map(makeEntry);
      let ordered = entries;
      let index = startIndex;
      pendingIndexRef.current = null;

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

      pendingIndexRef.current = null;
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
        currentIndexRef.current >= 0
          ? currentIndexRef.current
          : (pendingIndexRef.current ?? -1);
      const at = reference + 1;

      if (shuffleRef.current) {
        const currentEntry = current[currentIndexRef.current];
        const original = shuffleOriginalRef.current;
        const position = currentEntry
          ? original.indexOf(currentEntry.queueId)
          : -1;

        shuffleOriginalRef.current = [
          ...original.slice(0, position + 1),
          entry.queueId,
          ...original.slice(position + 1),
        ];
      }

      if (pendingIndexRef.current !== null && at <= pendingIndexRef.current) {
        pendingIndexRef.current += 1;
      }

      setQueueSynced([
        ...current.slice(0, at),
        entry,
        ...current.slice(at),
      ]);
    },
    [playQueue, makeEntry, setQueueSynced]
  );

  const removeFromQueue = useCallback(
    (index) => {
      const current = queueRef.current;
      if (index < 0 || index >= current.length) return;
      if (index === currentIndexRef.current) return;

      if (pendingIndexRef.current !== null) {
        if (index < pendingIndexRef.current) {
          pendingIndexRef.current -= 1;
        } else if (index === pendingIndexRef.current) {
          const nextLength = current.length - 1;
          pendingIndexRef.current =
            nextLength > 0 ? Math.min(index, nextLength - 1) : null;
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
      const valid = (i) =>
        Number.isInteger(i) && i >= 0 && i < current.length;

      if (!valid(from) || !valid(to) || from === to) return;
      if (pendingIndexRef.current !== null) return;

      const currentEntry = current[currentIndexRef.current];
      const next = current.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);

      setQueueSynced(next);
      if (currentEntry) {
        setCurrentIndexSynced(next.indexOf(currentEntry));
      }
    },
    [setQueueSynced, setCurrentIndexSynced]
  );

  const clearUpcoming = useCallback(() => {
    const index = currentIndexRef.current;
    if (index < 0) return;
    setQueueSynced(queueRef.current.slice(0, index + 1));
  }, [setQueueSynced]);

  const toggleShuffle = useCallback(() => {
    const turningOn = !shuffleRef.current;
    shuffleRef.current = turningOn;
    setShuffle(turningOn);

    const current = queueRef.current;

    if (current.length < 2) {
      if (turningOn) {
        shuffleOriginalRef.current = current.map((entry) => entry.queueId);
      } else {
        shuffleOriginalRef.current = [];
      }
      return;
    }

    const currentIndex = currentIndexRef.current;
    const pendingIndex = pendingIndexRef.current;
    const focusIndex = currentIndex >= 0 ? currentIndex : pendingIndex;
    const focusEntry =
      focusIndex !== null && focusIndex >= 0 ? current[focusIndex] : null;

    if (turningOn) {
      shuffleOriginalRef.current = current.map((entry) => entry.queueId);

      if (currentIndex >= 0) {
        setQueueSynced([
          ...current.slice(0, currentIndex + 1),
          ...shuffleArray(current.slice(currentIndex + 1)),
        ]);
      } else if (pendingIndex !== null && focusEntry) {
        setQueueSynced([
          focusEntry,
          ...shuffleArray(
            current.filter((entry) => entry.queueId !== focusEntry.queueId)
          ),
        ]);
        pendingIndexRef.current = 0;
      } else {
        setQueueSynced(shuffleArray(current));
      }
      return;
    }

    const pendingEntry =
      pendingIndex !== null && pendingIndex >= 0 ? current[pendingIndex] : null;
    const restored = restoreOriginalOrder(current, shuffleOriginalRef.current);
    shuffleOriginalRef.current = [];
    setQueueSynced(restored);

    if (currentIndex >= 0 && focusEntry) {
      setCurrentIndexSynced(
        restored.findIndex((entry) => entry.queueId === focusEntry.queueId)
      );
    }

    if (pendingEntry) {
      pendingIndexRef.current = restored.findIndex(
        (entry) => entry.queueId === pendingEntry.queueId
      );
    }
  }, [setQueueSynced, setCurrentIndexSynced]);

  const cycleRepeat = useCallback(() => {
    const next =
      REPEAT_MODES[
        (REPEAT_MODES.indexOf(repeatRef.current) + 1) % REPEAT_MODES.length
      ];
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
      if (typeof player?.unMute === "function") player.unMute();
    }

    if (typeof player?.setVolume === "function") player.setVolume(clamped);
  }, []);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setIsMuted(next);

    const player = readyRef.current ? playerRef.current : null;

    if (next && typeof player?.mute === "function") player.mute();
    else if (!next && typeof player?.unMute === "function") player.unMute();
  }, []);

  const setSleepTimer = useCallback(
    (value) => {
      if (value === "track") {
        updateSleepTimer({ kind: "track" });
      } else if (typeof value === "number" && value > 0) {
        updateSleepTimer({
          kind: "minutes",
          minutes: value,
          endsAt: Date.now() + value * 60000,
        });
      } else {
        updateSleepTimer(null);
      }
    },
    [updateSleepTimer]
  );

  const applySavedState = useCallback(
    (saved) => {
      if (!saved || !Array.isArray(saved.queue) || saved.queue.length === 0) {
        return;
      }
      if (
        !Number.isInteger(saved.currentIndex) ||
        saved.currentIndex < 0 ||
        saved.currentIndex >= saved.queue.length
      ) {
        return;
      }
      if (
        !saved.queue.every(
          (entry) =>
            entry &&
            typeof entry.videoId === "string" &&
            entry.videoId.trim()
        )
      ) {
        return;
      }

      const track = saved.queue[saved.currentIndex];
      if (
        !track ||
        typeof track.videoId !== "string" ||
        !track.videoId.trim()
      ) {
        return;
      }

      const position = Number.isFinite(Number(saved.position))
        ? Math.max(0, Number(saved.position))
        : 0;
      const restoredQueue = saved.queue.map((entry) => {
        if (Number.isInteger(entry?.queueId)) return entry;
        entryCounterRef.current += 1;
        return { ...entry, queueId: entryCounterRef.current };
      });

      const maxId = restoredQueue.reduce(
        (max, entry) => Math.max(max, entry.queueId),
        0
      );
      entryCounterRef.current = Math.max(entryCounterRef.current, maxId);

      const savedShuffle = Boolean(saved.shuffle);
      const savedRepeat = REPEAT_MODES.includes(saved.repeat)
        ? saved.repeat
        : "off";
      const savedVolume = Math.min(
        100,
        Math.max(0, Math.round(Number(saved.volume) || 0))
      );
      const savedMuted = Boolean(saved.muted);
      const savedOriginal = Array.isArray(saved.shuffleOriginal)
        ? saved.shuffleOriginal
        : [];

      shuffleRef.current = savedShuffle;
      setShuffle(savedShuffle);
      repeatRef.current = savedRepeat;
      setRepeat(savedRepeat);
      volumeRef.current = savedVolume;
      setVolumeState(savedVolume);
      mutedRef.current = savedMuted;
      setIsMuted(savedMuted);
      shuffleOriginalRef.current = savedOriginal;

      setQueueSynced(restoredQueue);
      setCurrentIndexSynced(saved.currentIndex);
      pendingIndexRef.current = null;
      setCurrentTime(position);

      const cue = {
        videoId: track.videoId,
        startSeconds: Math.floor(position),
      };
      cuedPositionRef.current = position;

      const player = playerRef.current;

      if (readyRef.current && player) {
        if (typeof player.setVolume === "function") player.setVolume(savedVolume);
        if (savedMuted && typeof player.mute === "function") player.mute();
        else if (!savedMuted && typeof player.unMute === "function") player.unMute();
        if (typeof player.cueVideoById === "function") player.cueVideoById(cue);
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
    if (saved) applySavedState(saved);
  }, [userId, applySavedState]);

  const persistNow = useCallback(() => {
    const id = userIdRef.current;
    if (!id || restoreDoneRef.current !== id) return;

    const queueNow = queueRef.current;
    const index =
      currentIndexRef.current >= 0
        ? currentIndexRef.current
        : pendingIndexRef.current;

    if (queueNow.length === 0 || index === null || index < 0) return;

    const player = playerRef.current;
    const position =
      cuedPositionRef.current !== null
        ? cuedPositionRef.current
        : readyRef.current &&
            player &&
            typeof player.getCurrentTime === "function"
          ? player.getCurrentTime() || 0
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
    if (isPlaying) return;
    const id = setTimeout(persistNow, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [currentTime, isPlaying, persistNow]);

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
      const now = Date.now();
      logBg("visibility", document.visibilityState);

      if (document.visibilityState === "hidden") {
        hiddenSinceRef.current = now;
        const player = playerRef.current;
        const state =
          typeof player?.getPlayerState === "function"
            ? player.getPlayerState()
            : null;
        const recentlyPlaying =
          lastPlayingAtRef.current > 0 &&
          now - lastPlayingAtRef.current <= HIDE_PAUSE_GRACE_MS;

        wasPlayingBeforeHideRef.current =
          !ownPauseRef.current &&
          (state === YT_STATE.PLAYING ||
            state === YT_STATE.BUFFERING ||
            recentlyPlaying);

        if (resumeOnHideRef.current && wasPlayingBeforeHideRef.current) {
          startKeepAlive();

          if (
            state === YT_STATE.PAUSED &&
            resumeAttemptsRef.current < MAX_RESUME_ATTEMPTS
          ) {
            resumeAttemptsRef.current += 1;
            logBg("resume.try", String(resumeAttemptsRef.current));
            if (typeof player?.playVideo === "function") player.playVideo();
          }
        } else {
          stopKeepAlive();
        }
      } else {
        hiddenSinceRef.current = 0;
        wasPlayingBeforeHideRef.current = false;
        resumeAttemptsRef.current = 0;

        const player = playerRef.current;
        const state =
          typeof player?.getPlayerState === "function"
            ? player.getPlayerState()
            : null;

        if (
          state !== YT_STATE.PLAYING &&
          state !== YT_STATE.BUFFERING
        ) {
          stopKeepAlive();
        }
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
    setIsReady(false);
    setIsPlaying(false);
    readyRef.current = false;
    setLoadAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadYouTubeIframeAPI()
      .then((YT) => {
        if (cancelled || playerRef.current || !containerRef.current) return;

        const target = document.createElement("div");
        containerRef.current.appendChild(target);

        playerRef.current = new YT.Player(target, {
          height: "100%",
          width: "100%",
          playerVars: { playsinline: 1 },
          events: {
            onReady: () => {
              if (cancelled) return;

              readyRef.current = true;
              const player = playerRef.current;

              if (typeof player?.setVolume === "function") {
                player.setVolume(volumeRef.current);
              }
              if (mutedRef.current && typeof player?.mute === "function") {
                player.mute();
              }

              if (
                pendingCueRef.current &&
                pendingIndexRef.current === null &&
                typeof player?.cueVideoById === "function"
              ) {
                player.cueVideoById(pendingCueRef.current);
              }

              pendingCueRef.current = null;
              setIsReady(true);
            },
            onStateChange: (event) => {
              if (cancelled) return;

              logBg("state", String(event.data));
              setIsPlaying(event.data === YT.PlayerState.PLAYING);

              if (event.data === YT_STATE.PLAYING) {
                errorStreakRef.current = 0;
                cuedPositionRef.current = null;
                lastPlayingAtRef.current = Date.now();

                if (document.visibilityState === "hidden") {
                  wasPlayingBeforeHideRef.current = true;
                  if (resumeOnHideRef.current) startKeepAlive();
                } else if (resumeOnHideRef.current) {
                  startKeepAlive();
                }
              }

              if (event.data === YT.PlayerState.CUED) {
                setDuration(playerRef.current?.getDuration?.() || 0);
              }

              if (event.data === YT_STATE.PAUSED) {
                const ownPause = ownPauseRef.current;
                ownPauseRef.current = false;
                const hiddenFor = hiddenSinceRef.current
                  ? Date.now() - hiddenSinceRef.current
                  : 0;

                if (ownPause) {
                  wasPlayingBeforeHideRef.current = false;
                  stopKeepAlive();
                } else if (
                  resumeOnHideRef.current &&
                  wasPlayingBeforeHideRef.current &&
                  document.visibilityState === "hidden" &&
                  hiddenFor < RESUME_WINDOW_MS &&
                  resumeAttemptsRef.current < MAX_RESUME_ATTEMPTS
                ) {
                  resumeAttemptsRef.current += 1;
                  logBg("resume.try", String(resumeAttemptsRef.current));
                  startKeepAlive();

                  if (typeof playerRef.current?.playVideo === "function") {
                    playerRef.current.playVideo();
                  }
                } else if (document.visibilityState !== "hidden") {
                  wasPlayingBeforeHideRef.current = false;
                  stopKeepAlive();
                }
              }

              if (event.data === YT.PlayerState.ENDED) {
                handleEndedRef.current();
              }
            },
            onError: (event) => {
              if (cancelled) return;
              handlePlayerErrorRef.current(event.data);
            },
          },
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Lỗi khởi tạo trình phát YouTube:", err);
        setPlayerLoadError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
      const player = playerRef.current;

      if (player && typeof player.destroy === "function") player.destroy();

      playerRef.current = null;
      readyRef.current = false;
      stopKeepAlive();

      if (containerRef.current) containerRef.current.replaceChildren();
    };
  }, [loadAttempt]);

  useEffect(() => {
    if (!isPlaying || !playerRef.current) return;

    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;

      if (
        Date.now() >= seekHoldUntilRef.current &&
        typeof player.getCurrentTime === "function"
      ) {
        setCurrentTime(player.getCurrentTime() || 0);
      }

      if (typeof player.getDuration === "function") {
        setDuration(player.getDuration() || 0);
      }
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
          ? [
              {
                src: currentTrack.thumbnail,
                sizes: "320x180",
                type: "image/jpeg",
              },
            ]
          : [],
      });
    } else {
      navigator.mediaSession.metadata = null;
      stopKeepAlive();
    }

    setMediaAction("play", () => {
      logBg("mediasession", "play");
      if (typeof playerRef.current?.playVideo === "function") {
        playerRef.current.playVideo();
      }
    });

    setMediaAction("pause", () => {
      logBg("mediasession", "pause");
      pausePlayer();
    });

    setMediaAction("nexttrack", () => {
      logBg("mediasession", "next");
      playNext();
    });

    setMediaAction("previoustrack", () => {
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

    setMediaAction("seekto", (details) => {
      if (typeof details?.seekTime === "number") seekTo(details.seekTime);
    });
    setMediaAction("seekbackward", (details) =>
      seekBy(-(details?.seekOffset || SEEK_STEP_SECONDS))
    );
    setMediaAction("seekforward", (details) =>
      seekBy(details?.seekOffset || SEEK_STEP_SECONDS)
    );
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
    } catch {}
  }, [currentTime, duration]);

  const frameVisible = videoFrame !== null && currentTrack !== null;

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
      setVideoFrame,
      shuffle,
      repeat,
      volume,
      isMuted,
      sleepTimer,
      resumeOnHide,
      playQueue,
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
      setVideoFrame,
      shuffle,
      repeat,
      volume,
      isMuted,
      sleepTimer,
      resumeOnHide,
      playQueue,
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
        <div
          ref={containerRef}
          className="[&_iframe]:block [&_iframe]:h-full [&_iframe]:w-full"
          style={frameVisible ? frameStyle(videoFrame) : CONTAINER_CLOSED_STYLE}
        />
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