import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { PikaChevron } from './PikaChevron';
import { SketchPage, sketches } from './SketchPage';
import { PAGE_ASPECT } from './geometry';
import { restingBookPose, type BookPose } from './book-pose';
import { projectShadow } from './lighting';
import type { createDesktopPaperRenderer } from '../components/desktop-paper-renderer';
function dimensions() { const width = Math.max(180, Math.floor(Math.min(440, (innerWidth - 160) / 2, (innerHeight - 120) / PAGE_ASPECT))); return { width, height: Math.round(width * PAGE_ASPECT) }; }
type Turn = {
    from: number;
    to: number;
    lower: number;
    progress: number;
    grab: number;
};
type Drag = {
    id: number;
    x: number;
    y: number;
    direction: 1 | -1;
    moved: boolean;
};
const ease = (p: number) => p * p * (3 - 2 * p);
export default function DesktopSketchbook() {
    const [size, setSize] = useState(dimensions), [page, setPage] = useState(0), [presented, setPresented] = useState(false), [webgl, setWebgl] = useState(false);
    const frame = useRef<HTMLDivElement>(null), host = useRef<HTMLDivElement>(null), sources = useRef<HTMLDivElement>(null), nav = useRef<HTMLElement>(null), dom = useRef<HTMLDivElement>(null), ground = useRef<HTMLDivElement>(null);
    const engine = useRef<ReturnType<typeof createDesktopPaperRenderer> | null>(null), current = useRef(0), desired = useRef(0), turn = useRef<Turn | null>(null), drag = useRef<Drag | null>(null), animation = useRef(0), ready = useRef(false), generation = useRef(0);
    const drive = useRef<() => void>(() => { }), last = Math.ceil(sketches.length / 2) + 2, reduced = useReducedMotion();
    const pageIndex = useCallback((spread: number) => spread === 0 ? 0 : spread === last ? last * 2 - 1 : spread * 2 - 1, [last]);
    const apply = useCallback((pose: BookPose) => {
        if (nav.current)
            nav.current.style.width = `${pose.width * size.width}px`;
        if (dom.current)
            dom.current.style.transform = `translateX(${pose.center * size.width}px)`;
        if (ground.current) {
            ground.current.style.transform = `translateX(${pose.center * size.width}px)`;
            const offset = projectShadow({ x: 0, y: 0, z: size.width * .025 });
            Array.from(ground.current.children).forEach((el, index) => Object.assign((el as HTMLElement).style, { opacity: String(index === 0 ? pose.leftContact : pose.rightContact), boxShadow: `${offset.x}px ${offset.y}px ${size.width * .018}px rgba(20,20,20,.075)` }));
        }
    }, [size.width]);
    const rest = useCallback((spread: number) => {
        const pose = engine.current?.showRest(spread) ?? restingBookPose(pageIndex(spread), last * 2);
        apply(pose);
        nav.current?.classList.remove('is-cover-moving');
    }, [apply, pageIndex]);
    function paint(active: Turn) { if (engine.current)
        apply(engine.current.showTurn(active.lower, active.progress, active.grab)); }
    function animateTurn(active: Turn, end: number) {
        cancelAnimationFrame(animation.current);
        turn.current = active;
        const start = performance.now(), from = active.progress, duration = Math.max(120, 1000 * Math.abs(end - from));
        const step = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            active.progress = from + (end - from) * ease(t);
            paint(active);
            if (t < 1) {
                animation.current = requestAnimationFrame(step);
                return;
            }
            animation.current = 0;
            const destination = end === 1 ? active.lower + 1 : active.lower;
            current.current = destination;
            turn.current = null;
            rest(destination);
            setPage(destination);
            drive.current();
        };
        animation.current = requestAnimationFrame(step);
    }
    function prepare(direction: 1 | -1) { const from = current.current, to = from + direction; if (to < 0 || to > last)
        return null; const active: Turn = { from, to, lower: Math.min(from, to), progress: direction === 1 ? 0 : 1, grab: 0 }; turn.current = active; if (active.lower === 0 || active.lower === last - 1)
        nav.current?.classList.add('is-cover-moving'); paint(active); return active; }
    drive.current = () => {
        if (!ready.current || turn.current || drag.current || desired.current === current.current)
            return;
        if (reduced || !engine.current) {
            current.current = desired.current;
            rest(current.current);
            setPage(current.current);
            return;
        }
        const direction = desired.current > current.current ? 1 : -1, active = prepare(direction);
        if (active)
            animateTurn(active, direction === 1 ? 1 : 0);
    };
    const request = useCallback((direction: 1 | -1) => { if (!ready.current)
        return; desired.current = Math.max(0, Math.min(last, desired.current + direction)); drive.current(); }, [last]);
    useEffect(() => { const resize = () => setSize(dimensions()); addEventListener('resize', resize); return () => removeEventListener('resize', resize); }, []);
    useEffect(() => { function key(event: KeyboardEvent) { if ((event.target as HTMLElement).closest('input,textarea,[contenteditable=true]'))
        return; if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        request(event.key === 'ArrowRight' ? 1 : -1);
    } } document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key); }, [request]);
    useLayoutEffect(() => {
        let disposed = false;
        const ticket = ++generation.current;
        ready.current = false;
        setPresented(false);
        setWebgl(false);
        cancelAnimationFrame(animation.current);
        turn.current = null;
        drag.current = null;
        desired.current = current.current;
        engine.current?.dispose();
        engine.current = null;
        rest(current.current);
        void (async () => {
            const elements = Array.from(sources.current?.children ?? []) as HTMLElement[];
            const module = (!reduced ? import('../components/desktop-paper-renderer').catch(() => null) : Promise.resolve(null));
            await Promise.all(elements.flatMap(el => Array.from(el.querySelectorAll('img'), image => image.decode().catch(() => { }))));
            if (disposed || ticket !== generation.current)
                return;
            try {
                const loaded = await module;
                if (disposed || ticket !== generation.current)
                    return;
                if (loaded && host.current)
                    engine.current = loaded.createDesktopPaperRenderer(host.current, size.width, size.height, elements);
            }
            catch {
                engine.current?.dispose();
                engine.current = null;
            }
            if (disposed || ticket !== generation.current) {
                engine.current?.dispose();
                return;
            }
            rest(current.current);
            setWebgl(!!engine.current);
            ready.current = true;
            setPresented(true);
        })();
        const contextLost = (event: Event) => { event.preventDefault(); cancelAnimationFrame(animation.current); turn.current = null; drag.current = null; desired.current = current.current; engine.current?.dispose(); engine.current = null; setWebgl(false); rest(current.current); };
        const canvasHost = host.current;
        canvasHost?.addEventListener('webglcontextlost', contextLost, true);
        return () => { disposed = true; ready.current = false; cancelAnimationFrame(animation.current); canvasHost?.removeEventListener('webglcontextlost', contextLost, true); engine.current?.dispose(); engine.current = null; };
    }, [size.width, size.height, reduced, rest]);
    function release(event: React.PointerEvent<HTMLDivElement>, cancelled = false) {
        const gesture = drag.current;
        if (!gesture || gesture.id !== event.pointerId)
            return;
        drag.current = null;
        if (frame.current?.hasPointerCapture(event.pointerId))
            frame.current.releasePointerCapture(event.pointerId);
        const active = turn.current;
        if (!gesture.moved) {
            if (cancelled)
                return;
            if (active) {
                turn.current = null;
                rest(current.current);
            }
            request(gesture.direction);
            return;
        }
        if (!active)
            return;
        const distance = gesture.direction === 1 ? active.progress : 1 - active.progress;
        const complete = !cancelled && distance > .15;
        desired.current = complete ? active.to : active.from;
        animateTurn(active, complete ? (gesture.direction === 1 ? 1 : 0) : (gesture.direction === 1 ? 0 : 1));
    }
    const closed = page === 0 || page === last, pose = restingBookPose(pageIndex(page), last * 2), left = page === 0 ? null : page === last ? last * 2 - 1 : page * 2 - 1, right = page === last ? null : page === 0 ? 0 : page * 2;
    const face = (index: number | null) => index === null ? null : index < 2 || index >= last * 2 - 2 ? <SketchPage cover coverSide={index === 0 || index === last * 2 - 2 ? 'front' : 'back'}/> : <SketchPage page={index-1} side={index%2===0?'right':'left'}/>;
    const announcement=page===0?'Front cover':page===last?'Back cover':page===1?'Inside front cover · Page 1':page===last-1?(sketches.length%2?'Inside back cover':'Page '+sketches.length+' · Inside back cover'):`Pages ${page*2-2}–${Math.min(page*2-1,sketches.length)}`;
    return <div className={`sketch-desktop ${closed ? 'is-closed' : ''}`}>
    <div ref={frame} className={`sketch-desktop-frame ${presented ? 'is-presented' : 'is-preparing'} ${webgl ? 'has-desktop-paper' : ''}`} style={{ width: size.width * 2, height: size.height }} aria-busy={!presented} role="group" aria-label="Sketchbook. Use the arrows or drag a page to turn." tabIndex={presented ? 0 : -1} onPointerDown={event => { if (!event.isPrimary || event.button !== 0 || (event.target as HTMLElement).closest('button') || !ready.current || turn.current)
        return; const rect = event.currentTarget.getBoundingClientRect(), x = event.clientX - rect.left; const bounds = restingBookPose(pageIndex(current.current), last * 2); const middle = size.width; if (Math.abs(x - middle) > bounds.width * size.width / 2)
        return; const direction = current.current === 0 ? 1 : current.current === last ? -1 : x > middle ? 1 : -1; drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, direction, moved: false }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { const gesture = drag.current; if (!gesture || gesture.id !== event.pointerId || !engine.current || reduced)
        return; const dx = event.clientX - gesture.x; if (!gesture.moved && Math.abs(dx) < 6)
        return; gesture.moved = true; const active = turn.current ?? prepare(gesture.direction); if (!active)
        return; const distance = Math.max(0, Math.min(1, -dx * gesture.direction / (size.width * 2))); active.progress = gesture.direction === 1 ? distance : 1 - distance; const rect = event.currentTarget.getBoundingClientRect(); active.grab = 1 - 2 * (gesture.y - rect.top) / size.height; paint(active); }} onPointerUp={event => release(event)} onPointerCancel={event => release(event, true)} onLostPointerCapture={event => { if (drag.current)
        release(event, true); }}>
      <div ref={ground} className="sketch-spread-ground" aria-hidden="true"><span /><span /></div>
      <div ref={dom} className="sketch-desktop-dom" style={{ transform: `translateX(${pose.center * size.width}px)` }}><div className="sketch-dom-page">{face(left)}</div><div className="sketch-dom-page">{face(right)}</div></div>
      <div ref={sources} className="sketch-page-sources" aria-hidden="true">{Array.from({ length: last * 2 }, (_, index) => <div key={index} className="sketch-page-source" style={{ width: size.width, height: size.height }}>{face(index)}</div>)}</div>
      <div ref={host} className="sketch-desktop-canvas" aria-hidden="true"/>
      <nav ref={nav} className="sketch-side-navigation" style={{ width: pose.width * size.width }} aria-label="Sketchbook pages">
        <button type="button" aria-label={page===1?'Close the sketchbook':page===last?'Open the sketchbook':'Previous pages'} disabled={!presented || page === 0} onClick={() => request(-1)}><PikaChevron direction="left"/></button>
        <span className="sr-only" aria-live="polite">{announcement}</span>
        <button type="button" aria-label={page === 0 ? 'Open the sketchbook' : page===last-1?'Close the sketchbook':'Next pages'} disabled={!presented || page === last} onClick={() => request(1)}><PikaChevron direction="right"/></button>
      </nav>
    </div>
  </div>;
}
