"use client";

import LoginButton from "@/components/LoginButton";
import Logo from "@/components/Logo";
import { PageSkeleton } from "@/components/Skeleton";
import { useAuth } from "@/context/AuthContext";

export default function RequireAuth({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <PageSkeleton />;

  if (!user) {
    return (
      <div className="fade-in flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
        <Logo size={72} className="bob" />
        <p className="max-w-sm text-muted">Cần đăng nhập để xem trang này.</p>
        <LoginButton />
      </div>
    );
  }

  return children;
}
