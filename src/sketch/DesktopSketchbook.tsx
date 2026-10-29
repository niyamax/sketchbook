import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import HTMLFlipBook from 'react-pageflip';
import { PikaChevron } from './PikaChevron';
import { useReducedMotion } from 'motion/react';
import { SketchPage, sketches } from './SketchPage';
import { PAGE_ASPECT } from './geometry';
import {restingBookPose} from './book-pose';
import { installDesktopLighting, type LightingEngine } from './desktop-lighting';
function dimensions() {
  const width = Math.floor(Math.min(440, (window.innerWidth - 160) / 2, (window.innerHeight - 120) / PAGE_ASPECT));
  return { width: Math.max(180, width), height: Math.round(Math.max(180, width) * PAGE_ASPECT) };
}
export default function DesktopSketchbook() {
  const book = useRef<HTMLFlipBookHandle | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const lighting = useRef<ReturnType<typeof installDesktopLighting> | null>(null);
  useEffect(() => () => lighting.current?.dispose(), []);
  const [presented, setPresented] = useState(false);
  const revealFrame = useRef(0);
  const revealGeneration = useRef(0);
  useEffect(() => () => { revealGeneration.current++; cancelAnimationFrame(revealFrame.current); }, []);
  const [size, setSize] = useState(dimensions);
  const [page, setPage] = useState(0);
  const reduced = useReducedMotion();
  const last = sketches.length + 1;
  useLayoutEffect(() => { setPresented(false); }, [size.width,size.height]);
  async function presentBook() {
    const generation = ++revealGeneration.current;
    const cover = frame.current?.querySelector<HTMLImageElement>('.cover-stock-image');
    await cover?.decode().catch(() => {});
    if (generation !== revealGeneration.current) return;
    // PageFlip places its cover on its first render frame. Reveal the final
    // layout, rather than the unpositioned DOM children before initialization.
    revealFrame.current = requestAnimationFrame(() => {
      revealFrame.current = requestAnimationFrame(() => {
        if (generation === revealGeneration.current) setPresented(true);
      });
    });
  }
  function turn(direction: -1 | 1) {
    if (!presented) return;
    if (direction < 0 && page > 0) book.current?.pageFlip().flipPrev();
    if (direction > 0 && page < last) book.current?.pageFlip().flipNext();
  }
  useEffect(() => { const resize = () => setSize(dimensions()); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') { event.preventDefault(); turn(1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); turn(-1); }
    }
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [page,presented]);
  const closed = page === 0 || page === last;
  const pose=restingBookPose(page,sketches.length+2);
  return <div className={`sketch-desktop ${closed ? 'is-closed' : ''}`}>
    <div ref={frame} className={`sketch-desktop-frame ${presented ? 'is-presented' : 'is-preparing'}`} aria-busy={!presented} style={{width: size.width * 2, height: size.height}}>
      <div className="sketch-desktop-book" style={{transform: `translateX(${pose.center*size.width}px)`}}>
        <HTMLFlipBook key={`${size.width}-${size.height}`} ref={book} width={size.width} height={size.height}
          size="fixed" minWidth={180} maxWidth={440} minHeight={225} maxHeight={550}
          startPage={page} drawShadow={!reduced} flippingTime={reduced ? 1 : 1000} usePortrait={false} startZIndex={0}
          autoSize renderOnlyPageLengthChange maxShadowOpacity={.16} showCover mobileScrollSupport clickEventForward useMouseEvents
          swipeDistance={30} showPageCorners disableFlipByClick={false} className="sketch-flipbook" style={{margin:'0 auto'}}
          onInit={() => {
            void presentBook();
            lighting.current?.dispose();
            if (book.current && frame.current) lighting.current = installDesktopLighting(book.current.pageFlip(), frame.current);
            lighting.current?.update();
          }}
          onUpdate={() => {
            lighting.current?.dispose();
            if (book.current && frame.current) lighting.current = installDesktopLighting(book.current.pageFlip(), frame.current);
            lighting.current?.update();
          }}
          onChangeState={(event: {data: string}) => lighting.current?.update(event.data)}
          onFlip={(event: {data: number}) => { setPage(event.data); lighting.current?.update(); }}>
          <SketchPage cover />
          {sketches.map((_, index) => <SketchPage key={index} page={index + 1} />)}
          <SketchPage cover coverSide="back" />
        </HTMLFlipBook>
      </div>
    <nav className="sketch-side-navigation" style={{width:pose.width*size.width}} aria-label="Sketchbook pages">
      <button type="button" aria-label="Previous pages" disabled={!presented || page === 0} onClick={() => turn(-1)}><PikaChevron direction="left" /></button>
      <span className="sr-only" aria-live="polite">{page === 0 ? 'Front cover' : page === last ? 'Back cover' : `Pages ${page}–${page + 1}`}</span>
      <button type="button" aria-label={page === 0 ? 'Open the sketchbook' : 'Next pages'} disabled={!presented || page === last} onClick={() => turn(1)}><PikaChevron direction="right" /></button>
    </nav>
    </div>
  </div>;
}
type HTMLFlipBookHandle = {pageFlip: () => LightingEngine & {flipPrev: () => void; flipNext: () => void}};
