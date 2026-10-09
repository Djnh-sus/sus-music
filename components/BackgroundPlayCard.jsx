"use client";

import { useState } from "react";
import { usePlayer } from "@/context/PlayerContext";
import { useToast } from "@/context/ToastContext";
import { usePwaInstall } from "@/lib/pwa-install";
import { clearBgLog, formatBgLog, readBgLog } from "@/lib/bg-log";
import { copyText } from "@/lib/clipboard";
import { isKeepAliveActive } from "@/lib/keepalive-audio";

const SHOWN_ENTRIES = 40;

function readStatus() {
  return {
    mediaSession: "mediaSession" in navigator,
    keepAlive: isKeepAliveActive(),
    entries: readBgLog(),
  };
}

export default function BackgroundPlayCard() {
  const { resumeOnHide, setResumeOnHide } = usePlayer();
  const { isStandalone } = usePwaInstall();
  const { showToast } = useToast();
  const [status, setStatus] = useState(readStatus);

  const refresh = () => setStatus(readStatus());

  const handleCopy = async () => {
    const ok = await copyText(formatBgLog(status.entries));
    showToast(ok ? "Đã sao chép nhật ký" : "Không sao chép được nhật ký");
  };

  const handleClear = () => {
    clearBgLog();
    refresh();
  };

  const shown = status.entries.slice(-SHOWN_ENTRIES);

  return (
    <section className="rounded-2xl border-2 border-border bg-surface/60 p-5">
      <h2 className="mb-2 font-display text-lg font-bold">Phát nền (thử nghiệm)</h2>
      <p className="mb-4 text-sm text-muted">
        Khi bật, app giữ một luồng âm thanh im lặng và tự bấm phát lại nếu YouTube tự dừng ngay sau
        khi tắt màn hình hoặc chuyển ứng dụng. YouTube hoặc hệ điều hành vẫn có thể dừng nhạc: kết quả
        tuỳ máy và trình duyệt.
      </p>

      <label className="mb-4 flex items-center gap-3 text-sm font-semibold">
        <input
          type="checkbox"
          checked={resumeOnHide}
          onChange={(e) => setResumeOnHide(e.target.checked)}
          className="h-5 w-5 accent-[var(--accent)]"
        />
        Thử giữ nhạc khi chuyển tab hoặc khoá màn hình
      </label>

      <ul className="mb-4 space-y-1 text-sm text-muted">
        <li>Đã cài như ứng dụng: {isStandalone ? "có" : "chưa"}</li>
        <li>Điều khiển ở màn khoá (Media Session): {status.mediaSession ? "có" : "không hỗ trợ"}</li>
        <li>Luồng giữ phiên đang chạy: {status.keepAlive ? "có" : "không"}</li>
      </ul>

      <p className="mb-3 text-sm text-muted">
        Cách thử: bật tuỳ chọn, phát một bài, tắt màn hình khoảng 30 giây, mở lại rồi bấm “Làm mới”.
        Gửi nhật ký bên dưới để biết máy của bạn xử lý ra sao.
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        <button type="button" onClick={refresh} className="btn-ghost py-1.5 text-sm">
          Làm mới
        </button>
        <button type="button" onClick={handleCopy} className="btn-ghost py-1.5 text-sm">
          Sao chép nhật ký
        </button>
        <button type="button" onClick={handleClear} className="btn-ghost py-1.5 text-sm">
          Xoá
        </button>
      </div>

      <pre className="max-h-60 overflow-auto rounded-xl bg-background/70 p-3 font-mono text-xs leading-relaxed text-muted">
        {shown.length > 0 ? formatBgLog(shown) : "Chưa có sự kiện nào."}
      </pre>
    </section>
  );
}
