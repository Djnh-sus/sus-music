"use client";

import { useSearchParams } from "next/navigation";
import LoginButton from "@/components/LoginButton";
import Logo from "@/components/Logo";

export default function GuestScreen() {
  const searchParams = useSearchParams();
  const loginError = searchParams.get("login_error");

  return (
    <main className="guest-stage">
      <div className="fade-in mx-auto flex max-w-xl flex-col items-center gap-5 px-6 text-center">
        <Logo size={120} className="bob" />
        <h1 className="font-display text-5xl font-extrabold leading-none md:text-6xl">
          SUS <span className="text-accent">Music</span>
        </h1>
        <p className="max-w-sm text-muted">
          Nghe nhạc và video YouTube theo cách của riêng bạn: playlist, yêu thích và lịch sử đồng bộ
          trên mọi thiết bị.
        </p>
        {loginError && (
          <p className="max-w-sm text-sm text-danger">
            Đăng nhập thất bại
            {loginError !== "timeout" ? `: ${loginError}` : " (quá thời gian chờ)"}. Thử lại nhé.
          </p>
        )}
        <LoginButton />
      </div>
    </main>
  );
}
