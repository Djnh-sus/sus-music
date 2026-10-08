"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Nếu Google/Supabase trả lỗi thẳng trên URL redirect (redirect URL
    // chưa được thêm vào allowlist, user bấm huỷ ở màn hình consent...),
    // lỗi nằm ở query param — báo luôn, không cần đợi session.
    const errorDescription = searchParams.get("error_description");
    if (errorDescription) {
      router.replace(`/?login_error=${encodeURIComponent(errorDescription)}`);
      return;
    }

    let handled = false;

    const finishLogin = async (session) => {
      if (handled) return;
      handled = true;

      // provider_refresh_token chỉ xuất hiện đúng 1 lần, ngay sau lần đăng
      // nhập đầu tiên. Phải lưu ngay tại đây.
      if (session?.provider_refresh_token) {
        try {
          await fetch("/api/youtube/save-token", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              refresh_token: session.provider_refresh_token,
            }),
          });
        } catch (err) {
          console.error("Lưu refresh token thất bại:", err);
        }
      }

      router.replace("/");
    };

    // Session có thể đã sẵn sàng ngay khi trang này mount (nếu supabase-js
    // vừa kịp exchange code xong), hoặc đến ngay sau đó qua sự kiện
    // SIGNED_IN — nên phải nghe cả 2 đường thay vì chỉ gọi getSession() 1
    // lần rồi thôi (gọi 1 lần bị race condition: có thể chạy trước khi
    // supabase-js kịp đổi code lấy session, khiến trang tưởng nhầm là
    // đăng nhập thất bại rồi quay về trang chủ như chưa có gì xảy ra).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) finishLogin(session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        finishLogin(session);
      }
    });

    // Nếu sau 8 giây vẫn chưa có session thật (lỗi thật sự, không phải do
    // chậm), báo lỗi rõ ràng thay vì im lặng quay về trang chủ.
    const timeout = setTimeout(() => {
      if (!handled) {
        handled = true;
        router.replace("/?login_error=timeout");
      }
    }, 8000);

    return () => {
      listener.subscription.unsubscribe();
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  return (
    <div className="flex min-h-[80vh] items-center justify-center text-muted">
      Đang đăng nhập...
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[80vh] items-center justify-center text-muted">
          Đang đăng nhập...
        </div>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}
