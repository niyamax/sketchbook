// Pikaicons free Stroke chevrons, integrated into the sketchbook reader.
// Source: https://pikaicons.com/icons/free/stroke.svg
export function PikaChevron({direction}: {direction: 'left' | 'right'}) {
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    {direction === 'left' ? <path transform="translate(10.13 8.14)" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M4 0C2.54 1.06 1.23 2.31 0.11 3.7C-0.04 3.88 -0.04 4.12 0.11 4.3C1.23 5.69 2.54 6.94 4 8" /> : <path transform="translate(10 8.14)" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M0 0C1.46 1.06 2.77 2.31 3.89 3.7C4.04 3.88 4.04 4.12 3.89 4.3C2.77 5.69 1.46 6.94 0 8" />}
  </svg>;
}
