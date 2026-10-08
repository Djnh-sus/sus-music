"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { clearYoutubeTokenCache } from "@/lib/youtube-client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined);
  const signOutListenersRef = useRef(new Set());

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === "SIGNED_OUT") {
        clearYoutubeTokenCache();
        signOutListenersRef.current.forEach((listener) => listener());
      }
      setSession(newSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const onSignedOut = useCallback((listener) => {
    signOutListenersRef.current.add(listener);
    return () => {
      signOutListenersRef.current.delete(listener);
    };
  }, []);

  const userId = session?.user?.id ?? null;

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      userId,
      loading: session === undefined,
      onSignedOut,
    }),
    [session, userId, onSignedOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth phải được dùng bên trong <AuthProvider>");
  return ctx;
}
