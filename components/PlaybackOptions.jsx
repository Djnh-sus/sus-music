"use client";

import { Moon, Repeat, Repeat1, Shuffle } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import VolumeControl from "@/components/VolumeControl";

const REPEAT_LABELS = {
  off: "Lặp lại: tắt",
  all: "Lặp lại: tất cả",
  one: "Lặp lại: một bài",
};

const SLEEP_OPTIONS = [
  { value: "off", label: "Tắt hẹn giờ" },
  { value: "15", label: "15 phút" },
  { value: "30", label: "30 phút" },
  { value: "60", label: "60 phút" },
  { value: "track", label: "Hết bài này" },
];

export default function PlaybackOptions() {
  const {
    shuffle,
    repeat,
    sleepTimer,
    resumeOnHide,
    toggleShuffle,
    cycleRepeat,
    setSleepTimer,
    setResumeOnHide,
  } = usePlayer();

  const sleepValue =
    sleepTimer === null ? "off" : sleepTimer.kind === "track" ? "track" : String(sleepTimer.minutes);

  const handleSleepChange = (e) => {
    const value = e.target.value;
    if (value === "off") setSleepTimer(null);
    else if (value === "track") setSleepTimer("track");
    else setSleepTimer(Number(value));
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border-2 border-border bg-surface/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleShuffle}
            aria-label="Xáo trộn"
            aria-pressed={shuffle}
            data-active={shuffle}
            className="icon-btn"
          >
            <Shuffle size={20} />
          </button>
          <button
            type="button"
            onClick={cycleRepeat}
            aria-label={REPEAT_LABELS[repeat]}
            aria-pressed={repeat !== "off"}
            data-active={repeat !== "off"}
            className="icon-btn"
          >
            {repeat === "one" ? <Repeat1 size={20} /> : <Repeat size={20} />}
          </button>
        </div>

        <label className="flex items-center gap-2 text-sm text-muted">
          <Moon size={16} />
          <span className="sr-only">Hẹn giờ tắt</span>
          <select
            value={sleepValue}
            onChange={handleSleepChange}
            aria-label="Hẹn giờ tắt"
            className="rounded-full border-2 border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none transition focus:border-accent"
          >
            {SLEEP_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <VolumeControl className="2xl:hidden" sliderClassName="min-w-0 flex-1" />

      <label className="flex items-start gap-3 text-sm text-muted">
        <input
          type="checkbox"
          checked={resumeOnHide}
          onChange={(e) => setResumeOnHide(e.target.checked)}
          className="mt-1 h-4 w-4 accent-[var(--accent)]"
        />
        <span>
          Thử giữ nhạc khi chuyển tab hoặc khoá màn hình <em>(thử nghiệm)</em>
        </span>
      </label>
    </div>
  );
}
