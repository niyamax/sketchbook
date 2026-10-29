import { forwardRef } from 'react';
import { BookCover } from '../components/BookCover';
import { sketches } from './sketches';
export { sketches } from './sketches';
export const SketchPage = forwardRef<HTMLDivElement, {cover?: boolean; page?: number; coverSide?: 'front' | 'back'}>(function SketchPage({cover = false, page = 0, coverSide = 'front'}, ref) {
  const sketch = sketches[page - 1];
  return <div ref={ref} data-density={cover ? 'hard' : 'soft'} className={`sketch-page ${cover ? `is-cover is-${coverSide}-cover` : page % 2 ? 'is-left' : 'is-right'}`}>
    {cover ? <BookCover className="mobile-book-cover" /> : <article className="mobile-book-paper sketch-paper" aria-label={`Sketchbook page ${page}`}>
      {sketch?.src && <img className="sketch-illustration" src={`${import.meta.env.BASE_URL}${sketch.src.slice(1)}`} alt={sketch.alt} draggable={false} decoding="async" />}
    </article>}
  </div>;
});
