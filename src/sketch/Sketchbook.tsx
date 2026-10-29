import { lazy, Suspense, useMemo, useState } from 'react';
import { MobileFoldedBook } from '../components/MobileFoldedBook';
import { SketchPage, sketches } from './SketchPage';
const DesktopSketchbook = lazy(() => import('./DesktopSketchbook'));
export default function Sketchbook({mobile}: {mobile: boolean}) {
  const [page, setPage] = useState(0);
  const pages = useMemo(() => [<SketchPage cover key="cover" />, ...sketches.map((_, i) => <SketchPage key={i} page={i + 1} />)], []);
  return <main className={`sketchbook-shell ${mobile ? 'sketchbook-mobile is-mobile' : 'is-desktop'}`} aria-label="Sketchbook">
    {mobile ? <section className="sketch-mobile-content" aria-label="Sketchbook reader"><MobileFoldedBook pages={pages} page={page} onPageChange={setPage} /></section> : <Suspense fallback={<span className="sr-only" role="status">Opening the sketchbook…</span>}><DesktopSketchbook /></Suspense>}
    <p className="sketch-demo-note">All sketches were generated with AI for this demo.</p>
  </main>;
}
