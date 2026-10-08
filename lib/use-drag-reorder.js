"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useDragReorder({ onMove }) {
  const listRef = useRef(null);
  const dragRef = useRef(null);
  const onMoveRef = useRef(onMove);
  const [drag, setDrag] = useState(null);

  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);

  const indexAt = useCallback((clientY) => {
    const rows = listRef.current ? [...listRef.current.children] : [];
    if (rows.length === 0) return -1;
    for (let i = 0; i < rows.length; i++) {
      if (clientY < rows[i].getBoundingClientRect().bottom) return i;
    }
    return rows.length - 1;
  }, []);

  const dragging = drag !== null;

  useEffect(() => {
    if (!dragging) return;

    const finish = (commit) => {
      const state = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (commit && state && state.from !== state.over) onMoveRef.current(state.from, state.over);
    };

    const onPointerMove = (e) => {
      const over = indexAt(e.clientY);
      if (over === -1 || !dragRef.current || over === dragRef.current.over) return;
      dragRef.current = { ...dragRef.current, over };
      setDrag(dragRef.current);
    };
    const onPointerUp = () => finish(true);
    const onPointerCancel = () => finish(false);
    const onKeyDown = (e) => {
      if (e.key === "Escape") finish(false);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [dragging, indexAt]);

  const getHandleProps = (index) => ({
    onPointerDown: (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      dragRef.current = { from: index, over: index };
      setDrag(dragRef.current);
    },
    style: { touchAction: "none", cursor: "grab" },
  });

  return { listRef, drag, getHandleProps };
}
