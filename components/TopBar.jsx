"use client";

import Link from "next/link";
import Logo from "@/components/Logo";
import SearchBar from "@/components/SearchBar";
import AccountMenu from "@/components/AccountMenu";
import { useAuth } from "@/context/AuthContext";

export default function TopBar() {
  const { user } = useAuth();

  return (
    <header className="topbar">
      <Link href="/" aria-label="Trang chủ" className="shrink-0 md:hidden">
        <Logo size={38} />
      </Link>
      <div className="min-w-0 flex-1">{user && <SearchBar />}</div>
      <AccountMenu />
    </header>
  );
}
