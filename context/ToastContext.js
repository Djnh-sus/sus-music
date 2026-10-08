"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, Check } from "lucide-react";

const ToastContext = createContext(null);

const DEFAULT_DURATION_MS = 2800;
const EXIT_MS = 180;
const MAX_VISIBLE = 3;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counterRef = useRef(0);
  const timersRef = useRef(new Map());

  const remove = useCallback((id) => {
    timersRef.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const dismiss = useCallback(
    (id) => {
      clearTimeout(timersRef.current.get(id));
      setToasts((current) =>
        current.map((toast) => (toast.id === id ? { ...toast, closing: true } : toast))
      );
      timersRef.current.set(id, setTimeout(() => remove(id), EXIT_MS));
    },
    [remove]
  );

  const showToast = useCallback(
    (message, { duration = DEFAULT_DURATION_MS, type = "info" } = {}) => {
      counterRef.current += 1;
      const id = counterRef.current;
      setToasts((current) => [...current, { id, message, type, closing: false }].slice(-MAX_VISIBLE));
      timersRef.current.set(
        id,
        setTimeout(() => dismiss(id), duration)
      );
      return id;
    },
    [dismiss]
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, []);

  const value = useMemo(() => ({ showToast, dismiss }), [showToast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-40 z-[70] flex flex-col items-center gap-2 px-4 md:bottom-28"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex max-w-md items-center gap-2.5 rounded-2xl border-2 border-border bg-surface-2 py-2.5 pl-3 pr-4 text-sm font-semibold shadow-2xl ${
              toast.closing ? "toast-out" : "toast-in"
            }`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                toast.type === "error" ? "bg-danger text-accent-ink" : "bg-accent text-accent-ink"
              }`}
            >
              {toast.type === "error" ? <CircleAlert size={14} /> : <Check size={14} strokeWidth={3} />}
            </span>
            <span className="min-w-0">{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast phải được dùng bên trong <ToastProvider>");
  return ctx;
}
