"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import BootScreen from "@/components/BootScreen";
import GuestScreen from "@/components/GuestScreen";
import Logo from "@/components/Logo";
import MainContent from "@/components/MainContent";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import { useAuth } from "@/context/AuthContext";

export default function AppShell({ children }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const isAuthRoute = pathname.startsWith("/auth/");
  const isSharedRoute = pathname.startsWith("/p/");

  if (isAuthRoute) return <MainContent className="open-stage">{children}</MainContent>;

  if (loading) return <BootScreen />;

  if (!user) {
    if (isSharedRoute) {
      return (
        <MainContent className="open-stage">
          <Link href="/" aria-label="SUS Music" className="open-brand">
            <Logo size={36} />
            <span className="font-display text-xl font-extrabold leading-none">
              SUS <span className="text-accent">Music</span>
            </span>
          </Link>
          {children}
        </MainContent>
      );
    }
    return (
      <Suspense fallback={<BootScreen />}>
        <GuestScreen />
      </Suspense>
    );
  }

  return (
    <>
      <Sidebar />
      <TopBar />
      <MainContent>{children}</MainContent>
    </>
  );
}
