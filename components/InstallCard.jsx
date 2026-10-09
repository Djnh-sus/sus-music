"use client";

import { usePwaInstall } from "@/lib/pwa-install";

export default function InstallCard() {
  const { canPrompt, isIOS, isStandalone, install } = usePwaInstall();

  let body;
  if (isStandalone) {
    body = <p className="text-sm text-muted">Bạn đang dùng SUS Music như một ứng dụng đã cài.</p>;
  } else if (canPrompt) {
    body = (
      <>
        <p className="mb-4 text-sm text-muted">
          Cài về máy để mở như app riêng: có icon trên màn hình chính, không có thanh địa chỉ.
        </p>
        <button type="button" onClick={install} className="btn-primary">
          Cài ứng dụng
        </button>
      </>
    );
  } else if (isIOS) {
    body = (
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>Mở trang này bằng Safari.</li>
        <li>Bấm nút Chia sẻ ở thanh dưới.</li>
        <li>Chọn “Thêm vào MH chính” rồi bấm Thêm.</li>
      </ol>
    );
  } else {
    body = (
      <p className="text-sm text-muted">
        Mở menu của trình duyệt (dấu ba chấm) và chọn “Cài đặt ứng dụng” hoặc “Thêm vào màn hình
        chính”. Nếu không thấy mục này, trình duyệt đang dùng chưa hỗ trợ cài.
      </p>
    );
  }

  return (
    <section className="rounded-2xl border-2 border-border bg-surface/60 p-5">
      <h2 className="mb-3 font-display text-lg font-bold">Cài ứng dụng</h2>
      {body}
    </section>
  );
}
