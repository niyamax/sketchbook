import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { animate, useMotionValue, useReducedMotion } from "motion/react";
import { PikaChevron } from "../sketch/PikaChevron";
import type { createPaperRenderer } from "./mobile-paper-renderer";
import {
  pageTurnDuration,
  RAPID_TURN_SECONDS,
  HOLD_START_DELAY_MS,
  HOLD_REPEAT_DELAY_MS,
  RAPID_CLICK_WINDOW_MS,
  packetTarget,
} from "./mobile-book-motion";

type PaperRenderer = ReturnType<typeof createPaperRenderer>;
type Turn = {
  from: number;
  to: number;
  direction: 1 | -1;
  front: React.ReactNode;
  under: React.ReactNode;
};
type Gesture = {
  id: number;
  x: number;
  y: number;
  lastX: number;
  time: number;
  velocity: number;
  axis: "x" | "y" | null;
  moved: boolean;
};

export function MobileFoldedBook({
  pages,
  page,
  onPageChange,
}: {
  pages: React.ReactNode[];
  page: number;
  onPageChange: (page: number) => void;
}) {
  const reduced = useReducedMotion();
  const book = useRef<HTMLDivElement | null>(null);
  const canvasHost = useRef<HTMLDivElement | null>(null);
  const front = useRef<HTMLDivElement | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);
  const cover = useRef<HTMLDivElement | null>(null);
  const renderer = useRef<PaperRenderer | null>(null);
  const [ready, setReady] = useState(false);
  const [presented, setPresented] = useState(false);
  const [ground, setGround] = useState<PaperRenderer["groundFootprint"] | null>(null);
  const [revision, setRevision] = useState(0);
  const [turn, setTurn] = useState<Turn | null>(null);
  const activeTurn = useRef<Turn | null>(null);
  const preparedTurn = useRef<Turn | null>(null);
  const acceleratedTurn = useRef<Turn | null>(null);
  const gatheringPacket = useRef<Turn | null>(null);
  const packetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animation = useRef<ReturnType<typeof animate> | null>(null);
  const progress = useMotionValue(0);
  const settling = useRef(false);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldDirection = useRef<1 | -1 | null>(null);
  const queuedTurns = useRef<(1 | -1)[]>([]);
  const latestGo = useRef<
    (direction: 1 | -1, quick?: boolean, count?: number) => void
  >(() => {});
  function stopGathering() {
    if (packetTimer.current) clearTimeout(packetTimer.current);
    packetTimer.current = null;
    gatheringPacket.current = null;
  }
  function stopHolding() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    heldDirection.current = null;
  }
  const latestChange = useRef(onPageChange);
  latestChange.current = onPageChange;
  const current = Math.max(0, Math.min(page, pages.length - 1));

  useEffect(() => {
    const element = book.current;
    const repaint = () => setRevision(value => value + 1);
    element?.addEventListener("load", repaint, true);
    return () => element?.removeEventListener("load", repaint, true);
  }, []);

  useEffect(
    () => progress.on("change", (value) => {
      // A backward turn starts at 1. Do not apply that value to the previous
      // leaf while React is still preparing the next turn's textures.
      if (preparedTurn.current === activeTurn.current)
        renderer.current?.render(value);
    }),
    [progress],
  );
  useEffect(() => {
    const element = book.current;
    const host = canvasHost.current;
    if (!element || !host) {
      setReady(false);
      return;
    }
    let disposed = false;
    let generation = 0;
    let lastSize = "";
    const resize = async () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      const size = `${width}:${height}`;
      if (!width || !height || size === lastSize) return;
      lastSize = size;
      if (reduced) {
        setReady(false);
        setPresented(true);
        return;
      }
      const ticket = ++generation;
      animation.current?.stop();
      queuedTurns.current = [];
      stopGathering();
      stopHolding();
      activeTurn.current = null;
      settling.current = false;
      setTurn(null);
      setReady(false);
      setPresented(false);
      renderer.current?.dispose();
      renderer.current = null;
      try {
        const [module] = await Promise.all([
          import("./mobile-paper-renderer"),
          document.fonts.ready,
          ...Array.from(element.querySelectorAll('img'), image => image.decode().catch(() => {})),
        ]);
        if (disposed || ticket !== generation) return;
        renderer.current = module.createPaperRenderer(host, width, height);
        setGround(renderer.current.groundFootprint);
        setRevision((value) => value + 1);
      } catch {
        // Reading and page controls also work on devices without WebGL.
        if (!disposed && ticket === generation) { setReady(false); setPresented(true); }
      }
    };
    const contextLost = (event: Event) => {
      event.preventDefault();
      if (disposed) return;
      cancel();
      renderer.current?.dispose();
      renderer.current = null;
      setReady(false);
      setPresented(true);
    };
    host.addEventListener("webglcontextlost", contextLost, true);
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    void resize();
    return () => {
      disposed = true;
      observer.disconnect();
      host.removeEventListener("webglcontextlost", contextLost, true);
      stopHolding();
      stopGathering();
      queuedTurns.current = [];
      animation.current?.stop();
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, [reduced]);

  useLayoutEffect(() => {
    const engine = renderer.current;
    if (!engine || !front.current) return;
    engine.setPages(
      front.current,
      bottom.current || undefined,
      turn ? Math.min(turn.from, turn.to) : current,
      cover.current || undefined,
      pages.length,
      turn ? Math.abs(turn.to - turn.from) : 1,
    );
    preparedTurn.current = turn;
    engine.render(turn ? progress.get() : 0);
    setReady(true);
    setPresented(true);
  }, [turn, current, pages, revision, progress]);

  function cancel() {
    stopHolding();
    stopGathering();
    queuedTurns.current = [];
    animation.current?.stop();
    activeTurn.current = null;
    settling.current = false;
    gesture.current = null;
    setTurn(null);
    setRevision((value) => value + 1);
  }
  useEffect(() => {
    window.addEventListener("blur", cancel);
    return () => window.removeEventListener("blur", cancel);
  }, []);

  function begin(direction: 1 | -1, count = 1) {
    if (activeTurn.current || settling.current) return null;
    const to = packetTarget(current, direction, count, pages.length - 1);
    if (to === current) return null;
    const next: Turn = {
      from: current,
      to,
      direction,
      front: pages[direction === 1 ? current : to],
      under: pages[direction === 1 ? to : current],
    };
    activeTurn.current = next;
    progress.set(direction === 1 ? 0 : 1);
    setTurn(next);
    return next;
  }

  useEffect(() => {
    if (turn || activeTurn.current || !queuedTurns.current.length) return;
    // Wait for the committed page and its textures before starting the next
    // requested leaf. Repeated taps are retained while the current leaf turns.
    const frame = requestAnimationFrame(() => {
      if (activeTurn.current || settling.current) return;
      const queue = queuedTurns.current;
      const direction = queue[0];
      if (!direction) return;
      let count = 1;
      while (queue[count] === direction) count++;
      const to = packetTarget(current, direction, count, pages.length - 1);
      const consumed = Math.abs(to - current);
      queue.splice(0, consumed || count);
      if (consumed) latestGo.current(direction, true, consumed);
    });
    return () => cancelAnimationFrame(frame);
  }, [turn, current]);

  function settle(next: Turn, complete: boolean, quick = false) {
    stopGathering();
    settling.current = true;
    animation.current?.stop();
    acceleratedTurn.current = quick ? next : null;
    const target = complete === (next.direction === 1) ? 1 : 0;
    const duration = quick
      ? RAPID_TURN_SECONDS
      : pageTurnDuration(Math.min(next.from, next.to));
    animation.current = animate(progress, target, {
      duration: Math.max(
        quick ? 0.18 : 0.32,
        duration * Math.sqrt(Math.abs(target - progress.get())),
      ),
      ease: quick ? [0.2, 0, 0.3, 1] : [0.42, 0, 0.35, 1],
      onComplete: () => {
        if (complete) latestChange.current(next.to);
        activeTurn.current = null;
        settling.current = false;
        setTurn(null);
        if (heldDirection.current && gesture.current) {
          holdTimer.current = setTimeout(() => {
            if (heldDirection.current && gesture.current)
              latestGo.current(heldDirection.current);
          }, HOLD_REPEAT_DELAY_MS);
        }
      },
    });
  }

  function go(direction: 1 | -1, quick = false, count = 1) {
    if (!presented) return;
    const active = activeTurn.current;
    if (active || settling.current) {
      if (!active || !settling.current) return;
      const requested =
        active.to +
        queuedTurns.current.reduce<number>((sum, step) => sum + step, 0);
      if (requested + direction < 0 || requested + direction >= pages.length)
        return;
      const travelled = active.direction === 1
        ? progress.get()
        : 1 - progress.get();
      if (
        direction === active.direction && !queuedTurns.current.length &&
        Math.min(active.from, active.to) > 0 &&
        (gatheringPacket.current === active || travelled < 0.22)
      ) {
        const to = packetTarget(
          active.from,
          direction,
          Math.abs(active.to - active.from) + 1,
          pages.length - 1,
        );
        if (to !== active.to) {
          animation.current?.stop();
          stopGathering();
          const packet: Turn = {
            ...active,
            to,
            front: pages[direction === 1 ? active.from : to],
            under: pages[direction === 1 ? to : active.from],
          };
          activeTurn.current = packet;
          gatheringPacket.current = packet;
          acceleratedTurn.current = null;
          setTurn(packet);
          packetTimer.current = setTimeout(() => {
            if (activeTurn.current === packet) settle(packet, true, true);
          }, RAPID_CLICK_WINDOW_MS);
          return;
        }
      }
      queuedTurns.current.push(direction);
      // A late tap becomes the next packet; never insert sheets mid-curl.
      if (acceleratedTurn.current !== active) settle(active, true, true);
      return;
    }
    const to = packetTarget(current, direction, count, pages.length - 1);
    if (reduced || !renderer.current) {
      onPageChange(to);
      return;
    }
    if (!gesture.current) renderer.current.setGrab(0);
    const next = begin(direction, count);
    if (next) settle(next, true, quick);
  }

  latestGo.current = go;

  function release(event: React.PointerEvent, cancelled = false) {
    stopHolding();
    const drag = gesture.current;
    if (!drag || drag.id !== event.pointerId) return;
    gesture.current = null;
    if (book.current?.hasPointerCapture(event.pointerId))
      book.current.releasePointerCapture(event.pointerId);
    suppressClick.current = drag.moved;
    const next = activeTurn.current;
    if (next && !settling.current) {
      const distance =
        next.direction === 1 ? progress.get() : 1 - progress.get();
      settle(
        next,
        !cancelled &&
          (distance > 0.15 ||
            (-drag.velocity * next.direction > 0.45 &&
              Math.abs(event.clientX - drag.x) > 32)),
      );
    } else if (
      !cancelled &&
      drag.axis === "x" &&
      Math.abs(event.clientX - drag.x) > 40
    ) {
      go(event.clientX < drag.x ? 1 : -1);
    }
  }

  function jumpTo(next: number) {
    if (!presented) return;
    if (!activeTurn.current) {
      queuedTurns.current = [];
      onPageChange(Math.max(0, Math.min(pages.length - 1, next)));
    }
  }

  return (
    <div className={`mobile-book-reader ${presented ? 'is-presented' : 'is-preparing'}`} aria-busy={!presented}>
      <div
        ref={book}
        className={`mobile-folded-book ${ready ? "has-paper-renderer" : ""} ${turn ? "is-turning" : ""}`}
        role="group"
        aria-label="Sketchbook. Tap the page or swipe to turn. Use the left edge to go back."
        tabIndex={presented ? 0 : -1}
        onPointerDown={(event) => {
          if (
            !event.isPrimary ||
            (event.pointerType === "mouse" && event.button !== 0)
          )
            return;
          if (
            (event.target as HTMLElement).closest(
              "button:not(.mobile-book-edge)",
            )
          )
            return;
          suppressClick.current = false;
          if (settling.current) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          renderer.current?.setGrab(
            1 - (2 * (event.clientY - bounds.top)) / bounds.height,
          );
          gesture.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            lastX: event.clientX,
            time: event.timeStamp,
            velocity: 0,
            axis: null,
            moved: false,
          };
          holdTimer.current = setTimeout(() => {
            const drag = gesture.current;
            if (!drag || drag.moved) return;
            heldDirection.current =
              event.clientX - bounds.left < bounds.width * 0.22 && current > 0
                ? -1
                : 1;
            drag.moved = true;
            book.current?.setPointerCapture(drag.id);
            suppressClick.current = true;
            latestGo.current(heldDirection.current);
          }, HOLD_START_DELAY_MS);
        }}
        onPointerMove={(event) => {
          const drag = gesture.current;
          if (!drag || event.pointerId !== drag.id) return;
          if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 7)
            stopHolding();
          if (settling.current) return;
          const dx = event.clientX - drag.x;
          const dy = event.clientY - drag.y;
          if (Math.max(Math.abs(dx), Math.abs(dy)) > 7) drag.moved = true;
          if (!drag.axis && drag.moved)
            drag.axis = Math.abs(dx) > Math.abs(dy) * 1.15 ? "x" : "y";
          if (drag.axis !== "x") return;
          event.preventDefault();
          if (!event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.setPointerCapture(event.pointerId);
          const dt = event.timeStamp - drag.time;
          if (dt > 0) drag.velocity = (event.clientX - drag.lastX) / dt;
          drag.lastX = event.clientX;
          drag.time = event.timeStamp;
          if (reduced || !renderer.current) return;
          const next = activeTurn.current || begin(dx < 0 ? 1 : -1);
          if (!next) return;
          const distance = Math.max(
            0,
            Math.min(
              1,
              (-dx * next.direction) / (event.currentTarget.clientWidth * 1.2),
            ),
          );
          progress.set(next.direction === 1 ? distance : 1 - distance);
        }}
        onPointerUp={(event) => release(event)}
        onPointerCancel={(event) => release(event, true)}
        onLostPointerCapture={(event) => {
          if (gesture.current) release(event, true);
        }}
        onClick={(event) => {
          if (
            suppressClick.current ||
            (event.target as HTMLElement).closest("button")
          )
            return;
          const rect = event.currentTarget.getBoundingClientRect();
          go(
            event.clientX - rect.left < rect.width * 0.22 && current > 0
              ? -1
              : 1,
          );
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (["ArrowRight", "ArrowLeft", "Enter", " "].includes(event.key)) {
            event.preventDefault();
            go(event.key === "ArrowLeft" ? -1 : 1);
          }
          if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            jumpTo(event.key === "Home" ? 0 : pages.length - 1);
          }
        }}
      >
        <span className="mobile-book-css-ground" aria-hidden="true" style={ground ? {
          left: `${ground.left*100}%`, top: `${ground.top*100}%`, width: `${ground.width*100}%`, height: `${ground.height*100}%`,
          borderRadius: `0 ${ground.radius}px ${ground.radius}px 0`,
          boxShadow: `${ground.offsetX}px ${ground.offsetY}px ${ground.blur}px rgba(20,20,20,.075)`,
        } : undefined} />
        <span className="mobile-book-binding" aria-hidden="true" />
        <div
          className="mobile-book-under-source"
          aria-hidden="true"
          ref={(element) => {
            cover.current = element;
            if (element) element.inert = true;
          }}
        >
          {pages[0]}
        </div>
        <span className="mobile-book-paper-edges" aria-hidden="true" />
        <div
          className="mobile-book-under-source"
          aria-hidden="true"
          ref={(element) => {
            bottom.current = element;
            if (element) element.inert = true;
          }}
        >
          {turn?.under ?? pages[Math.min(current + 1, pages.length - 1)]}
        </div>
        <div
          ref={front}
          className="mobile-book-resting-page"
          aria-hidden={turn ? true : undefined}
        >
          {turn ? turn.front : pages[current]}
        </div>
        <div
          ref={canvasHost}
          className="mobile-book-canvas"
          aria-hidden="true"
        />
        <button
          className="mobile-book-edge mobile-book-edge-left"
          aria-label="Previous page"
          disabled={!presented || (turn?.to ?? current) === 0}
          onClick={(event) => {
            if (event.detail === 0 || !suppressClick.current) go(-1);
          }}
        />
        <button
          className="mobile-book-edge mobile-book-edge-right"
          aria-label={current === 0 ? "Open the sketchbook" : "Turn the page"}
          disabled={!presented || (turn?.to ?? current) >= pages.length - 1}
          onClick={(event) => {
            if (event.detail === 0 || !suppressClick.current) go(1);
          }}
        />
      </div>
      <nav className="mobile-book-navigation is-minimal" aria-label="Sketchbook pages">
        <button
          className="mobile-icon-button"
          aria-label="Previous sketch"
          disabled={!presented || current === 0 || (turn?.to ?? current) === 0}
          onClick={() => go(-1)}
        >
          <PikaChevron direction="left" />
        </button>
        <span
          className="mobile-book-announcement"
          aria-live="polite"
          aria-atomic="true"
        >
          {turn && Math.abs(turn.to - turn.from) > 1
            ? `Turning ${Math.abs(turn.to - turn.from)} pages ${turn.direction === 1 ? "forward" : "backward"}`
            : current === 0
              ? "Sketchbook cover"
              : `Page ${current} of ${pages.length - 1}`}
        </span>
        <button
          className="mobile-icon-button"
          aria-label={current === 0 ? "Open the book" : "Next sketch"}
          disabled={!presented || current >= pages.length - 1 || (turn?.to ?? current) >= pages.length - 1}
          onClick={() => go(1)}
        >
          <PikaChevron direction="right" />
        </button>
      </nav>
    </div>
  );
}
