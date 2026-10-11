"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Clock, Music2, Search, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { usePlayer } from "@/context/PlayerContext";
import { authedFetch } from "@/lib/authed-fetch";
import { loadLibrary, searchLibrary } from "@/lib/library-search";
import {
  addSearchHistory,
  clearSearchHistory,
  loadSearchHistory,
} from "@/lib/search-history";
import { normalizeText } from "@/lib/text";

const SUGGEST_DEBOUNCE_MS = 220;
const GROUP_LABELS = {
  library: "Trong thư viện",
  history: "Đã tìm gần đây",
  suggest: "Gợi ý từ YouTube",
};

export default function SearchBar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { userId } = useAuth();
  const { playTrackWithRadio } = usePlayer();
  const listId = useId();
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const urlQuery = pathname === "/search" ? params.get("q") || "" : "";
  const [syncedUrlQuery, setSyncedUrlQuery] = useState(urlQuery);
  const [value, setValue] = useState(urlQuery);
  if (urlQuery !== syncedUrlQuery) {
    setSyncedUrlQuery(urlQuery);
    setValue(urlQuery);
  }

  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [libraryItems, setLibraryItems] = useState([]);
  const [remote, setRemote] = useState({ q: "", items: [] });
  const [active, setActive] = useState(-1);

  const text = value.trim();
  const needle = normalizeText(text);

  const historyMatches = needle
    ? history
        .filter((item) => {
          const normalized = normalizeText(item);
          return normalized.includes(needle) && normalized !== needle;
        })
        .slice(0, 3)
    : history;
  const libraryMatches = text ? searchLibrary(libraryItems, text, 4) : [];
  const remoteLabels = (remote.q === text ? remote.items : [])
    .filter((label) => {
      const normalized = normalizeText(label);
      return normalized !== needle && !historyMatches.some((h) => normalizeText(h) === normalized);
    })
    .slice(0, 6);

  const options = [
    ...(text ? [{ kind: "query", label: text }] : []),
    ...libraryMatches.map((track) => ({ kind: "library", label: track.title, track })),
    ...historyMatches.map((label) => ({ kind: "history", label })),
    ...remoteLabels.map((label) => ({ kind: "suggest", label })),
  ];
  const showPanel = open && options.length > 0;

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open || !userId || text.length < 2) return;
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const res = await authedFetch(`/api/youtube/suggest?q=${encodeURIComponent(text)}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        if (res.ok) setRemote({ q: text, items: data.items || [] });
      } catch {
      }
    }, SUGGEST_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, userId, text]);

  const submit = (query) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setHistory(addSearchHistory(userId, trimmed));
    setValue(trimmed);
    setOpen(false);
    setActive(-1);
    inputRef.current?.blur();
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  const choose = (option) => {
    if (option.kind === "library") {
      playTrackWithRadio(option.track);
      setOpen(false);
      setActive(-1);
      inputRef.current?.blur();
      return;
    }
    submit(option.label);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const option = active >= 0 ? options[active] : null;
    if (option) choose(option);
    else submit(text);
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(index + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((index) => Math.max(index - 1, -1));
    } else if (e.key === "Escape" && showPanel) {
      e.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  };

  const handleClearHistory = () => {
    clearSearchHistory(userId);
    setHistory([]);
    setActive(-1);
  };

  const handleClearInput = () => {
    setValue("");
    setActive(-1);
    inputRef.current?.focus();
  };

  return (
    <div ref={rootRef} className="relative mx-auto w-full max-w-xl">
      <form
        role="search"
        onSubmit={handleSubmit}
        className="flex items-center rounded-full bg-accent text-accent-ink shadow-[0_3px_0_0_var(--accent-lip)] transition-shadow duration-200 focus-within:shadow-[0_3px_0_0_var(--accent-lip),0_0_0_4px_rgb(254_222_41/0.28)]"
      >
        <input
          ref={inputRef}
          id="global-search"
          type="text"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-label="Tìm kiếm"
          autoComplete="off"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => {
            setHistory(loadSearchHistory(userId));
            loadLibrary(userId)
              .then(setLibraryItems)
              .catch(() => {});
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Tìm bài hát, ca sĩ, chủ đề..."
          className="h-11 min-w-0 flex-1 bg-transparent pl-5 text-[15px] font-semibold outline-none placeholder:text-accent-ink/60"
        />
        {value && (
          <button
            type="button"
            onClick={handleClearInput}
            aria-label="Xoá nội dung tìm kiếm"
            className="flex h-11 w-9 items-center justify-center text-accent-ink/70 transition hover:text-accent-ink"
          >
            <X size={18} />
          </button>
        )}
        <button
          type="submit"
          aria-label="Tìm"
          className="flex h-11 w-12 items-center justify-center rounded-full transition active:scale-90"
        >
          <Search size={20} strokeWidth={2.6} />
        </button>
      </form>

      {showPanel && (
        <div className="menu-pop absolute left-0 right-0 top-full z-[60] mt-2 origin-top overflow-hidden rounded-2xl border-2 border-border bg-surface-2 shadow-2xl">
          {!text && (
            <div className="flex items-center justify-between px-4 pb-1 pt-3">
              <span className="text-xs font-semibold text-muted">Tìm kiếm gần đây</span>
              <button
                type="button"
                onClick={handleClearHistory}
                className="text-xs font-semibold text-muted transition hover:text-foreground"
              >
                Xoá tất cả
              </button>
            </div>
          )}
          <ul id={listId} role="listbox" aria-label="Gợi ý tìm kiếm" className="py-1">
            {options.map((option, index) => {
              const showLabel =
                option.kind !== "query" &&
                (text || option.kind !== "history") &&
                (index === 0 || options[index - 1].kind !== option.kind);
              return (
                <li key={`${option.kind}:${option.label}`} role="presentation">
                  {showLabel && (
                    <p className="px-4 pb-1 pt-2 text-xs font-semibold text-muted">
                      {GROUP_LABELS[option.kind]}
                    </p>
                  )}
                  <button
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === active}
                    type="button"
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(option)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                      index === active ? "bg-white/10" : "hover:bg-white/5"
                    }`}
                  >
                    {option.kind === "library" ? (
                      <>
                        <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg bg-surface">
                          {option.track.thumbnail ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={option.track.thumbnail} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Music2 size={16} className="m-2 text-muted" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{option.track.title}</span>
                          <span className="block truncate text-xs text-muted">
                            {option.track.channelTitle}
                          </span>
                        </span>
                      </>
                    ) : (
                      <>
                        {option.kind === "history" ? (
                          <Clock size={16} className="shrink-0 text-muted" />
                        ) : (
                          <Search
                            size={16}
                            className={`shrink-0 ${option.kind === "query" ? "text-accent" : "text-muted"}`}
                          />
                        )}
                        <span className="min-w-0 truncate">
                          {option.kind === "query" ? (
                            <>
                              Tìm “<span className="font-semibold">{option.label}</span>”
                            </>
                          ) : (
                            option.label
                          )}
                        </span>
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
