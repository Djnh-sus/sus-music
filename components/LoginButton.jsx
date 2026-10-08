"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function LoginButton({ label = "Đăng nhập bằng Google", className = "" }) {
  const [busy, setBusy] = useState(false);

  const handleLogin = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: "https://www.googleapis.com/auth/youtube.readonly",
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) setBusy(false);
  };

  return (
    <button
      type="button"
      onClick={handleLogin}
      disabled={busy}
      className={`btn-primary px-7 py-3 text-base ${className}`}
    >
      {busy ? "Đang chuyển tới Google..." : label}
    </button>
  );
}
