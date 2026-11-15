"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";

type Entry = { id: number; title: string; node: ReactNode };
type Api = { open: (node: ReactNode, title: string) => void; close: () => void; back: () => void };

const SheetContext = createContext<Api | null>(null);

export function useSheet(): Api {
  const api = useContext(SheetContext);
  if (!api) throw new Error("useSheet outside SheetProvider");
  return api;
}

const DURATION = 150;
const CLOSE_DRAG = 90;

export function SheetProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Entry[]>([]);
  const [shown, setShown] = useState(false);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const nextId = useRef(1);
  const dragStart = useRef<number | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  const open = useCallback((node: ReactNode, title: string) => {
    setStack((s) => [...s, { id: nextId.current++, title, node }]);
    setDrag(0);
    requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
  }, []);

  const close = useCallback(() => {
    setShown(false);
    window.setTimeout(() => {
      setStack([]);
      setDrag(0);
    }, DURATION);
  }, []);

  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const api = useMemo(() => ({ open, close, back }), [open, close, back]);

  const top = stack.at(-1);

  useEffect(() => {
    if (!top) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    panel.current?.focus({ preventScroll: true });
    return () => {
      html.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [top, close]);

  useEffect(() => {
    panel.current?.querySelector("[data-sheet-scroll]")?.scrollTo({ top: 0 });
  }, [top?.id]);

  return (
    <SheetContext.Provider value={api}>
      {children}
      {top
        ? createPortal(
            <div className="fixed inset-0 z-50">
              <div
                aria-hidden
                onClick={close}
                className={`absolute inset-0 bg-black/45 transition-opacity duration-150 ${shown ? "opacity-100" : "opacity-0"}`}
              />
              <div
                ref={panel}
                role="dialog"
                aria-modal="true"
                aria-label={top.title}
                tabIndex={-1}
                style={{ transform: shown ? `translateY(${drag}px)` : "translateY(100%)" }}
                className={`absolute inset-x-0 bottom-0 mx-auto flex max-h-[88dvh] w-full max-w-[420px] flex-col rounded-t-[14px] border-t border-divider bg-sheet outline-none ${
                  dragging ? "" : "transition-transform duration-150 ease-out"
                }`}
              >
                <div
                  className="shrink-0 cursor-grab touch-none select-none px-4 pt-2 active:cursor-grabbing"
                  onPointerDown={(e) => {
                    dragStart.current = e.clientY;
                    setDragging(true);
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    if (dragStart.current === null) return;
                    setDrag(Math.max(0, e.clientY - dragStart.current));
                  }}
                  onPointerUp={() => {
                    const d = drag;
                    dragStart.current = null;
                    setDragging(false);
                    if (d > CLOSE_DRAG) close();
                    else setDrag(0);
                  }}
                  onPointerCancel={() => {
                    dragStart.current = null;
                    setDragging(false);
                    setDrag(0);
                  }}
                >
                  <div className="mx-auto h-1 w-9 rounded-full bg-divider" />
                  <div className="flex h-11 items-center gap-1">
                    {stack.length > 1 ? (
                      <button
                        type="button"
                        onClick={back}
                        aria-label="Back"
                        className="-ml-2 flex size-9 items-center justify-center rounded-full text-accent transition-colors duration-150 active:bg-fill"
                      >
                        <ChevronLeft size={20} aria-hidden />
                      </button>
                    ) : null}
                    <p className="flex-1 truncate text-[15px] font-semibold">{top.title}</p>
                    <button
                      type="button"
                      onClick={close}
                      className="-mr-2 h-9 rounded-full px-2 text-[15px] font-medium text-accent transition-opacity duration-150 active:opacity-60"
                    >
                      Done
                    </button>
                  </div>
                </div>
                <div data-sheet-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+20px)]">
                  {top.node}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </SheetContext.Provider>
  );
}
