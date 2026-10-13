"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Pause, Play, Share2, SkipBack, SkipForward } from "lucide-react";
import { useNowPlayingUi, usePlayer } from "@/context/PlayerContext";
import { useToast } from "@/context/ToastContext";
import FavoriteButton from "@/components/FavoriteButton";
import FollowButton from "@/components/FollowButton";
import NowPlayingBackdrop from "@/components/NowPlayingBackdrop";
import PlaybackOptions from "@/components/PlaybackOptions";
import ProgressBar from "@/components/ProgressBar";
import QueueList from "@/components/QueueList";
import TimeLabel from "@/components/TimeLabel";
import TrackMenu from "@/components/TrackMenu";
import { copyText } from "@/lib/clipboard";
import { useMediaQuery } from "@/lib/use-media-query";
import { hqThumbnail } from "@/lib/thumbnail";
import { youtubeWatchUrl } from "@/lib/youtube-url";

const OPEN_MS = 420;
const CLOSE_MS = 360;
const FLIP_KEYS = ["title", "progress", "time", "transport", "heart", "volume"];
const STAGGER_BASE_MS = 260;
const STAGGER_STEP_MS = 60;
const DISMISS_MS = 220;
const DISMISS_DISTANCE = 110;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function rectOf(el) {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function flipTransform(small, large) {
  const scale = small.width / large.width;
  const dx = small.left + small.width / 2 - (large.left + large.width / 2);
  const dy = small.top + small.height / 2 - (large.top + large.height / 2);
  return `translate(${dx}px, ${dy}px) scale(${scale})`;
}

function setFlying(host, rect) {
  host.dataset.flying = "true";
  host.style.top = `${rect.top}px`;
  host.style.left = `${rect.left}px`;
  host.style.width = `${rect.width}px`;
  host.style.height = `${rect.height}px`;
}

function clearFlying(host) {
  delete host.dataset.flying;
  host.style.top = "";
  host.style.left = "";
  host.style.width = "";
  host.style.height = "";
}

function isOnScreen(rect) {
  return rect.top + rect.height > 0 && rect.top < window.innerHeight;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function collectShared(layer) {
  const bar = document.querySelector(".player-bar");
  if (!bar || !layer) return [];
  const items = [];
  for (const key of FLIP_KEYS) {
    const fromEl = bar.querySelector(`[data-flip="${key}"]`);
    const toEl = layer.querySelector(`[data-flip="${key}"]`);
    if (!fromEl || !toEl) continue;
    const from = rectOf(fromEl);
    const to = rectOf(toEl);
    if (from.width === 0 || from.height === 0 || to.width === 0 || to.height === 0) continue;
    items.push({ key, el: toEl, from, to });
  }
  return items;
}

function sharedTransform({ key, from, to }) {
  let scaleX = 1;
  let scaleY = 1;
  if (key === "title") {
    scaleX = scaleY = clamp(from.height / to.height, 0.35, 1);
  } else if (key === "progress") {
    scaleX = clamp(from.width / to.width, 0.2, 1.6);
  } else if (key === "transport") {
    scaleX = scaleY = clamp(from.width / to.width, 0.4, 1.2);
  }
  const dx = from.left - to.left;
  const dy = from.top - to.top + (from.height - to.height * scaleY) / 2;
  return `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
}

function prepare(el) {
  el.style.transformOrigin = "0 0";
  el.style.willChange = "transform, opacity";
}

function release(el) {
  el.style.transformOrigin = "";
  el.style.willChange = "";
}

function runSharedMotion(layer, reverse) {
  const animations = [];
  const touched = [];

  const track = (el, keyframes, options) => {
    prepare(el);
    touched.push(el);
    const anim = el.animate(keyframes, options);
    animations.push(anim);
    return anim;
  };

  const shared = collectShared(layer);
  const staggered = [...layer.querySelectorAll("[data-stagger]")];

  for (const item of shared) {
    const t = sharedTransform(item);
    const keyframes = reverse
      ? [
          { transform: "none", opacity: 1 },
          { opacity: 1, offset: 0.6 },
          { transform: t, opacity: 0 },
        ]
      : [
          { transform: t, opacity: 0 },
          { opacity: 1, offset: 0.3 },
          { transform: "none", opacity: 1 },
        ];
    track(item.el, keyframes, {
      duration: reverse ? CLOSE_MS : OPEN_MS,
      easing: EASE,
      fill: reverse ? "forwards" : "backwards",
    });
  }

  staggered.forEach((el, i) => {
    const keyframes = reverse
      ? [{ opacity: 1 }, { opacity: 0 }]
      : [
          { opacity: 0, transform: "translateY(14px)" },
          { opacity: 1, transform: "none" },
        ];
    track(el, keyframes, {
      duration: reverse ? 160 : 320,
      delay: reverse ? 0 : STAGGER_BASE_MS + i * STAGGER_STEP_MS,
      easing: EASE,
      fill: reverse ? "forwards" : "backwards",
    });
  });

  const cleanup = () => {
    animations.forEach((anim) => {
      anim.onfinish = null;
      anim.cancel();
    });
    touched.forEach(release);
  };

  const finished = Promise.allSettled(animations.map((anim) => anim.finished)).then(() => {
    touched.forEach(release);
  });

  return { cleanup, finished };
}

export default function NowPlaying() {
  const {
    currentTrack,
    videoContainerRef,
    miniThumbRef,
    isPlaying,
    isReady,
    hasNext,
    playbackError,
    togglePlay,
    playNext,
    playPrev,
  } = usePlayer();
  const { isNowPlayingOpen, closeNowPlaying } = useNowPlayingUi();
  const { showToast } = useToast();
  const pathname = usePathname();
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const wantOpen = isNowPlayingOpen && currentTrack !== null;
  const [mounted, setMounted] = useState(false);
  const [warm, setWarm] = useState(false);
  const [shownTrack, setShownTrack] = useState(null);
  const layerRef = useRef(null);
  const scrollRef = useRef(null);
  const slotRef = useRef(null);
  const skipFlyRef = useRef(false);
  const pathRef = useRef(pathname);

  if (currentTrack && currentTrack !== shownTrack) setShownTrack(currentTrack);
  if (wantOpen && !mounted) setMounted(true);

  const state = !mounted ? "closed" : wantOpen ? "open" : "leaving";

  useEffect(() => {
    if (!currentTrack || warm) return;
    const schedule = window.requestIdleCallback ?? ((cb) => window.setTimeout(cb, 300));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const id = schedule(() => setWarm(true), { timeout: 2000 });
    return () => cancel(id);
  }, [currentTrack, warm]);

  useLayoutEffect(() => {
    if (!wantOpen || !mounted) return;
    const host = videoContainerRef.current;
    const slot = slotRef.current;
    const thumb = miniThumbRef.current;
    if (!host || !slot || !thumb || prefersReducedMotion()) return;

    const large = rectOf(slot);
    const small = rectOf(thumb);
    if (small.width === 0 || large.width === 0) return;

    const layer = layerRef.current;
    const shared = isDesktop ? runSharedMotion(layer, false) : null;

    setFlying(host, large);
    const anim = host.animate(
      [{ transform: flipTransform(small, large) }, { transform: "none" }],
      { duration: OPEN_MS, easing: EASE }
    );
    anim.onfinish = () => clearFlying(host);

    return () => {
      anim.onfinish = null;
      anim.cancel();
      clearFlying(host);
      shared?.cleanup();
    };
  }, [wantOpen, mounted, isDesktop, videoContainerRef, miniThumbRef]);

  useEffect(() => {
    if (wantOpen || !mounted) return;
    const host = videoContainerRef.current;
    const slot = slotRef.current;
    const thumb = miniThumbRef.current;

    const finish = () => {
      skipFlyRef.current = false;
      if (host) clearFlying(host);
      setMounted(false);
    };

    const layer = layerRef.current;
    const large = slot ? rectOf(slot) : null;
    const small = thumb ? rectOf(thumb) : null;
    const canFly =
      host &&
      large &&
      small &&
      !skipFlyRef.current &&
      !prefersReducedMotion() &&
      large.width > 0 &&
      small.width > 0 &&
      isOnScreen(large);

    if (!canFly) {
      const id = setTimeout(finish, skipFlyRef.current ? 0 : CLOSE_MS);
      return () => clearTimeout(id);
    }

    const shared = isDesktop ? runSharedMotion(layer, true) : null;

    setFlying(host, large);
    const anim = host.animate(
      [{ transform: "none" }, { transform: flipTransform(small, large) }],
      { duration: CLOSE_MS, easing: EASE, fill: "forwards" }
    );
    anim.onfinish = finish;

    return () => {
      anim.onfinish = null;
      anim.cancel();
      clearFlying(host);
      shared?.cleanup();
    };
  }, [wantOpen, mounted, isDesktop, videoContainerRef, miniThumbRef]);

  useEffect(() => {
    if (state !== "closed") return;
    const layer = layerRef.current;
    if (!layer) return;
    layer.style.transform = "";
    layer.style.transition = "";
  }, [state]);

  useEffect(() => {
    if (!wantOpen) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape" && !e.defaultPrevented) closeNowPlaying();
    };
    window.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [wantOpen, closeNowPlaying]);

  useEffect(() => {
    if (pathRef.current === pathname) return;
    pathRef.current = pathname;
    closeNowPlaying();
  }, [pathname, closeNowPlaying]);

  useEffect(() => {
    if (!wantOpen || isDesktop) return;
    const layer = layerRef.current;
    const scroller = scrollRef.current;
    if (!layer || !scroller) return;

    let startY = 0;
    let offset = 0;
    let active = false;
    let timer = 0;

    const springBack = () => {
      layer.style.transition = `transform ${DISMISS_MS}ms ${EASE}`;
      layer.style.transform = "";
    };

    const onStart = (e) => {
      if (e.touches.length !== 1 || scroller.scrollTop > 0) {
        active = false;
        return;
      }
      startY = e.touches[0].clientY;
      offset = 0;
      active = true;
      layer.style.transition = "none";
    };

    const onMove = (e) => {
      if (!active) return;
      const delta = e.touches[0].clientY - startY;
      if (delta <= 0) {
        offset = 0;
        layer.style.transform = "";
        return;
      }
      if (e.cancelable) e.preventDefault();
      offset = delta * 0.7;
      layer.style.transform = `translateY(${offset}px)`;
    };

    const onEnd = () => {
      if (!active) return;
      active = false;
      if (offset > DISMISS_DISTANCE) {
        skipFlyRef.current = true;
        layer.style.transition = `transform ${DISMISS_MS}ms ease-in`;
        layer.style.transform = "translateY(100%)";
        timer = window.setTimeout(closeNowPlaying, DISMISS_MS);
      } else if (offset > 0) {
        springBack();
      }
    };

    layer.addEventListener("touchstart", onStart, { passive: true });
    layer.addEventListener("touchmove", onMove, { passive: false });
    layer.addEventListener("touchend", onEnd);
    layer.addEventListener("touchcancel", onEnd);
    return () => {
      window.clearTimeout(timer);
      layer.removeEventListener("touchstart", onStart);
      layer.removeEventListener("touchmove", onMove);
      layer.removeEventListener("touchend", onEnd);
      layer.removeEventListener("touchcancel", onEnd);
    };
  }, [wantOpen, isDesktop, closeNowPlaying]);

  const showContent = (mounted || warm) && shownTrack !== null;
  const poster = shownTrack ? hqThumbnail(shownTrack.videoId) : "";

  const handleShare = async () => {
    const ok = await copyText(youtubeWatchUrl(shownTrack.videoId));
    showToast(ok ? "Đã sao chép liên kết" : "Không sao chép được liên kết");
  };

  return (
    <div
      ref={layerRef}
      role="dialog"
      aria-label="Đang phát"
      aria-hidden={state === "closed"}
      className="np-layer"
      data-state={state}
    >
      <div aria-hidden="true" className="np-bg np-fade pointer-events-none">
        <NowPlayingBackdrop videoId={shownTrack?.videoId} />
      </div>

      <button
        type="button"
        data-stagger
        onClick={closeNowPlaying}
        aria-label="Thu nhỏ trình phát"
        className="icon-btn absolute left-4 top-3 z-10 hidden md:inline-flex"
      >
        <ChevronDown size={24} />
      </button>

      <div
        className="np-fade relative flex shrink-0 items-center gap-1 px-2 md:hidden"
        style={{
          height: "calc(3.5rem + env(safe-area-inset-top, 0px))",
          paddingTop: "env(safe-area-inset-top, 0px)",
        }}
      >
        <button type="button" onClick={closeNowPlaying} aria-label="Thu nhỏ trình phát" className="icon-btn">
          <ChevronDown size={26} />
        </button>
        <span className="font-display text-base font-bold">Đang phát</span>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div ref={scrollRef} className="np-scroll min-h-0 flex-1 px-4 pb-8 md:px-8 md:pb-4">
            <div className="np-col">
              <div className="pt-1 md:pt-[var(--topbar-h)]">
                <div ref={slotRef} className="np-video mx-auto md:mx-0">
                  {poster && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={poster}
                      alt=""
                      className="np-fade absolute inset-0 h-full w-full rounded-2xl object-cover"
                    />
                  )}
                  <div ref={videoContainerRef} className="np-host" />
                </div>
              </div>

              {showContent && (
                <div
                  key={shownTrack.queueId ?? shownTrack.videoId}
                  className="np-fade-m flex flex-col gap-4 pt-5 md:gap-3 md:pt-4"
                >
                  <div className="np-rise" data-flip="title" style={{ "--d": "60ms" }}>
                    <h2 className="line-clamp-2 font-display text-2xl font-extrabold leading-tight md:text-[1.9rem]">
                      {shownTrack.title}
                    </h2>
                    <div className="mt-1 flex min-h-8 flex-wrap items-center gap-3">
                      <p className="text-[15px] font-medium text-foreground/70">{shownTrack.channelTitle}</p>
                      {mounted && <FollowButton track={shownTrack} />}
                    </div>
                  </div>

                  <div className="np-rise flex items-center gap-1" style={{ "--d": "120ms" }}>
                    {mounted ? (
                      <FavoriteButton track={shownTrack} size={22} className="icon-btn" flip="heart" />
                    ) : (
                      <span className="inline-block h-11 w-11" aria-hidden="true" />
                    )}
                    <button
                      type="button"
                      data-stagger
                      onClick={handleShare}
                      aria-label="Chia sẻ"
                      className="icon-btn"
                    >
                      <Share2 size={20} />
                    </button>
                    <span data-stagger className="inline-flex">
                      <TrackMenu track={shownTrack} />
                    </span>
                  </div>

                  {playbackError && (
                    <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
                      {playbackError}
                    </p>
                  )}

                  <div
                    className="np-rise grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto] md:items-center md:gap-x-3 md:gap-y-1"
                    style={{ "--d": "180ms" }}
                  >
                    <div data-flip="progress" className="flex min-w-0 items-center">
                      <ProgressBar className="min-w-0 flex-1" />
                    </div>
                    <TimeLabel
                      flip="time"
                      className="self-end text-xs tabular-nums text-muted md:w-24 md:self-center md:text-right"
                    />
                    <div className="flex justify-center md:col-span-2">
                      <div
                        data-flip="transport"
                        className="flex items-center justify-center gap-6 pt-1 md:pt-0"
                      >
                        <button type="button" onClick={playPrev} aria-label="Bài trước" className="icon-btn">
                          <SkipBack size={28} fill="currentColor" />
                        </button>
                        <button
                          type="button"
                          onClick={togglePlay}
                          disabled={!isReady}
                          aria-label={isPlaying ? "Tạm dừng" : "Phát"}
                          className="btn-primary h-16 w-16 p-0"
                        >
                          {isPlaying ? (
                            <Pause size={28} fill="currentColor" />
                          ) : (
                            <Play size={28} fill="currentColor" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={playNext}
                          disabled={!hasNext}
                          aria-label="Bài kế tiếp"
                          className="icon-btn"
                        >
                          <SkipForward size={28} fill="currentColor" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="np-rise" data-stagger style={{ "--d": "240ms" }}>
                    <PlaybackOptions />
                  </div>

                  {!isDesktop && (
                    <div
                      className="np-rise overflow-hidden rounded-3xl border-2 border-border bg-surface/60"
                      style={{ "--d": "300ms" }}
                    >
                      <QueueList />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {showContent && isDesktop && (
          <aside className="flex w-[24rem] shrink-0 flex-col p-4 pl-0 pt-[calc(var(--topbar-h)+0.25rem)] lg:w-[26rem]">
            <div
              data-stagger
              className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border-2 border-border bg-surface/60"
            >
              <QueueList scroll />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
