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
// Trình duyệt đôi khi pause video NGAY TRƯỚC khi bắn visibilitychange -> hidden.
// Pause nào nằm trong khoảng này trước lúc ẩn tab được coi là do trình duyệt, không phải người dùng.
const HIDE_PAUSE_GRACE_MS = 1000;

// Giá trị của YT.PlayerState (dùng ngoài chỗ có sẵn biến YT)
const YT_STATE = { PLAYING: 1, PAUSED: 2, BUFFERING: 3 };

// Gọi setActionHandler có bọc try/catch: một số trình duyệt ném lỗi với action họ không hỗ trợ
function setMediaAction(action, handler) {
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {
    // action không được hỗ trợ -> bỏ qua
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
  audio: "Không phát được luồng âm thanh nền",
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

// Bài "đang/sắp phát": bài đang phát (currentIndex) hoặc bài đang chờ API sẵn sàng (pendingIndex).
// Lấy max để cả hai cùng được giữ nguyên chỗ khi sắp xếp lại hàng đợi.
function anchorIndex(currentIdx, pendingIdx) {
  return Math.max(currentIdx, pendingIdx ?? -1);
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

  // Phát nền / lưu trạng thái
  const lastPersistAtRef = useRef(0);
  const lastForeignPauseRef = useRef(0);
  const handleEndedRef = useRef(null);
  const handlePlayerErrorRef = useRef(null);
  const [isForeground, setIsForeground] = useState(true);

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


  // ===== Điều khiển trình phát (YouTube IFrame là nguồn phát duy nhất) =====

  const getPlayerTime = useCallback(() => {
    const player = playerRef.current;
    return typeof player?.getCurrentTime === "function" ? player.getCurrentTime() || 0 : 0;
  }, []);

  const getPlayerDuration = useCallback(() => {
    const player = playerRef.current;
    return typeof player?.getDuration === "function" ? player.getDuration() || 0 : 0;
  }, []);

  const playPlayer = useCallback(() => {
    const player = playerRef.current;
    if (typeof player?.playVideo === "function") player.playVideo();
  }, []);

  // Pause và đánh dấu là do app chủ động, để logic tự-phát-lại không cãi nhau với nó
  const pausePlayer = useCallback(() => {
    const player = playerRef.current;
    if (!player || typeof player.pauseVideo !== "function") return;
    ownPauseRef.current = true;
    clearTimeout(ownPauseTimerRef.current);
    ownPauseTimerRef.current = setTimeout(() => {
      ownPauseRef.current = false;
    }, OWN_PAUSE_MARK_MS);
    player.pauseVideo();
  }, []);

  // Trình duyệt tự pause video ngay sau khi ẩn tab: thử bấm phát lại, có giới hạn thời gian và số lần
  const tryResumePlayback = useCallback(() => {
    if (!resumeOnHideRef.current) return false;
    if (document.visibilityState !== "hidden") return false;
    if (resumeAttemptsRef.current >= MAX_RESUME_ATTEMPTS) return false;

    if (hiddenSinceRef.current === 0) hiddenSinceRef.current = Date.now();
    if (Date.now() - hiddenSinceRef.current >= RESUME_WINDOW_MS) return false;

    const player = playerRef.current;
    if (typeof player?.playVideo !== "function") return false;

    resumeAttemptsRef.current += 1;
    logBg("resume.try", String(resumeAttemptsRef.current));
    startKeepAlive();
    player.playVideo();
    return true;
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

      // Tab đang ẩn: mở lại cửa sổ tự-phát-lại cho bài mới (trình duyệt hay pause ngay sau khi đổi bài)
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        hiddenSinceRef.current = Date.now();
        resumeAttemptsRef.current = 0;
      }

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
    // Gọi thẳng, không dựa vào effect Media Session (trình duyệt không hỗ trợ sẽ không chạy effect đó)
    stopKeepAlive();
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

  const handlePlayerError = useCallback(
    (code) => {
      const index = currentIndexRef.current;
      if (index < 0) return;

      const failedTrack = queueRef.current[index];
      const reason = PLAYER_ERROR_REASONS[code] || `Lỗi không xác định (mã ${code})`;

      errorStreakRef.current += 1;
      setIsPlaying(false);

      const lastIndex = queueRef.current.length - 1;
      const hasFollowing = index < lastIndex;
      // Repeat All: bài cuối lỗi thì vòng về bài đầu, giống handleEnded.
      // Cần > 1 bài, nếu không sẽ thử lại đúng bài vừa lỗi.
      const canWrap = repeatRef.current === "all" && lastIndex > 0 && index >= lastIndex;
      const tooMany = errorStreakRef.current >= MAX_CONSECUTIVE_ERRORS;

      if ((hasFollowing || canWrap) && !tooMany) {
        showPlaybackError(`${reason} — đã bỏ qua: ${failedTrack?.title ?? "bài này"}`, true);
        loadIndex(hasFollowing ? index + 1 : 0, { auto: true });
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
      loadIndex(index);
    },
    [isReady, loadIndex]
  );

  const seekTo = useCallback(
    (seconds) => {
      if (!playerRef.current || !isReady || typeof playerRef.current.seekTo !== "function") return;
      playerRef.current.seekTo(seconds, true);
      if (cuedPositionRef.current !== null) cuedPositionRef.current = seconds;
      seekHoldUntilRef.current = Date.now() + SEEK_HOLD_MS;
      setCurrentTime(seconds);
    },
    [isReady]
  );

  const seekBy = useCallback(
    (offset) => {
      if (!playerRef.current) return;
      const now = getPlayerTime();
      const total = getPlayerDuration();
      const target = Math.max(0, now + offset);
      seekTo(total > 0 ? Math.min(target, total) : target);
    },
    [seekTo, getPlayerTime, getPlayerDuration]
  );

  const playNext = useCallback(() => {
    const index = currentIndexRef.current;
    const next = index + 1;
    if (next < queueRef.current.length) playTrackAt(next);
    else if (index >= 0 && repeatRef.current === "all" && queueRef.current.length > 0) playTrackAt(0);
  }, [playTrackAt]);

  const playPrev = useCallback(() => {
    if (currentIndexRef.current < 0) return;
    const elapsed = getPlayerTime();
    const prev = currentIndexRef.current - 1;
    if (prev < 0 || elapsed > RESTART_THRESHOLD_SECONDS) {
      seekTo(0);
      return;
    }
    playTrackAt(prev);
  }, [seekTo, playTrackAt, getPlayerTime]);

  const setVideoFrame = useCallback((frame) => {
    setVideoFrameState((current) => (sameFrame(current, frame) ? current : frame));
  }, []);

  const openNowPlaying = useCallback(() => setNowPlayingOpen(true), []);
  const closeNowPlaying = useCallback(() => setNowPlayingOpen(false), []);

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
    else playPlayer();
  }, [isPlaying, isReady, pausePlayer, playPlayer]);

  const handleEnded = useCallback(() => {
    if (sleepTimerRef.current?.kind === "track") {
      updateSleepTimer(null);
      return;
    }

    const player = playerRef.current;
    if (repeatRef.current === "one" && player && typeof player.seekTo === "function") {
      player.seekTo(0, true);
      if (typeof player.playVideo === "function") player.playVideo();
      setCurrentTime(0);
      return;
    }

    const next = currentIndexRef.current + 1;
    if (next < queueRef.current.length) loadIndex(next);
    else if (repeatRef.current === "all" && queueRef.current.length > 0) loadIndex(0);
  }, [loadIndex, updateSleepTimer]);

  const playQueue = useCallback(
    (tracks, startIndex = 0) => {
      if (!tracks?.[startIndex]) return;

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
    const anchor = anchorIndex(currentIndexRef.current, pendingIndexRef.current);
    if (anchor < 0) return;
    setQueueSynced(queueRef.current.slice(0, anchor + 1));
  }, [setQueueSynced]);

  const toggleShuffle = useCallback(() => {
    const turningOn = !shuffleRef.current;
    shuffleRef.current = turningOn;
    setShuffle(turningOn);

    const current = queueRef.current;
    const currentIdx = currentIndexRef.current;
    const pendingIdx = pendingIndexRef.current;

    if (turningOn) {
      // Mọi bài từ đầu đến anchor đứng yên, nên cả currentIndex lẫn pendingIndex vẫn đúng
      const anchor = anchorIndex(currentIdx, pendingIdx);
      shuffleOriginalRef.current = current.map((entry) => entry.queueId);
      setQueueSynced([...current.slice(0, anchor + 1), ...shuffleArray(current.slice(anchor + 1))]);
      return;
    }

    // Tắt shuffle: thứ tự đổi nên phải dò lại vị trí của cả bài đang phát lẫn bài đang chờ
    const currentEntry = current[currentIdx];
    const pendingEntry = pendingIdx !== null ? current[pendingIdx] : undefined;
    const restored = restoreOriginalOrder(current, shuffleOriginalRef.current);
    shuffleOriginalRef.current = [];
    setQueueSynced(restored);
    if (currentEntry) setCurrentIndexSynced(restored.indexOf(currentEntry));
    if (pendingEntry) pendingIndexRef.current = restored.indexOf(pendingEntry);
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
        updateSleepTimer({ kind: "minutes", minutes: value, endsAt: Date.now() + value * 60000 });
      } else {
        updateSleepTimer(null);
      }
    },
    [updateSleepTimer]
  );

  const applySavedState = useCallback(
    (saved) => {
      // `saved` đã qua sanitizeState trong loadPlayerState nên các giá trị ở đây đã hợp lệ
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
        if (typeof player.setVolume === "function") player.setVolume(saved.volume);
        if (saved.muted && typeof player.mute === "function") player.mute();
        else if (!saved.muted && typeof player.unMute === "function") player.unMute();
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
    if (!userId) return;

    // restoreDoneRef = tài khoản mà trạng thái hiện trong player đang thuộc về.
    // Vẫn là tài khoản đó thì không làm gì cả.
    const loadedFor = restoreDoneRef.current;
    if (loadedFor === userId) return;

    // Chuyển thẳng A -> B (không qua đăng xuất): bỏ hàng đợi của A trước khi khôi phục B.
    // Khách (loadedFor = null) đăng nhập lần đầu thì giữ nguyên hàng đợi đang nghe.
    if (loadedFor) resetPlayer();

    restoreDoneRef.current = userId;
    if (queueRef.current.length > 0) return;

    // loadPlayerState đã tự kiểm tra/chuẩn hoá dữ liệu và không ném lỗi
    const saved = loadPlayerState(userId);
    if (saved) applySavedState(saved);
  }, [userId, applySavedState, resetPlayer]);

  const persistNow = useCallback(() => {
    const id = userIdRef.current;
    if (!id || restoreDoneRef.current !== id) return;

    const queueNow = queueRef.current;
    const index = currentIndexRef.current >= 0 ? currentIndexRef.current : pendingIndexRef.current;
    if (queueNow.length === 0 || index === null || index < 0) return;

    const position =
      cuedPositionRef.current !== null
        ? cuedPositionRef.current
        : readyRef.current
          ? getPlayerTime()
          : 0;

    lastPersistAtRef.current = Date.now();
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
  }, [getPlayerTime]);

  useEffect(() => {
    const id = setTimeout(persistNow, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [queue, currentIndex, shuffle, repeat, volume, isMuted, userId, persistNow]);

  // Gọi từ mỗi lần lấy mẫu thời gian khi tab đang hiện; tối đa mỗi PERSIST_INTERVAL_MS mới ghi một lần
  // nên không cần một setInterval riêng chỉ để lưu.
  const persistThrottled = useCallback(() => {
    if (Date.now() - lastPersistAtRef.current < PERSIST_INTERVAL_MS) return;
    persistNow();
  }, [persistNow]);

  // Khi đang tạm dừng thì không có lấy mẫu nào chạy, nên kéo thanh thời gian phải tự kích hoạt lưu.
  // Không gộp vào effect debounce phía trên: lúc đang phát currentTime đổi mỗi 500ms < 800ms
  // nên timer sẽ bị huỷ liên tục và không bao giờ kịp lưu.
  useEffect(() => {
    if (isPlaying) return;
    const id = setTimeout(persistNow, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [currentTime, isPlaying, persistNow]);

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
      const hidden = document.visibilityState === "hidden";
      logBg("visibility", document.visibilityState);
      setIsForeground(!hidden);

      const player = playerRef.current;
      const state = typeof player?.getPlayerState === "function" ? player.getPlayerState() : null;
      const active = state === YT_STATE.PLAYING || state === YT_STATE.BUFFERING;

      if (hidden) {
        hiddenSinceRef.current = Date.now();
        resumeAttemptsRef.current = 0;

        // Người dùng không bật phát nền thì không tự phát gì cả (kể cả khi trước đó họ đã bấm tạm dừng)
        if (!resumeOnHideRef.current) return;

        if (active) {
          startKeepAlive();
        } else if (
          state === YT_STATE.PAUSED &&
          Date.now() - lastForeignPauseRef.current < HIDE_PAUSE_GRACE_MS
        ) {
          // Trình duyệt vừa pause ngay trước khi ẩn tab -> coi là bị gián đoạn
          tryResumePlayback();
        }
        return;
      }

      hiddenSinceRef.current = 0;
      resumeAttemptsRef.current = 0;
      if (!active) stopKeepAlive();
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
  }, [tryResumePlayback]);

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

  useEffect(() => {
    handleEndedRef.current = handleEnded;
  }, [handleEnded]);

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
            if (typeof player?.setVolume === "function") player.setVolume(volumeRef.current);
            if (mutedRef.current && typeof player?.mute === "function") player.mute();
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
            logBg("state", String(event.data));
            setIsPlaying(event.data === YT.PlayerState.PLAYING);
            if (event.data === YT.PlayerState.PLAYING) {
              errorStreakRef.current = 0;
              cuedPositionRef.current = null;
              if (resumeOnHideRef.current) startKeepAlive();
            }
            if (event.data === YT.PlayerState.CUED) {
              setDuration(playerRef.current?.getDuration?.() || 0);
            }
            if (event.data === YT.PlayerState.PAUSED) {
              const ownPause = ownPauseRef.current;
              ownPauseRef.current = false;

              if (ownPause) {
                // Người dùng/app chủ động dừng: không tự phát lại
                stopKeepAlive();
              } else {
                lastForeignPauseRef.current = Date.now();
                tryResumePlayback();
              }
            }
            if (event.data === YT.PlayerState.ENDED) {
              handleEndedRef.current?.();
            }
          },
          onError: (event) => {
            handlePlayerErrorRef.current?.(event.data);
          },
        },
      });
    }).catch((err) => {
      if (cancelled) return;
      console.error("Lỗi khởi tạo trình phát YouTube:", err);
      setPlayerLoadError(err instanceof Error ? err.message : String(err));
    });

    return () => {
      cancelled = true;

      // Huỷ iframe cũ khi unmount hoặc khi thử tải lại, kẻo trình phát cũ vẫn còn trong DOM
      const player = playerRef.current;
      if (player && typeof player.destroy === "function") {
        try {
          player.destroy();
        } catch (err) {
          console.warn("Không huỷ được trình phát YouTube:", err);
        }
      }
      playerRef.current = null;
      readyRef.current = false;
      setIsReady(false);
      setIsPlaying(false);
      stopKeepAlive();
    };
  }, [loadAttempt, tryResumePlayback]);

  useEffect(() => {
    // IFrame API không có sự kiện timeupdate nên buộc phải lấy mẫu định kỳ, nhưng chỉ khi tab đang hiện:
    // ở nền không ai nhìn thanh thời gian nên không cần vòng lặp nào, đỡ tốn pin.
    if (!isPlaying || !isForeground || !playerRef.current) return;

    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      if (Date.now() >= seekHoldUntilRef.current && typeof player.getCurrentTime === "function") {
        setCurrentTime(player.getCurrentTime() || 0);
      }
      if (typeof player.getDuration === "function") {
        setDuration(player.getDuration() || 0);
      }
      persistThrottled();
    }, 500);

    return () => clearInterval(interval);
  }, [isPlaying, isForeground, persistThrottled]);

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

    setMediaAction("play", () => {
      logBg("mediasession", "play");
      playPlayer();
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
  }, [currentTrack, playNext, playPrev, pausePlayer, playPlayer]);

  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;

    setMediaAction("seekto", (details) => {
      if (typeof details?.seekTime === "number") seekTo(details.seekTime);
    });
    setMediaAction("seekbackward", (details) => seekBy(-(details?.seekOffset || SEEK_STEP_SECONDS)));
    setMediaAction("seekforward", (details) => seekBy(details?.seekOffset || SEEK_STEP_SECONDS));
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