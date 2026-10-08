"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Pause, Play, Share2, SkipBack, SkipForward } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import { useToast } from "@/context/ToastContext";
import FavoriteButton from "@/components/FavoriteButton";
import PlaybackOptions from "@/components/PlaybackOptions";
import ProgressBar from "@/components/ProgressBar";
import QueueList from "@/components/QueueList";
import TimeLabel from "@/components/TimeLabel";
import TrackMenu from "@/components/TrackMenu";
import { copyText } from "@/lib/clipboard";
import { hqThumbnail } from "@/lib/thumbnail";
import { youtubeWatchUrl } from "@/lib/youtube-url";

const OPEN_MS = 460;
const CLOSE_MS = 320;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const THUMB_RADIUS = 8;
const FRAME_RADIUS = 16;

function rectOf(el) {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function flipBetween(small, large) {
  const scale = small.width / large.width;
  const dx = small.left + small.width / 2 - (large.left + large.width / 2);
  const dy = small.top + small.height / 2 - (large.top + large.height / 2);
  return { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, radius: THUMB_RADIUS / scale };
}

export default function NowPlaying() {
  const {
    currentTrack,
    isNowPlayingOpen,
    closeNowPlaying,
    videoContainerRef,
    miniThumbRef,
    setVideoFrame,
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

  const wantOpen = isNowPlayingOpen && currentTrack !== null;
  const [mounted, setMounted] = useState(false);
  const [shownTrack, setShownTrack] = useState(null);
  const slotRef = useRef(null);
  const animRef = useRef(null);
  const pathRef = useRef(pathname);

  if (currentTrack && currentTrack !== shownTrack) setShownTrack(currentTrack);
  if (wantOpen && !mounted) setMounted(true);

  useLayoutEffect(() => {
    if (!wantOpen || !mounted) return;
    const slot = slotRef.current;
    const container = videoContainerRef.current;
    if (!slot || !container) return;

    animRef.current?.cancel();
    animRef.current = null;

    const large = rectOf(slot);
    setVideoFrame(large);

    const thumb = miniThumbRef.current;
    if (!thumb || prefersReducedMotion()) return;
    const small = rectOf(thumb);
    if (small.width === 0 || large.width === 0) return;

    const from = flipBetween(small, large);
    animRef.current = container.animate(
      [
        { transform: from.transform, borderRadius: `${from.radius}px` },
        { transform: "none", borderRadius: `${FRAME_RADIUS}px` },
      ],
      { duration: OPEN_MS, easing: EASE }
    );
  }, [wantOpen, mounted, videoContainerRef, miniThumbRef, setVideoFrame]);

  useEffect(() => {
    if (!wantOpen || !mounted) return;
    const slot = slotRef.current;
    if (!slot) return;

    let raf = 0;
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setVideoFrame(rectOf(slot)));
    };

    const observer = new ResizeObserver(sync);
    observer.observe(slot);
    window.addEventListener("resize", sync);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [wantOpen, mounted, setVideoFrame]);

  useEffect(() => {
    if (wantOpen || !mounted) return;
    const container = videoContainerRef.current;
    const thumb = miniThumbRef.current;

    const finish = () => {
      animRef.current = null;
      setVideoFrame(null);
      setMounted(false);
    };

    if (!container || !thumb || prefersReducedMotion()) {
      const id = requestAnimationFrame(finish);
      return () => cancelAnimationFrame(id);
    }

    const large = rectOf(container);
    const small = rectOf(thumb);
    if (small.width === 0 || large.width === 0) {
      const id = requestAnimationFrame(finish);
      return () => cancelAnimationFrame(id);
    }

    const to = flipBetween(small, large);
    const anim = container.animate(
      [
        { transform: "none", borderRadius: `${FRAME_RADIUS}px` },
        { transform: to.transform, borderRadius: `${to.radius}px` },
      ],
      { duration: CLOSE_MS, easing: EASE, fill: "forwards" }
    );
    animRef.current = anim;
    anim.onfinish = finish;

    return () => {
      anim.onfinish = null;
      anim.cancel();
    };
  }, [wantOpen, mounted, videoContainerRef, miniThumbRef, setVideoFrame]);

  useEffect(() => {
    if (!wantOpen) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape" && !e.defaultPrevented) closeNowPlaying();
    };
    window.addEventListener("keydown", onKeyDown);

    const lock = window.matchMedia("(max-width: 767px)").matches;
    const previousOverflow = document.body.style.overflow;
    if (lock) document.body.style.overflow = "hidden";

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

  if (!mounted || !shownTrack) return null;

  const leaving = !wantOpen;
  const poster = hqThumbnail(shownTrack.videoId);

  const handleShare = async () => {
    const ok = await copyText(youtubeWatchUrl(shownTrack.videoId));
    showToast(ok ? "Đã sao chép liên kết" : "Không sao chép được liên kết");
  };

  return (
    <div
      role="dialog"
      aria-label="Đang phát"
      className="np-layer"
      data-leaving={leaving ? "true" : "false"}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {poster && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={shownTrack.videoId}
            src={poster}
            alt=""
            className="fade-in h-full w-full scale-125 object-cover opacity-30 blur-3xl"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/75 to-background" />
      </div>

      <div
        className="relative flex shrink-0 items-center gap-1 px-2 md:hidden"
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
          <div className="shrink-0 px-4 pt-1 md:px-8 md:pt-6">
            <div ref={slotRef} className="np-video mx-auto md:mx-0">
              {poster && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover" />
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-5 md:px-8">
            <div key={shownTrack.queueId ?? shownTrack.videoId} className="flex flex-col gap-5">
              <div className="rise" style={{ "--d": "60ms" }}>
                <h2 className="font-display text-2xl font-extrabold leading-tight md:text-3xl">
                  {shownTrack.title}
                </h2>
                <p className="mt-1 text-base font-semibold text-visor">{shownTrack.channelTitle}</p>
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

              <div className="rise -mx-4 md:hidden" style={{ "--d": "300ms" }}>
                <QueueList />
              </div>
            </div>
          </div>
        </div>

        <aside className="rise hidden w-[24rem] shrink-0 flex-col border-l-2 border-border bg-sidebar/60 md:flex lg:w-[26rem]">
          <QueueList scroll />
        </aside>
      </div>
    </div>
  );
}
