"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Pause, Play, Share2, SkipBack, SkipForward } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import { useToast } from "@/context/ToastContext";
import FavoriteButton from "@/components/FavoriteButton";
import FollowButton from "@/components/FollowButton";
import PlaybackOptions from "@/components/PlaybackOptions";
import ProgressBar from "@/components/ProgressBar";
import QueueList from "@/components/QueueList";
import TimeLabel from "@/components/TimeLabel";
import TrackMenu from "@/components/TrackMenu";
import { copyText } from "@/lib/clipboard";
import { useMediaQuery } from "@/lib/use-media-query";
import { hqThumbnail, lowThumbnail } from "@/lib/thumbnail";
import { youtubeWatchUrl } from "@/lib/youtube-url";

const OPEN_MS = 460;
const CLOSE_MS = 320;
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

export default function NowPlaying() {
  const {
    currentTrack,
    isNowPlayingOpen,
    closeNowPlaying,
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
  const { showToast } = useToast();
  const pathname = usePathname();
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const wantOpen = isNowPlayingOpen && currentTrack !== null;
  const [mounted, setMounted] = useState(false);
  const [shownTrack, setShownTrack] = useState(null);
  const layerRef = useRef(null);
  const scrollRef = useRef(null);
  const slotRef = useRef(null);
  const skipFlyRef = useRef(false);
  const pathRef = useRef(pathname);

  if (currentTrack && currentTrack !== shownTrack) setShownTrack(currentTrack);
  if (wantOpen && !mounted) setMounted(true);

  const state = !mounted ? "closed" : wantOpen ? "open" : "leaving";

  useLayoutEffect(() => {
    if (!wantOpen || !mounted) return;
    const host = videoContainerRef.current;
    const slot = slotRef.current;
    const thumb = miniThumbRef.current;
    if (!host || !slot || !thumb || prefersReducedMotion()) return;

    const large = rectOf(slot);
    const small = rectOf(thumb);
    if (small.width === 0 || large.width === 0) return;

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
    };
  }, [wantOpen, mounted, videoContainerRef, miniThumbRef]);

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
    };
  }, [wantOpen, mounted, videoContainerRef, miniThumbRef]);

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

  const showContent = mounted && shownTrack !== null;
  const poster = shownTrack ? hqThumbnail(shownTrack.videoId) : "";
  const backdrop = shownTrack ? lowThumbnail(shownTrack.videoId) : "";

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
        {backdrop && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={shownTrack.videoId}
            src={backdrop}
            alt=""
            className="h-full w-full object-cover opacity-30"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/80 to-background" />
      </div>

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
          <div ref={scrollRef} className="np-scroll min-h-0 flex-1 px-4 pb-8 md:px-8">
            <div className="pt-1 md:pt-6">
              <div ref={slotRef} className="np-video mx-auto md:mx-0">
                {poster && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={poster}
                    alt=""
                    className="absolute inset-0 h-full w-full rounded-2xl object-cover"
                  />
                )}
                <div ref={videoContainerRef} className="np-host" />
              </div>
            </div>

            {showContent && (
              <div
                key={shownTrack.queueId ?? shownTrack.videoId}
                className="np-fade flex flex-col gap-5 pt-5"
              >
                <div className="rise" style={{ "--d": "60ms" }}>
                  <h2 className="font-display text-2xl font-extrabold leading-tight md:text-3xl">
                    {shownTrack.title}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-3">
                    <p className="text-base font-semibold text-visor">{shownTrack.channelTitle}</p>
                    <FollowButton track={shownTrack} />
                  </div>
                </div>

                <div className="rise flex items-center gap-1" style={{ "--d": "120ms" }}>
                  <FavoriteButton track={shownTrack} size={22} className="icon-btn" />
                  <button type="button" onClick={handleShare} aria-label="Chia sẻ" className="icon-btn">
                    <Share2 size={20} />
                  </button>
                  <TrackMenu track={shownTrack} />
                </div>

                {playbackError && (
                  <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
                    {playbackError}
                  </p>
                )}

                <div className="rise flex flex-col gap-2 md:hidden" style={{ "--d": "180ms" }}>
                  <ProgressBar />
                  <TimeLabel className="self-end text-xs tabular-nums text-muted" />
                  <div className="flex items-center justify-center gap-6 pt-1">
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

                <div className="rise" style={{ "--d": "240ms" }}>
                  <PlaybackOptions />
                </div>

                {!isDesktop && (
                  <div
                    className="rise overflow-hidden rounded-3xl border-2 border-border bg-surface/60"
                    style={{ "--d": "300ms" }}
                  >
                    <QueueList />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {showContent && isDesktop && (
          <aside className="np-fade flex w-[24rem] shrink-0 flex-col p-4 pl-0 lg:w-[26rem]">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border-2 border-border bg-surface/60">
              <QueueList scroll />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
